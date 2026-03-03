/**
 * Player orchestrates playback of downloaded media and advertisements on
 * webOS.  It mirrors a subset of the functionality provided by the
 * Android HomeActivity/Player components, supporting video, audio,
 * image and web media types, advertisement insertion rules, SignalR
 * remote control and a basic heartbeat/watchdog mechanism.  The
 * implementation aims to be robust against missing data while
 * preserving the core behaviour of the original application.
 *
 * Before constructing a Player instance ensure that the necessary
 * modules (AdsManager, DownloadManager, SongsDataSource, etc.) have
 * been loaded and initialised.  A typical usage pattern is shown
 * below:
 *
 *   const adsManager = new AdsManager();
 *   const downloadManager = new DownloadManager();
 *   const player = new Player({ adsManager, downloadManager });
 *   // After playlists and songs have been fetched and stored
 *   const songs = await songsDataSource.getSongsThoseAreDownloaded(currentPlaylistId);
 *   player.loadPlaylist(songs);
 *
 */
(function() {
  class Player {
    /**
     * @param {Object} options Options for the player.
     * @param {AdsManager} options.adsManager Instance used to select ads.
     * @param {DownloadManager} options.downloadManager Instance used to
     *   download new media (optional).
     */
    constructor({ adsManager, downloadManager } = {}) {
      this.adsManager = adsManager || new AdsManager();
      this.downloadManager = downloadManager || null;
      this.playerStatusDataSource = new PlayerStatusDataSource();
      // Playlist and playback state
      this.playlist = [];
      this.currentSongIndex = 0;
      this.isPlayingAd = false;
      this.resumeIndex = null;
      // Elements
      this._setupElements();
      // Watchdog/heartbeat timers
      this._lastProgressTime = 0;
      this._progressInterval = null;
      this._heartbeatInterval = null;
      // Remote control
      this.signalClient = null;
      // Raw websocket control is disabled by default; SignalRClient handles commands centrally.
      this._enableRawSignalSocket = !!(typeof window !== 'undefined' && window.ENABLE_PLAYER_RAW_SIGNALR === true);
      // Blob URLs created from cached media for offline playback.
      this._activeObjectUrls = new Set();
      // Guard rails to prevent rapid repeated advance loops on media failures.
      this._advanceTimer = null;
      this._advanceInProgress = false;
      // Avoid aggressive self-recovery loops that can cause visible blinking.
      this._lastStallRecoveryAt = 0;
      this._stallRecoveryCooldownMs = 60000;
      this._stallProgressTimeoutMs = 30000;
      // Runtime-detected capability: whether media elements can load blob URLs.
      this._blobMediaSupport = null;
      // Blob-backed cache playback is enabled by default so downloaded items play offline.
      // Set window.ENABLE_BLOB_CACHE = false to force direct URL streaming for debugging.
      this._enableBlobMediaCache = !(typeof window !== 'undefined' && window.ENABLE_BLOB_CACHE === false);
      // Guard against media elements that remain in loading state indefinitely.
      this._mediaStartupTimer = null;
      this._mediaStartupTimeoutMs = 15000;
      // Only images use blob cache by default; AV blob playback is unstable on some webOS builds.
      this._enableAvBlobCache = !!(typeof window !== 'undefined' && window.ENABLE_AV_BLOB_CACHE === true);
      // Timer used for image/web display intervals.
      this._mediaIntervalTimer = null;
      // Start the heartbeat timer
      this._startHeartbeat();
    }

    /**
     * Create HTML elements used for playback and insert them into the
     * document body.  Each media type is contained in its own element
     * which is shown/hidden as needed.
     */
    _setupElements() {
      // Container
      this.container = document.getElementById('player-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'player-container';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.backgroundColor = 'black';
        this.container.style.zIndex = '1';
        var host = document.getElementById('mainContainer') || document.getElementById('app') || document.body;
        host.appendChild(this.container);
      }
      // Video element
      this.video = document.createElement('video');
      this.video.id = 'player-video';
      this.video.style.width = '100%';
      this.video.style.height = '100%';
      this.video.style.objectFit = 'contain';
      this.video.style.display = 'none';
      this.video.setAttribute('playsinline', '');
      this.container.appendChild(this.video);
      // Audio element
      this.audio = document.createElement('audio');
      this.audio.id = 'player-audio';
      this.audio.style.display = 'none';
      this.container.appendChild(this.audio);

      // Audio overlay keeps playback visibly active when the current item is audio-only.
      this.audioOverlay = document.createElement('div');
      this.audioOverlay.id = 'player-audio-overlay';
      this.audioOverlay.style.position = 'absolute';
      this.audioOverlay.style.left = '0';
      this.audioOverlay.style.right = '0';
      this.audioOverlay.style.top = '0';
      this.audioOverlay.style.bottom = '0';
      this.audioOverlay.style.display = 'none';
      this.audioOverlay.style.alignItems = 'center';
      this.audioOverlay.style.justifyContent = 'center';
      this.audioOverlay.style.textAlign = 'center';
      this.audioOverlay.style.padding = '24px';
      this.audioOverlay.style.fontFamily = '"Century Gothic", sans-serif';
      this.audioOverlay.style.fontSize = '36px';
      this.audioOverlay.style.fontWeight = '700';
      this.audioOverlay.style.letterSpacing = '0.6px';
      this.audioOverlay.style.color = '#f4f6ff';
      this.audioOverlay.style.textShadow = '0 2px 8px rgba(0,0,0,0.55)';
      this.audioOverlay.style.background = 'radial-gradient(circle at center, rgba(25,30,52,0.30), rgba(0,0,0,0.72))';
      this.audioOverlay.style.zIndex = '3';
      this.audioOverlay.textContent = 'Audio playback';
      this.container.appendChild(this.audioOverlay);
      // Image element
      this.img = document.createElement('img');
      this.img.id = 'player-image';
      this.img.style.width = '100%';
      this.img.style.height = '100%';
      this.img.style.objectFit = 'contain';
      this.img.style.display = 'none';
      this.container.appendChild(this.img);
      // Web/iframe element
      this.iframe = document.createElement('iframe');
      this.iframe.id = 'player-web';
      this.iframe.style.width = '100%';
      this.iframe.style.height = '100%';
      this.iframe.style.border = 'none';
      this.iframe.style.display = 'none';
      this.container.appendChild(this.iframe);
      // Bind event listeners for end of playback
      this.video.onended = () => this._onMediaEnded();
      this.audio.onended = () => this._onMediaEnded();
      // For progress monitoring
      this.video.ontimeupdate = () => this._onProgress();
      this.audio.ontimeupdate = () => this._onProgress();
      // Mark startup as successful as soon as media becomes decodable/playable.
      this.video.addEventListener('loadeddata', () => this._clearMediaStartupWatchdog());
      this.video.addEventListener('playing', () => this._clearMediaStartupWatchdog());
      this.audio.addEventListener('loadeddata', () => this._clearMediaStartupWatchdog());
      this.audio.addEventListener('playing', () => this._clearMediaStartupWatchdog());

      // Skip broken media and keep playlist progression alive.
      this.video.onerror = () => {
        console.warn('Video element error; skipping to next item');
        this._scheduleAdvance(150);
      };
      this.audio.onerror = () => {
        console.warn('Audio element error; skipping to next item');
        this._scheduleAdvance(150);
      };
      this.img.onerror = () => {
        console.warn('Image element error; skipping to next item');
        this._scheduleAdvance(150);
      };
      this.iframe.onerror = () => {
        console.warn('Web content error; skipping to next item');
        this._scheduleAdvance(150);
      };
    }

    /**
     * Load a playlist into the player.  The playlist should be an
     * array of song objects retrieved from SongsDataSource.  The
     * currentSongIndex is reset to zero and playback starts
     * immediately.
     *
     * @param {Array} playlist List of song records to play.
     */
    loadPlaylist(playlist) {
      if (!Array.isArray(playlist) || playlist.length === 0) {
        console.warn('Empty playlist provided to Player');
        return;
      }
      this.playlist = playlist;
      this.currentSongIndex = 0;
      this.resumeIndex = null;
      this.isPlayingAd = false;
      // Optional raw websocket connection (disabled by default).
      if (this._enableRawSignalSocket && !this.signalClient) {
        this._connectSignalR();
      }
      this._playCurrentSong();
    }

    /**
     * Play the current song in the playlist.  If a time based
     * advertisement is due it will be played first; otherwise the song
     * media will be loaded and displayed in the appropriate element.
     */
    async _playCurrentSong() {
      if (this.playlist.length === 0) {
        return;
      }
      const index = this.currentSongIndex % this.playlist.length;
      const song = this.playlist[index];
      // Determine filter for advertisements
      const filter = {
        playlistId: song.sp_playlist_id || '',
        playType: song.mediatype || '',
        soundType: song.mediatype || '',
        flavour: '',
      };
      // Check for a fixed time advertisement before starting the song
      const timeAd = await this.adsManager.pickNextAd('time', filter);
      if (timeAd && !this.isPlayingAd) {
        // Play the advertisement and resume this song afterwards
        this.resumeIndex = index;
        await this._playAd(timeAd);
        return;
      }
      // Determine media URL. For downloaded items, first try a cached blob URL.
      const source = await this._resolveSongPlaybackSource(song);
      const url = source.url;
      if (!url) {
        console.warn('Song has no URL', song);
        this._scheduleAdvance(200);
        return;
      }
      // Hide all elements
      this._hideAllMedia();
      this._clearMediaIntervalAdvance();
      // Choose element based on extension and metadata fallback.
      const mediaKind = this._getMediaKind(song, source.typeHintUrl || url);
      const startedAt = Date.now();
      this._lastProgressTime = startedAt;
      if (mediaKind === 'video') {
        this.video.src = url;
        this.video.style.display = '';
        this._armMediaStartupWatchdog('video', url);
        try {
          await this.video.play();
        } catch (err) {
          console.error('Video play error', err);
          this._scheduleAdvance(150);
        }
      } else if (mediaKind === 'audio') {
        this.audio.src = url;
        this.audio.style.display = '';
        this._showAudioOverlay(song, false);
        this._armMediaStartupWatchdog('audio', url);
        try {
          await this.audio.play();
        } catch (err) {
          console.error('Audio play error', err);
          this._scheduleAdvance(150);
        }
      } else if (mediaKind === 'image') {
        this.img.src = url;
        this.img.style.display = '';
        // Use the song's timeinterval to determine how long to display the image
        const intervalMs = (Number(song.timeinterval) || Number(song.time) || 5) * 1000;
        this._scheduleMediaIntervalAdvance(intervalMs);
      } else {
        // Fallback: treat as web content
        this.iframe.src = url;
        this.iframe.style.display = '';
        const intervalMs = (Number(song.timeinterval) || 10) * 1000;
        this._scheduleMediaIntervalAdvance(intervalMs);
      }
      // Record that the song has started playing.  Store the start
      // timestamp so that minute-based ads can be scheduled relative
      // to playback duration.
      this._currentSongStartTime = startedAt;
      // SECTION 1: Report played song via StatusReporter (handles server + offline queue)
      if (window.StatusReporter) {
        StatusReporter.reportPlayedSong(song);
      } else {
        // Fallback: Persist a song played status into the table_player_status store
        try {
          const now = new Date();
          const playedDateTime = this._formatDate(now);
          await this.playerStatusDataSource.createPlayerStatus({
            artist_id_song: song.artist_id || '',
            played_date_time_song: playedDateTime,
            title_id_song: song.title_id || '',
            spl_playlist_id_song: song.sp_playlist_id || '',
            is_player_status_type: 'song',
          });
        } catch (err) {
          console.error('Failed to record song status', err);
        }
      }
    }


    _scheduleAdvance(delayMs = 120) {
      if (this._advanceTimer) {
        return;
      }
      this._advanceTimer = setTimeout(() => {
        this._advanceTimer = null;
        this._onMediaEnded();
      }, Math.max(0, Number(delayMs) || 0));
    }
    /**
     * Handle the end of the current media.  This method triggers
     * advertisement insertion based on song and minute counters and
     * advances playback to the next song.
     */
    async _onMediaEnded() {
      if (this._advanceInProgress) {
        return;
      }
      this._advanceInProgress = true;
      try {
      // If an advertisement was playing simply resume the next song
      if (this.isPlayingAd) {
        this.isPlayingAd = false;
        const resume = this.resumeIndex != null ? this.resumeIndex : this.currentSongIndex;
        this.resumeIndex = null;
        this._playSongAtIndex(resume);
        return;
      }
      // Compute elapsed time for the song just finished
      const now = Date.now();
      const elapsed = this._currentSongStartTime ? now - this._currentSongStartTime : 0;
      // Determine filter from the song that just ended
      const song = this.playlist[this.currentSongIndex % this.playlist.length];
      const filter = {
        playlistId: song.sp_playlist_id || '',
        playType: song.mediatype || '',
        soundType: song.mediatype || '',
        flavour: '',
      };
      // Minute-based advertisement check
      const minuteAd = await this.adsManager.checkMinuteAd(elapsed, filter);
      if (minuteAd) {
        this.resumeIndex = (this.currentSongIndex + 1) % this.playlist.length;
        await this._playAd(minuteAd);
        return;
      }
      // Song-based advertisement check
      const songAd = await this.adsManager.checkSongAd(filter);
      if (songAd) {
        this.resumeIndex = (this.currentSongIndex + 1) % this.playlist.length;
        await this._playAd(songAd);
        return;
      }
      // Advance to next song
      this._playSongAtIndex((this.currentSongIndex + 1) % this.playlist.length);
      } finally {
        this._advanceInProgress = false;
        this._clearMediaStartupWatchdog();
        this._clearMediaIntervalAdvance();
      }
    }

    /**
     * Play a song at a specific index in the playlist.  Updates
     * currentSongIndex and calls _playCurrentSong().
     *
     * @param {number} index Index in the playlist array.
     */
    _playSongAtIndex(index) {
      this.currentSongIndex = index;
      this._playCurrentSong();
    }

    /**
     * Public method to play a song at a specific index.
     * Exposed for SignalR PlaySong command and external control.
     *
     * @param {number} index Index in the playlist array.
     */
    playSong(index) {
      console.log('[Player] playSong called with index:', index);
      if (typeof index === 'number' && index >= 0) {
        return this._playSongAtIndex(index % this.playlist.length);
      }
      return this._playSongAtIndex(0);
    }

    /**
     * Play a song by its title ID. Searches the playlist for a matching song.
     *
     * @param {string} titleId The title_id to find and play.
     * @returns {boolean} True if song was found and playback started.
     */
    playSongById(titleId) {
      console.log('[Player] playSongById called with titleId:', titleId);
      if (!titleId || !this.playlist || this.playlist.length === 0) {
        return false;
      }
      for (var i = 0; i < this.playlist.length; i++) {
        if (String(this.playlist[i].title_id) === String(titleId)) {
          this._playSongAtIndex(i);
          return true;
        }
      }
      console.warn('[Player] Song not found in playlist:', titleId);
      return false;
    }

    /**
     * Recover playback after a stall or error.
     * Attempts to restart the current song or reinitialize the player.
     * Called by ApplicationChecker when playback appears stuck.
     */
    recoverPlayback() {
      console.log('[Player] recoverPlayback called');
      try {
        // First, try to pause and clear any stuck state
        this._hideAllMedia();

        // If playing an ad, force end it
        if (this.isPlayingAd) {
          console.log('[Player] Forcing ad end during recovery');
          this.isPlayingAd = false;
          this.resumeIndex = null;
        }

        // Attempt to replay current song
        if (this.playlist && this.playlist.length > 0) {
          var currentIndex = this.currentSongIndex || 0;
          console.log('[Player] Restarting playback at index:', currentIndex);
          this._playSongAtIndex(currentIndex);
        } else {
          console.warn('[Player] No playlist available for recovery');
        }

        // Reset progress tracking
        this._lastProgressTime = Date.now();
      } catch (err) {
        console.error('[Player] Recovery failed:', err);
      }
    }

    /**
     * Get current playback state for monitoring.
     * @returns {Object} Playback state info
     */
    getPlaybackState() {
      var activeElement = null;
      var type = 'none';

      if (this.video && this.video.style.display !== 'none') {
        activeElement = this.video;
        type = 'video';
      } else if (this.audio && this.audio.style.display !== 'none') {
        activeElement = this.audio;
        type = 'audio';
      }

      if (!activeElement) {
        return {
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          paused: true,
          ended: false,
          type: type,
          currentSongIndex: this.currentSongIndex,
          isPlayingAd: this.isPlayingAd
        };
      }

      return {
        isPlaying: !activeElement.paused && !activeElement.ended,
        currentTime: activeElement.currentTime || 0,
        duration: activeElement.duration || 0,
        paused: activeElement.paused,
        ended: activeElement.ended,
        type: type,
        currentSongIndex: this.currentSongIndex,
        isPlayingAd: this.isPlayingAd
      };
    }

    /**
     * Play an advertisement.  Advertisements are treated similarly
     * to songs but use the advertisement fields for media selection.
     * The isPlayingAd flag is set to true to prevent nested ad
     * insertion.  After the advertisement ends playback resumes at
     * the stored resumeIndex.
     *
     * @param {Object} ad Advertisement record to play.
     */
    async _playAd(ad) {
      if (!ad) return;
      this.isPlayingAd = true;
      this._lastProgressTime = Date.now();
      // Determine media URL. For downloaded ads, first try a cached blob URL.
      const source = await this._resolveAdPlaybackSource(ad);
      const url = source.url;
      if (!url) {
        console.warn('Advertisement has no URL', ad);
        this.isPlayingAd = false;
        return;
      }
      // Hide other media elements
      this._hideAllMedia();
      this._clearMediaIntervalAdvance();
      const mediaKind = this._getMediaKind(ad, source.typeHintUrl || url);
      if (mediaKind === 'video') {
        this.video.src = url;
        this.video.style.display = '';
        this.video.onended = () => this._onMediaEnded();
        this._armMediaStartupWatchdog('video', url);
        try {
          await this.video.play();
        } catch (err) {
          console.error('Video ad play error', err);
          this._scheduleAdvance(150);
        }
      } else if (mediaKind === 'audio') {
        this.audio.src = url;
        this.audio.style.display = '';
        this.audio.onended = () => this._onMediaEnded();
        this._showAudioOverlay(ad, true);
        this._armMediaStartupWatchdog('audio', url);
        try {
          await this.audio.play();
        } catch (err) {
          console.error('Audio ad play error', err);
          this._scheduleAdvance(150);
        }
      } else if (mediaKind === 'image') {
        this.img.src = url;
        this.img.style.display = '';
        // Use advertisement's timeinterval to determine display duration
        const intervalMs = (Number(ad.timeinterval) || 5) * 1000;
        this._scheduleMediaIntervalAdvance(intervalMs);
      } else {
        // Web advertisement
        this.iframe.src = url;
        this.iframe.style.display = '';
        const intervalMs = (Number(ad.timeinterval) || 10) * 1000;
        this._scheduleMediaIntervalAdvance(intervalMs);
      }
      // SECTION 1: Report played ad via StatusReporter (handles server + offline queue)
      if (window.StatusReporter) {
        StatusReporter.reportPlayedAd(ad);
      } else {
        // Fallback: Record advertisement playback in player status table
        try {
          const now = new Date();
          await this.playerStatusDataSource.createPlayerStatus({
            advertisement_id_status: ad.adv_id || '',
            advertisement_played_date: this._formatDate(now, 'date'),
            advertisement_played_time: this._formatDate(now, 'time'),
            is_player_status_type: 'ad',
          });
        } catch (err) {
          console.error('Failed to record advertisement status', err);
        }
      }
    }

    /**
     * Hide all media elements prior to starting a new playback.  Only
     * the relevant element is displayed by _playCurrentSong or _playAd.
     */
    _hideAllMedia() {
      this.video.style.display = 'none';
      this.audio.style.display = 'none';
      this.img.style.display = 'none';
      this.iframe.style.display = 'none';
      this._hideAudioOverlay();
      this._clearMediaStartupWatchdog();
      this._clearMediaIntervalAdvance();
      // Pause any media that might still be playing
      try { this.video.pause(); } catch (err) {}
      try { this.audio.pause(); } catch (err) {}
      // Clear previous sources and release blob URLs.
      try { this.video.removeAttribute('src'); } catch (err) {}
      try { this.audio.removeAttribute('src'); } catch (err) {}
      try { this.img.removeAttribute('src'); } catch (err) {}
      try { this.iframe.removeAttribute('src'); } catch (err) {}
      this._revokeObjectUrls();
    }


    _showAudioOverlay(record, isAdvertisement) {
      if (!this.audioOverlay) return;
      var baseName = '';
      if (record) {
        baseName = String(
          record.titles ||
          record.title ||
          record.adv_name ||
          record.name ||
          record.title_id ||
          record.adv_id ||
          ''
        ).trim();
      }
      var labelPrefix = isAdvertisement ? 'Advertisement audio' : 'Now playing audio';
      this.audioOverlay.textContent = baseName ? (labelPrefix + ': ' + baseName) : labelPrefix;
      this.audioOverlay.style.display = 'flex';
    }

    _hideAudioOverlay() {
      if (!this.audioOverlay) return;
      this.audioOverlay.style.display = 'none';
    }

    _armMediaStartupWatchdog(kind, url) {
      this._clearMediaStartupWatchdog();
      var mediaKind = String(kind || '').toLowerCase();
      if (mediaKind !== 'video' && mediaKind !== 'audio') {
        return;
      }
      var element = mediaKind === 'video' ? this.video : this.audio;
      if (!element) return;
      var expectedUrl = String(url || '').trim();
      this._mediaStartupTimer = setTimeout(() => {
        this._mediaStartupTimer = null;
        try {
          var activeUrl = String(element.currentSrc || element.getAttribute('src') || '').trim();
          var sameSource = !expectedUrl || !activeUrl || activeUrl === expectedUrl;
          var hasProgress = (Number(element.readyState || 0) >= 2) || (Number(element.currentTime || 0) > 0);
          if (!sameSource || hasProgress) {
            return;
          }
          console.warn('Media startup timed out; skipping item', mediaKind, activeUrl || expectedUrl);
        } catch (err) {
          // best effort
        }
        this._scheduleAdvance(120);
      }, this._mediaStartupTimeoutMs);
    }

    _clearMediaStartupWatchdog() {
      if (!this._mediaStartupTimer) return;
      clearTimeout(this._mediaStartupTimer);
      this._mediaStartupTimer = null;
    }

    _scheduleMediaIntervalAdvance(intervalMs) {
      this._clearMediaIntervalAdvance();
      var ms = Math.max(0, Number(intervalMs) || 0);
      this._mediaIntervalTimer = setTimeout(() => {
        this._mediaIntervalTimer = null;
        this._scheduleAdvance(150);
      }, ms);
    }

    _clearMediaIntervalAdvance() {
      if (!this._mediaIntervalTimer) return;
      clearTimeout(this._mediaIntervalTimer);
      this._mediaIntervalTimer = null;
    }

    _normalizeMediaUrl(url) {
      if (url == null) return '';
      return String(url).trim();
    }

    _trackObjectUrl(url) {
      if (typeof url === 'string' && url.indexOf('blob:') === 0) {
        this._activeObjectUrls.add(url);
      }
    }

    _revokeObjectUrls() {
      if (!this._activeObjectUrls || this._activeObjectUrls.size === 0) {
        return;
      }
      this._activeObjectUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (err) {
          // best effort
        }
      });
      this._activeObjectUrls.clear();
    }


    async _detectBlobMediaSupport() {
      try {
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Image === 'undefined') {
          return false;
        }
        const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ0f7S0AAAAASUVORK5CYII=';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });
        const blobUrl = URL.createObjectURL(blob);

        const supported = await new Promise((resolve) => {
          const img = new Image();
          let done = false;
          const finish = (ok) => {
            if (done) return;
            done = true;
            try { URL.revokeObjectURL(blobUrl); } catch (err) {}
            resolve(ok);
          };

          const timer = setTimeout(() => finish(false), 1800);
          img.onload = () => {
            clearTimeout(timer);
            finish(true);
          };
          img.onerror = () => {
            clearTimeout(timer);
            finish(false);
          };
          img.src = blobUrl;
        });

        return !!supported;
      } catch (err) {
        return false;
      }
    }
    async _resolveCachedBlobUrl(url) {
      var sourceUrl = this._normalizeMediaUrl(url);
      if (!sourceUrl) return '';
      if (/^(blob:|data:)/i.test(sourceUrl)) {
        return sourceUrl;
      }
      if (!this._enableBlobMediaCache) {
        return '';
      }
      if (!window.caches || typeof caches.open !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return '';
      }
      if (this._blobMediaSupport === null) {
        this._blobMediaSupport = await this._detectBlobMediaSupport();
      }
      if (!this._blobMediaSupport) {
        return '';
      }
      try {
        var cache = await caches.open('downloads');
        var variants = [sourceUrl];
        try {
          var decoded = decodeURI(sourceUrl);
          if (decoded && variants.indexOf(decoded) === -1) {
            variants.push(decoded);
          }
        } catch (err) {
          // ignore decode issues
        }
        var response = null;
        for (var i = 0; i < variants.length; i++) {
          response = await cache.match(variants[i]);
          if (response) break;
        }
        if (!response) return '';
        var blob = await response.blob();
        if (!blob || !blob.size) return '';
        var blobUrl = URL.createObjectURL(blob);
        this._trackObjectUrl(blobUrl);
        return blobUrl;
      } catch (err) {
        return '';
      }
    }

    async _resolveSongPlaybackSource(song) {
      var remoteUrl = this._normalizeMediaUrl(song && (song.song_url || song.title_url || song.url || song.src));
      var localUrl = this._normalizeMediaUrl(song && (song.song_path || song.local_path));
      var isDownloaded = Number(song && (song.is_downloaded || song.download_status || 0)) === 1;
      var cacheCandidates = [];

      if (localUrl) cacheCandidates.push(localUrl);
      if (remoteUrl && cacheCandidates.indexOf(remoteUrl) === -1) cacheCandidates.push(remoteUrl);

      var resolvedKind = this._getMediaKind(song, remoteUrl || localUrl || '');
      var allowBlobCache = (resolvedKind === 'image') || this._enableAvBlobCache;

      if (isDownloaded && allowBlobCache && cacheCandidates.length > 0) {
        for (var i = 0; i < cacheCandidates.length; i++) {
          var candidate = cacheCandidates[i];
          var cached = await this._resolveCachedBlobUrl(candidate);
          if (cached) {
            return { url: cached, typeHintUrl: candidate };
          }
        }
        console.warn('Downloaded song not found in cache, falling back to stream URL', song && (song.title_id || song.titles || song.title || 'unknown'));
      }

      var fallbackUrl = '';
      if (/^(https?:|blob:|data:)/i.test(remoteUrl)) {
        fallbackUrl = remoteUrl;
      } else if (/^(https?:|blob:|data:)/i.test(localUrl)) {
        fallbackUrl = localUrl;
      }

      return {
        url: fallbackUrl,
        typeHintUrl: remoteUrl || localUrl || fallbackUrl,
      };
    }

    async _resolveAdPlaybackSource(ad) {
      var remoteUrl = this._normalizeMediaUrl(ad && (ad.adv_file_url || ad.url || ad.src));
      var localUrl = this._normalizeMediaUrl(ad && ad.adv_path);
      var isDownloaded = Number(ad && (ad.download_status || ad.is_downloaded || 0)) === 1;
      var cacheCandidates = [];

      if (localUrl) cacheCandidates.push(localUrl);
      if (remoteUrl && cacheCandidates.indexOf(remoteUrl) === -1) cacheCandidates.push(remoteUrl);

      var resolvedKind = this._getMediaKind(ad, remoteUrl || localUrl || '');
      var allowBlobCache = (resolvedKind === 'image') || this._enableAvBlobCache;

      if (isDownloaded && allowBlobCache && cacheCandidates.length > 0) {
        for (var i = 0; i < cacheCandidates.length; i++) {
          var candidate = cacheCandidates[i];
          var cached = await this._resolveCachedBlobUrl(candidate);
          if (cached) {
            return { url: cached, typeHintUrl: candidate };
          }
        }
        console.warn('Downloaded advertisement not found in cache, falling back to stream URL', ad && (ad.adv_id || ad.adv_name || 'unknown'));
      }

      var fallbackUrl = '';
      if (/^(https?:|blob:|data:)/i.test(remoteUrl)) {
        fallbackUrl = remoteUrl;
      } else if (/^(https?:|blob:|data:)/i.test(localUrl)) {
        fallbackUrl = localUrl;
      }

      return {
        url: fallbackUrl,
        typeHintUrl: remoteUrl || localUrl || fallbackUrl,
      };
    }

    _getMediaKind(record, urlHint) {
      var ext = this._getExtension(urlHint || '');
      if (ext === 'mp4' || ext === 'm4v' || ext === 'mov' || ext === 'webm' || ext === 'm3u8') {
        return 'video';
      }
      if (ext === 'mp3' || ext === 'wav' || ext === 'aac' || ext === 'm4a' || ext === 'ogg') {
        return 'audio';
      }
      if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'bmp' || ext === 'webp') {
        return 'image';
      }

      var type = String(
        (record && (
          record.mediatype ||
          record.mediaType ||
          record.adv_play_type ||
          record.adv_sound_type ||
          record.type
        )) || ''
      ).toLowerCase();

      if (type.indexOf('video') !== -1) return 'video';
      if (type.indexOf('audio') !== -1 || type.indexOf('song') !== -1 || type.indexOf('sound') !== -1) return 'audio';
      if (type.indexOf('image') !== -1 || type.indexOf('photo') !== -1) return 'image';
      if (type.indexOf('url') !== -1 || type.indexOf('web') !== -1) return 'web';

      // Keep legacy fallback for unknown content.
      return 'web';
    }

    /**
     * Extract the file extension (lower case) from a URL or file name.
     * Returns an empty string if none found.
     *
     * @param {string} url File URL or path.
     */
    _getExtension(url) {
      try {
        const parts = url.split('?')[0].split('#')[0].split('.');
        const ext = parts[parts.length - 1].toLowerCase();
        return ext;
      } catch (err) {
        return '';
      }
    }

    /**
     * Handle ontimeupdate events to monitor playback progress.  The
     * heartbeat timer resets the watchdog if progress occurs.  If no
     * progress is detected for a sustained period the player attempts
     * to restart playback.
     */
    _onProgress() {
      this._lastProgressTime = Date.now();
      this._clearMediaStartupWatchdog();
    }

    _isAvElementActivelyPlaying(el) {
      if (!el) return false;
      var display = '';
      try {
        display = window.getComputedStyle(el).display;
      } catch (err) {}
      if (display === 'none') return false;
      var src = '';
      try {
        src = String(el.currentSrc || el.getAttribute('src') || '').trim();
      } catch (err) {}
      if (!src) return false;
      if (el.ended) return false;
      if (el.paused) return false;
      // In buffering/metadata states timeupdate can be sparse; don't classify as stalled yet.
      if (typeof el.readyState === 'number' && el.readyState < 2) {
        return false;
      }
      return true;
    }

    /**
     * Start a heartbeat timer that records a heartbeat status and
     * periodically checks for playback stalls.  If the current media
     * does not progress for more than 30 seconds the player attempts
     * to restart the current song.
     */
    _startHeartbeat() {
      // Heartbeat: record every 60 seconds
      this._heartbeatInterval = setInterval(async () => {
        try {
          const now = new Date();
          await this.playerStatusDataSource.createPlayerStatus({
            heartbeat_datetime: this._formatDate(now),
            is_player_status_type: 'heartbeat',
          });
        } catch (err) {
          console.error('Failed to record heartbeat', err);
        }
      }, 60000);
      // Watchdog: check every 15 seconds
      this._lastProgressTime = Date.now();
      this._progressInterval = setInterval(() => {
        const now = Date.now();
        // Only self-heal when active audio/video is truly playing and has gone stale.
        var isActiveAv = this._isAvElementActivelyPlaying(this.video) || this._isAvElementActivelyPlaying(this.audio);
        if (!isActiveAv) return;

        if (now - this._lastProgressTime <= this._stallProgressTimeoutMs) return;
        if (now - this._lastStallRecoveryAt <= this._stallRecoveryCooldownMs) return;

        console.warn('Playback stalled; restarting current media');
        this._lastStallRecoveryAt = now;
        if (this.isPlayingAd) {
          // Force end and resume song
          this._scheduleAdvance(120);
        } else {
          // Restart current song
          this._playSongAtIndex(this.currentSongIndex);
        }
        this._lastProgressTime = now;
      }, 15000);
    }

    /**
     * Establish a SignalR/WebSocket connection to the backend for
     * remote control commands.  Messages are expected in JSON format
     * mirroring those delivered via the Android SignalR client.  On
     * connection failure the client retries silently.  Incoming
     * commands invoke player methods accordingly.
     */
    _connectSignalR() {
      const url = 'wss://api.applicationaddons.com/pushNotification';
      try {
        this.signalClient = new WebSocket(url);
      } catch (err) {
        console.error('WebSocket not supported or failed to construct:', err);
        return;
      }
      this.signalClient.onopen = () => {
        console.log('SignalR/WebSocket connected');
      };
      this.signalClient.onmessage = async (evt) => {
        let data;
        try {
          data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
        } catch (err) {
          console.warn('Failed to parse SignalR message', err);
          return;
        }
        // The server may send wrapper objects; extract the message
        if (data && typeof data === 'object') {
          await this._handleSignalMessage(data);
        }
      };
      this.signalClient.onerror = (err) => {
        console.error('SignalR/WebSocket error:', err);
      };
      this.signalClient.onclose = () => {
        console.warn('SignalR/WebSocket connection closed; attempting reconnect');
        // Attempt reconnect after delay
        setTimeout(() => {
          this._connectSignalR();
        }, 10000);
      };
    }

    /**
     * Handle a parsed SignalR message and perform the associated action.
     * Supported commands mirror those defined in the Android client:
     * - type === 'Next': skip to the next song immediately
     * - type === 'Playlist': play the playlist specified by id
     * - type === 'Ads': play the advertisement specified by id
     * - datatype === 'Publish' && type === 'UpdateNow': run token
     *   publish update flow (refresh playlists and advertisements)
     * - playerrestart === '1': restart the player
     *
     * @param {Object} msg Parsed JSON object from the server.
     */
    async _handleSignalMessage(msg) {
      try {
        const id = msg.id || msg.Id || '';
        const dataType = msg.datatype || msg.dataType || '';
        const playType = msg.type || msg.playType || '';
        const url = msg.url || '';
        const albumId = msg.albumid || msg.albumId || '';
        const repeat = Number(msg.repeat || 0);
        const artistId = msg.artistid || msg.artistId || '';
        const mediaType = msg.mediaType || msg.mediatype || '';
        const artistName = msg.artistname || msg.artistName || '';
        const restartFlag = msg.playerrestart || msg.restart || '0';
        if (playType === 'Next') {
          // Skip to the next song immediately
          this._playSongAtIndex((this.currentSongIndex + 1) % this.playlist.length);
        } else if (playType === 'Playlist' && id) {
          // Fetch the playlist from the server and play now
          this._playPlaylistFromServer(id);
        } else if (playType === 'Ads' && id) {
          // Play a specific advertisement on demand
          const ad = await this._findAdById(id);
          if (ad) {
            this.resumeIndex = this.currentSongIndex;
            await this._playAd(ad);
          }
        } else if (dataType === 'Publish' && playType === 'UpdateNow') {
          // Trigger token publish update flow: refresh playlists and ads
          await this._handlePublishUpdate();
        }
        if (restartFlag === '1') {
          // Restart the player
          console.warn('Remote restart requested');
          this.loadPlaylist(this.playlist);
        }
      } catch (err) {
        console.error('Error handling SignalR message', err);
      }
    }

    /**
     * Attempt to fetch a playlist from the server by its ID and play
     * it immediately.  This calls the PlaylistManager and
     * DownloadManager to retrieve and optionally download the songs.
     * If retrieval fails the request is ignored.
     *
     * @param {string} playlistId Identifier of the playlist to play.
     */
    async _playPlaylistFromServer(playlistId) {
      try {
        const pm = new PlaylistManager();
        await pm._fetchSongsForPlaylist(playlistId);
        // Retrieve downloaded songs for this playlist
        const ds = new SongsDataSource();
        const songs = await ds.getSongsThoseAreDownloaded(playlistId);
        if (songs && songs.length) {
          this.loadPlaylist(songs);
        }
      } catch (err) {
        console.error('Failed to play playlist from server', err);
      }
    }

    /**
     * Find an advertisement by its adv_id.  Returns null if not found
     * or not downloaded.  This helper searches the IndexedDB store via
     * AdvertisementDataSource.getAllAdv().
     *
     * @param {string} advId The advertisement ID to look up.
     */
    async _findAdById(advId) {
      try {
        const ads = await this.adsManager._getAdsByType('minute');
        const ads2 = await this.adsManager._getAdsByType('song');
        const ads3 = await this.adsManager._getAdsByType('time');
        const combined = [...ads, ...ads2, ...ads3];
        for (const ad of combined) {
          if (String(ad.adv_id) === String(advId)) {
            return ad;
          }
        }
      } catch (err) {
        console.error('Error finding advertisement', err);
      }
      return null;
    }

    /**
     * Perform the token publish update flow.  This mirrors the
     * behaviour of the Android client when receiving a Publish
     * UpdateNow signal.  The player refreshes playlist schedules,
     * downloads any new media and refetches advertisements.
     */
    async _handlePublishUpdate() {
      try {
        console.log('Handling publish update');
        // Fetch playlists schedule
        const pm = new PlaylistManager();
        const dfClientId = prefs.getString('DfClientId', '');
        const tokenId = prefs.getString('TokenId', '');
        const weekNo = prefs.getString('WeekNo', '');
        await pm.getPlaylistsFromServer({ dfClientId, tokenId, weekNo });
        // Fetch advertisements
        const cityId = prefs.getString('Cityid', '');
        const countryId = prefs.getString('CountryId', '');
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentDate = String(now.getDate()) + '-' + months[now.getMonth()] + '-' + String(now.getFullYear());
        const stateId = prefs.getString('StateId', '');
        await this.adsManager.fetchAdvertisements({ Cityid: cityId, CountryId: countryId, CurrentDate: currentDate, DfClientId: dfClientId, StateId: stateId, TokenId: tokenId, WeekNo: weekNo });
        // Optionally kick off new downloads if a DownloadManager is present
        if (this.downloadManager) {
          // Identify any songs or ads that are not downloaded and add them to the queue
          // Songs
          const plDS = new PlaylistDataSource();
          const songsDS = new SongsDataSource();
          const playlists = await plDS.getAllDistinctPlaylists();
          for (const pl of playlists) {
            const notDownloaded = await songsDS.getSongsThoseAreNotDownloaded(pl.sp_playlist_id);
            if (notDownloaded && notDownloaded.length) {
              this.downloadManager.addSongsToQueue(notDownloaded);
            }
          }
          // Advertisements
          const advDS = new AdvertisementDataSource();
          const notDlAds = await advDS.getAdvThoseAreNotDownloaded();
          if (notDlAds && notDlAds.length) {
            this.downloadManager.addAdsToQueue(notDlAds);
          }
          // Start downloads in the background
          if (!window.dmIsRunning(this.downloadManager)) {
            this.downloadManager.start();
          }
        }
      } catch (err) {
        console.error('Error handling publish update', err);
      }
    }

    /**
     * Format a Date object into a string.  If the `mode` argument is
     * 'date' only the date portion is returned; if 'time' only the
     * time portion is returned; otherwise both date and time are
     * concatenated.  Format matches DD/MMM/YYYY hh:mm:ss AA used by
     * the Android code.
     *
     * @param {Date} d Date object to format.
     * @param {string} mode Optional mode: 'date', 'time' or undefined.
     */
    _formatDate(d, mode) {
      const day = String(d.getDate()).padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[d.getMonth()];
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const hourStr = String(hours).padStart(2, '0');
      const datePart = `${day}/${month}/${year}`;
      const timePart = `${hourStr}:${minutes}:${seconds} ${ampm}`;
      if (mode === 'date') return datePart;
      if (mode === 'time') return timePart;
      return `${datePart} ${timePart}`;
    }
  }
  // Expose globally
  window.Player = Player;
})();

