/**
 * DownloadManager orchestrates downloading of media (songs and
 * advertisements) from remote URLs into the browser's cache.  It
 * mirrors the behaviour of the Android `DownloadService` class in a
 * simplified manner suitable for the webOS environment.  The
 * manager maintains a persistent queue of items to download, resumes
 * progress across reboots, updates the local IndexedDB stores and
 * notifies the server of completed downloads via the API layer.
 *
 * The queue persists in `localStorage` under the key
 * `download_manager_state`.  Each entry in the queue has the shape
 * `{ type: 'song'|'ad', data: <song or ad record> }`.  Completed and
 * failed lists are retained for inspection.
 *
 * Usage:
 *   const dm = new DownloadManager();
 *   dm.addSongsToQueue(listOfSongRecords);
 *   dm.addAdsToQueue(listOfAdRecords);
 *   dm.start();
 */
(function() {
  class DownloadManager {
    constructor() {
      this.songsDataSource = new SongsDataSource();
      this.advertisementDataSource = new AdvertisementDataSource();
      this._isRunning = false;
      this._downloadTimeoutMs = 20000;
      this._cooldownUntil = 0;
      // Load persisted state from preferences/localStorage
      const saved = prefs.getString('download_manager_state', null);
      if (saved) {
        try {
          const state = JSON.parse(saved);
          this.queue = Array.isArray(state.queue) ? state.queue : [];
          this.completed = Array.isArray(state.completed) ? state.completed : [];
          this.failed = Array.isArray(state.failed) ? state.failed : [];
          this.currentIndex = typeof state.currentIndex === 'number' ? state.currentIndex : 0;
        } catch (err) {
          console.error('Failed to parse download manager state:', err);
          this.queue = [];
          this.completed = [];
          this.failed = [];
          this.currentIndex = 0;
        }
      } else {
        this.queue = [];
        this.completed = [];
        this.failed = [];
        this.currentIndex = 0;
      }
      this._queuedKeys = new Set();
      this._rebuildQueueKeySet();
      this._initStorageHints().catch(function () {});
    }

    _entryKey(type, data) {
      if (type === 'song') {
        return 'song:' + String((data && (data.title_id || data.titleId || data.song_url || data.TitleUrl)) || '');
      }
      if (type === 'ad') {
        return 'ad:' + String((data && (data.adv_id || data.AdvtId || data.adv_file_url || data.AdvtFilePath)) || '');
      }
      return type + ':' + String(Date.now());
    }

    _rebuildQueueKeySet() {
      this._queuedKeys.clear();
      var allEntries = []
        .concat(Array.isArray(this.queue) ? this.queue : [])
        .concat(Array.isArray(this.completed) ? this.completed : []);
      for (var i = 0; i < allEntries.length; i++) {
        var entry = allEntries[i];
        if (!entry || !entry.type) continue;
        this._queuedKeys.add(this._entryKey(entry.type, entry.data));
      }
    }

    /**
     * Persist the current state of the download manager into
     * localStorage.  This method should be invoked after any change
     * to the queue, completed or failed lists or the current index.
     */
    _saveState() {
      const state = {
        queue: this.queue,
        completed: this.completed,
        failed: this.failed,
        currentIndex: this.currentIndex,
      };
      try {
        prefs.setString('download_manager_state', JSON.stringify(state));
      } catch (err) {
        console.error('Error saving download manager state:', err);
      }
    }

    /**
     * Add songs to the download queue.  Each song should be an object
     * conforming to the fields defined in SongsDataSource/createSongs.
     *
     * @param {Array} songs List of song records returned from the server.
     */
    addSongsToQueue(songs) {
      if (!Array.isArray(songs)) return;
      for (const s of songs) {
        if (!s) continue;
        if (!String((s.song_url || s.song_path || '')).trim()) {
          continue;
        }
        if (Number((s && s.is_downloaded) || 0) === 1 && s && s.song_path) {
          continue;
        }
        var key = this._entryKey('song', s);
        if (this._queuedKeys.has(key)) {
          continue;
        }
        this._queuedKeys.add(key);
        this.queue.push({ type: 'song', data: s });
      }
      this._saveState();
    }

    /**
     * Add advertisements to the download queue.  Each ad should be an
     * object conforming to the fields defined in AdvertisementDataSource.
     *
     * @param {Array} ads List of advertisement records returned from the server.
     */
    addAdsToQueue(ads) {
      if (!Array.isArray(ads)) return;
      for (const ad of ads) {
        if (!ad) continue;
        if (!String((ad.adv_file_url || ad.adv_path || '')).trim()) {
          continue;
        }
        if (Number((ad && ad.download_status) || 0) === 1 && ad && ad.adv_path) {
          continue;
        }
        var key = this._entryKey('ad', ad);
        if (this._queuedKeys.has(key)) {
          continue;
        }
        this._queuedKeys.add(key);
        this.queue.push({ type: 'ad', data: ad });
      }
      this._saveState();
    }

    isRunning() {
      return !!this._isRunning;
    }

    /**
     * Begin processing the download queue.  This method loops
     * sequentially over the queued items starting from the stored
     * currentIndex.  Downloads are performed one at a time to mirror
     * the Android implementation.  When the queue is exhausted the
     * manager attempts to notify the server about downloaded content.
     */
    async start() {
      await this._emitStorageSnapshot('before-download');

      if (this._cooldownUntil && Date.now() < this._cooldownUntil) {
        this._emitDownloadEvent({
          phase: 'storage',
          stage: 'cooldown',
          message: 'Low storage/network cooldown active. Retrying shortly.'
        });
        return;
      }

      // Guard against multiple concurrent calls
      if (this._isRunning) return;

      await this._pruneQueue();
      if (!Array.isArray(this.queue) || this.queue.length === 0) {
        this._emitDownloadEvent({
          phase: 'done',
          current: 0,
          total: 0,
          queue: { songs: 0, ads: 0, total: 0 },
          message: 'No pending downloads'
        });
        return;
      }

      this._isRunning = true;

      var queueStats = this._getQueueStats();
      var abortRemaining = false;

      try {
        while (this.currentIndex < this.queue.length) {
          const entry = this.queue[this.currentIndex];
          var entryKey = this._entryKey(entry.type, entry.data);
          var success = false;

          // Capped retry with exponential backoff
          var maxAttempts = 2;
          for (var attempt = 1; attempt <= maxAttempts && !success; attempt++) {
            try {
              this._emitDownloadEvent({
                phase: 'downloading',
                current: this.currentIndex + 1,
                total: this.queue.length,
                attempt: attempt,
                fileName: this._entryKey(entry.type, entry.data),
                itemType: entry.type,
                queue: queueStats
              });

              if (entry.type === 'song') {
                await this._downloadSong(entry.data);
              } else if (entry.type === 'ad') {
                await this._downloadAd(entry.data);
              }

              success = true;
            } catch (err) {
              console.error('Error downloading', entry, 'attempt', attempt, err);
              var errMsg = String((err && err.message) || '');
              if (errMsg.indexOf('Insufficient storage space for download') >= 0) {
                this._cooldownUntil = Date.now() + (2 * 60 * 1000);
                this._emitDownloadEvent({
                  phase: 'storage',
                  stage: 'low-storage-cooldown',
                  message: 'Storage is low. Pausing download queue for 2 minutes.'
                });
                abortRemaining = true;
                break;
              }
              if (attempt < maxAttempts) {
                var waitMs = this._retryDelayMs(attempt);
                await this._sleep(waitMs);
              }
            }
          }

          if (success) {
            this.completed.push(entry);
          } else {
            // keep key for current cycle to avoid immediate re-queue loops
            this.failed.push(entry);
          }

          this.currentIndex += 1;
          this._saveState();

          if (abortRemaining) {
            break;
          }
        }
      } finally {
        this._isRunning = false;
      }

      // After finishing all downloads send summary updates to the server.
      try {
        await this._notifyServerOfDownloads();
        await this._emitStorageSnapshot('after-download');
      } catch (err) {
        console.error('Error notifying server of downloads:', err);
      } finally {
        this._emitDownloadEvent({
          phase: 'done',
          current: this.queue.length,
          total: this.queue.length,
          queue: queueStats,
          message: this.failed.length > 0
            ? 'Download finished with partial failures'
            : 'Download complete'
        });

        this.queue = [];
        this.completed = [];
        this.failed = [];
        this.currentIndex = 0;
        this._rebuildQueueKeySet();
        this._saveState();
      }
    }

    _sleep(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    }

    _retryDelayMs(attemptNumber) {
      // 1s, 2s, 4s capped at 8s
      var delay = Math.pow(2, Math.max(0, attemptNumber - 1)) * 1000;
      return Math.min(delay, 8000);
    }

    _getQueueStats() {
      var songs = 0;
      var ads = 0;
      for (var i = 0; i < this.queue.length; i++) {
        var type = (this.queue[i] && this.queue[i].type) || '';
        if (type === 'song') songs += 1;
        if (type === 'ad') ads += 1;
      }
      return {
        songs: songs,
        ads: ads,
        total: songs + ads
      };
    }

    async _pruneQueue() {
      if (!Array.isArray(this.queue) || this.queue.length === 0) {
        this.queue = [];
        this.currentIndex = 0;
        this.failed = [];
        this.completed = [];
        this._rebuildQueueKeySet();
        this._saveState();
        return;
      }

      var filtered = [];
      var seen = new Set();

      for (var i = 0; i < this.queue.length; i++) {
        var entry = this.queue[i];
        if (!entry || !entry.type || !entry.data) continue;

        var key = this._entryKey(entry.type, entry.data);
        if (!key || key === 'song:' || key === 'ad:' || seen.has(key)) {
          continue;
        }

        if (entry.type === 'song') {
          var song = entry.data || {};
          var sUrl = String(song.song_url || song.song_path || '').trim();
          if (!sUrl) continue;
          if (Number(song.is_downloaded || 0) === 1 && song.song_path) continue;

          var titleId = String(song.title_id || song.titleId || '').trim();
          if (titleId) {
            try {
              var dl = await this.songsDataSource.getAllDownloadedSongs(titleId);
              if (Array.isArray(dl) && dl.length > 0) {
                continue;
              }
            } catch (_e) {
              // best effort
            }
          }
        } else if (entry.type === 'ad') {
          var ad = entry.data || {};
          var aUrl = String(ad.adv_file_url || ad.adv_path || '').trim();
          if (!aUrl) continue;
          if (Number(ad.download_status || 0) === 1 && ad.adv_path) continue;
        } else {
          continue;
        }

        seen.add(key);
        filtered.push(entry);
      }

      this.queue = filtered;
      this.currentIndex = 0;
      this.completed = [];
      this.failed = [];
      this._rebuildQueueKeySet();
      this._saveState();
    }

    async _initStorageHints() {
      try {
        if (!navigator || !navigator.storage) return;
        if (typeof navigator.storage.persist === 'function') {
          await navigator.storage.persist();
        }
        await this._emitStorageSnapshot('storage-ready');
      } catch (e) {
        // best effort
      }
    }

    async _emitStorageSnapshot(phase) {
      try {
        if (!navigator || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
          return;
        }
        var estimate = await navigator.storage.estimate();
        var quota = Number(estimate.quota || 0);
        var usage = Number(estimate.usage || 0);
        var free = Math.max(0, quota - usage);
        var toMb = function (v) { return Math.round(v / (1024 * 1024)); };

        this._emitDownloadEvent({
          phase: 'storage',
          stage: phase || 'unknown',
          message: 'Storage free: ' + toMb(free) + 'MB / ' + toMb(quota) + 'MB',
          storage: {
            freeBytes: free,
            usageBytes: usage,
            quotaBytes: quota,
            freeMB: toMb(free),
            quotaMB: toMb(quota)
          }
        });
      } catch (e) {
        // best effort
      }
    }

    async _assertEnoughStorage(requiredBytes) {
      try {
        if (!navigator || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
          return;
        }
        var estimate = await navigator.storage.estimate();
        var quota = Number(estimate.quota || 0);
        var usage = Number(estimate.usage || 0);
        var free = Math.max(0, quota - usage);
        var safetyBuffer = 5 * 1024 * 1024; // 5MB buffer (emulator has very small quota)
        if (free < (Number(requiredBytes || 0) + safetyBuffer)) {
          await this._emitStorageSnapshot('low-storage');
          throw new Error('Insufficient storage space for download');
        }
      } catch (err) {
        if (err && err.message === 'Insufficient storage space for download') {
          throw err;
        }
      }
    }
    _emitDownloadEvent(detail) {
      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('smc:download', { detail: detail || {} }));
        }
      } catch (e) {
        // best effort
      }
    }

    async _fetchWithTimeout(url, timeoutMs) {
      var controller = (typeof AbortController === 'function') ? new AbortController() : null;
      var timer = null;
      var timeout = Math.max(5000, Number(timeoutMs || 0) || this._downloadTimeoutMs);
      try {
        var options = {};
        if (controller) {
          options.signal = controller.signal;
        }

        var fetchPromise = fetch(url, options);
        var timeoutPromise = new Promise(function (_resolve, reject) {
          timer = setTimeout(function () {
            try {
              if (controller) controller.abort();
            } catch (_e) {}
            reject(new Error('Download timeout'));
          }, timeout);
        });

        return await Promise.race([fetchPromise, timeoutPromise]);
      } catch (err) {
        if (err && err.name === 'AbortError') {
          throw new Error('Download timeout');
        }
        throw err;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    }

    /**
     * Download a song and persist it to the browser cache.  Once the
     * download completes the corresponding SongsDataSource entry is
     * updated to reflect the downloaded status and path.  The server
     * is also notified of the new download.
     *
     * @param {Object} song Song record containing at least
     *   `title_id`, `titles` and `song_url`.
     */
    async _downloadSong(song) {
      if (!song) {
        throw new Error('Invalid song record');
      }
      const url = song.song_url || song.song_path;
      if (!url) {
        throw new Error('Invalid song url');
      }
      // Fetch the resource as a blob.
      // Support optional local dev proxy to avoid CORS restrictions.
      const fetchUrl = (window && window.PROXY_MEDIA_BASE) ? (window.PROXY_MEDIA_BASE + encodeURIComponent(url)) : url;
      const response = await this._fetchWithTimeout(fetchUrl, this._downloadTimeoutMs);
      if (!response.ok) {
        throw new Error('Network error downloading song');
      }
      const blob = await response.blob();
      await this._assertEnoughStorage(blob.size);
      // Store the response in the Cache API using the original URL as
      // the cache key.  Note: the browser isolates cached responses per
      // origin so this will not leak data across sites.
      const cache = await caches.open('downloads');
      await cache.put(url, new Response(blob));
      // Build a local path.  Since the Cache API does not expose a
      // filesystem path we record the original URL which will be
      // intercepted by the cache on subsequent fetches.
      const localPath = url;
      // Update the songs table: mark as downloaded and store path
      await this.songsDataSource.updateSongsListWithDownloadstatusandPath({
        title_id: song.title_id,
        is_downloaded: 1,
        song_path: localPath,
      });
      // Notify the server about this specific song download
      await this._notifyServerSongDownloaded(song);
    }

    /**
     * Download an advertisement into the cache.  Updates the
     * advertisement record in IndexedDB to set download_status=1 and
     * record the local path.  Notifies the server of the download.
     *
     * @param {Object} ad Advertisement record containing at least
     *   `_id`, `adv_file_url` and `adv_id`.
     */
    async _downloadAd(ad) {
      if (!ad) {
        throw new Error('Invalid advertisement record');
      }
      const url = ad.adv_file_url || ad.adv_path;
      if (!url) {
        throw new Error('Invalid advertisement url');
      }
      const fetchUrl = (window && window.PROXY_MEDIA_BASE) ? (window.PROXY_MEDIA_BASE + encodeURIComponent(url)) : url;
      const response = await this._fetchWithTimeout(fetchUrl, this._downloadTimeoutMs);
      if (!response.ok) {
        throw new Error('Network error downloading advertisement');
      }
      const blob = await response.blob();
      await this._assertEnoughStorage(blob.size);
      const cache = await caches.open('downloads');
      await cache.put(url, new Response(blob));
      const localPath = url;
      // Update advertisement download status and path
      await this.advertisementDataSource.updateDownloadStatusAndPath({
        _id: ad._id,
        download_status: 1,
        adv_path: localPath,
      });
      // Notify server that an advertisement has been downloaded
      await this._notifyServerAdDownloaded(ad);
    }

    /**
     * Normalise a file name by removing special characters.  Mirrors
     * Utilities.removeSpecialCharacterFromFileName from the Android
     * implementation.
     *
     * @param {string} name The file name to normalise.
     */
    _normaliseFileName(name) {
      if (!name || typeof name !== 'string') return '';
      return name
        .replace(/ /g, '_')
        .replace(/\*/g, '')
        .replace(/'/g, '')
        .replace(/&/g, '')
        .replace(/-/g, '')
        .replace(/!/g, '')
        .replace(/\$/g, '')
        .replace(/#/g, '')
        .replace(/\^/g, '')
        .replace(/@/g, '');
    }

    /**
     * Notify the backend that a song has finished downloading.  This
     * implementation sends minimal information mirroring the order of
     * calls performed by the Android DownloadService.  The payloads
     * are constructed based on the available song metadata.  Should
     * the server require additional fields the method can be extended.
     *
     * @param {Object} song The downloaded song record.
     */
    async _notifyServerSongDownloaded(song) {
      try {
        const tokenId = (prefs.getTokenId && prefs.getTokenId()) || prefs.getString('TokenId', '');
        // Update total downloaded songs per playlist
        const payload1 = [
          {
            totalSong: 1,
            splPlaylistId: song.sp_playlist_id || '',
            TokenId: tokenId,
          },
        ];
        await new Promise((resolve) => {
          OkHttpUtil.callRequest(
            ENDPOINTS.UPDATE_PLAYLIST_DOWNLOADED_SONGS,
            JSON.stringify(payload1),
            {
              onResponse: () => resolve(),
              onError: () => resolve(),
            },
            TAGS.UPDATE_PLAYLIST_DOWNLOADED_SONGS_TAG
          );
        });
        // Update song IDs downloaded per playlist
        const payload2 = [
          {
            titleIDArray: [song.title_id],
            splPlaylistId: song.sp_playlist_id || '',
            TokenId: tokenId,
          },
        ];
        await new Promise((resolve) => {
          OkHttpUtil.callRequest(
            ENDPOINTS.UPDATE_PLAYLIST_SONGS_DETAILS,
            JSON.stringify(payload2),
            {
              onResponse: () => resolve(),
              onError: () => resolve(),
            },
            TAGS.UPDATE_PLAYLIST_SONGS_DETAILS_TAG
          );
        });
        // Send summary of download process (free space, total space etc.).
        // Estimations of storage are not available on all browsers; use
        // navigator.storage.estimate if present.
        let freeSpace = 0;
        let totalSpace = 0;
        try {
          if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            // Quota and usage are in bytes; convert to megabytes
            totalSpace = Math.round((estimate.quota || 0) / (1024 * 1024));
            freeSpace = Math.round(((estimate.quota || 0) - (estimate.usage || 0)) / (1024 * 1024));
          }
        } catch (err) {
          // ignore errors and send zeros
        }
        const payload3 = {
          totalSong: 1,
          TimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          TokenId: tokenId,
          FreeSpace: freeSpace,
          TotalSpace: totalSpace,
          verNo: 'webos',
          IpAddress: '',
        };
        await new Promise((resolve) => {
          OkHttpUtil.callRequest(
            ENDPOINTS.DOWNLOADING_PROCESS,
            JSON.stringify(payload3),
            {
              onResponse: () => resolve(),
              onError: () => resolve(),
            },
            TAGS.DOWNLOADINGPROCESS_TAG
          );
        });
      } catch (err) {
        console.error('Error notifying server about downloaded song:', err);
      }
    }

    /**
     * Notify the backend that an advertisement has finished downloading.
     * Constructs a minimal payload containing the advertisement ID and
     * token.  Additional fields may be added if required by the server.
     *
     * @param {Object} ad The downloaded advertisement record.
     */
    async _notifyServerAdDownloaded(ad) {
      try {
        const tokenId = (prefs.getTokenId && prefs.getTokenId()) || prefs.getString('TokenId', '');
        const payload = [
          {
            AdvertisementId: ad.adv_id || '',
            TokenId: tokenId,
          },
        ];
        await new Promise((resolve) => {
          OkHttpUtil.callRequest(
            ENDPOINTS.UPDATE_ADS_DETAILS,
            JSON.stringify(payload),
            {
              onResponse: () => resolve(),
              onError: () => resolve(),
            },
            TAGS.UPDATE_ADS_DETAILS_TAG
          );
        });
      } catch (err) {
        console.error('Error notifying server about downloaded advertisement:', err);
      }
    }

    /**
     * Notify the server at the end of the queue processing.  This
     * summary call can aggregate information across all downloads but
     * currently performs no additional logic beyond logging.  Should
     * future requirements arise this method serves as a hook.
     */
    async _notifyServerOfDownloads() {
      // Placeholder for any final summary notifications.  The Android
      // implementation sends multiple payloads per download which are
      // already dispatched in _notifyServerSongDownloaded/_notifyServerAdDownloaded.
      return Promise.resolve();
    }
  }

  // Expose the manager globally
  window.DownloadManager = DownloadManager;
})();


