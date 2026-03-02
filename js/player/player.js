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

      // Skip broken media and keep playlist progression alive.
      this.video.onerror = () => {
        console.warn('Video element error; skipping to next item');
        this._onMediaEnded();
      };
      this.audio.onerror = () => {
        console.warn('Audio element error; skipping to next item');
        this._onMediaEnded();
      };
      this.img.onerror = () => {
        console.warn('Image element error; skipping to next item');
        this._onMediaEnded();
      };
      this.iframe.onerror = () => {
        console.warn('Web content error; skipping to next item');
        this._onMediaEnded();
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
      // Start remote control connection on first load
      if (!this.signalClient) {
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
      // Determine the media URL: prefer downloaded path
      const url = (Number(song.is_downloaded) === 1 && song.song_path) ? song.song_path : song.song_url;
      if (!url) {
        console.warn('Song has no URL', song);
        this._onMediaEnded();
        return;
      }
      // Hide all elements
      this._hideAllMedia();
      // Choose element based on extension
      const ext = this._getExtension(url);
      const startedAt = Date.now();
      if (ext === 'mp4' || ext === 'm4v' || ext === 'mov') {
        this.video.src = url;
        this.video.style.display = '';
        try {
          await this.video.play();
        } catch (err) {
          console.error('Video play error', err);
          setTimeout(() => this._onMediaEnded(), 50);
        }
      } else if (ext === 'mp3' || ext === 'wav' || ext === 'aac') {
        this.audio.src = url;
        this.audio.style.display = '';
        try {
          await this.audio.play();
        } catch (err) {
          console.error('Audio play error', err);
          setTimeout(() => this._onMediaEnded(), 50);
        }
      } else if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'bmp') {
        this.img.src = url;
        this.img.style.display = '';
        // Use the song's timeinterval to determine how long to display the image
        const intervalMs = (Number(song.timeinterval) || Number(song.time) || 5) * 1000;
        setTimeout(() => {
          this._onMediaEnded();
        }, intervalMs);
      } else {
        // Fallback: treat as web content
        this.iframe.src = url;
        this.iframe.style.display = '';
        const intervalMs = (Number(song.timeinterval) || 10) * 1000;
        setTimeout(() => {
          this._onMediaEnded();
        }, intervalMs);
      }
      // Record that the song has started playing.  Store the start
      // timestamp so that minute‑based ads can be scheduled relative
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

    /**
     * Handle the end of the current media.  This method triggers
     * advertisement insertion based on song and minute counters and
     * advances playback to the next song.
     */
    async _onMediaEnded() {
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
      // Minute‑based advertisement check
      const minuteAd = await this.adsManager.checkMinuteAd(elapsed, filter);
      if (minuteAd) {
        this.resumeIndex = (this.currentSongIndex + 1) % this.playlist.length;
        await this._playAd(minuteAd);
        return;
      }
      // Song‑based advertisement check
      const songAd = await this.adsManager.checkSongAd(filter);
      if (songAd) {
        this.resumeIndex = (this.currentSongIndex + 1) % this.playlist.length;
        await this._playAd(songAd);
        return;
      }
      // Advance to next song
      this._playSongAtIndex((this.currentSongIndex + 1) % this.playlist.length);
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
      // Determine the media source.  Prefer the downloaded path if
      // download_status==1; otherwise fall back to the remote URL.
      const url = (Number(ad.download_status) === 1 && ad.adv_path) ? ad.adv_path : ad.adv_file_url;
      if (!url) {
        console.warn('Advertisement has no URL', ad);
        this.isPlayingAd = false;
        return;
      }
      // Hide other media elements
      this._hideAllMedia();
      const ext = this._getExtension(url);
      if (ext === 'mp4' || ext === 'm4v' || ext === 'mov') {
        this.video.src = url;
        this.video.style.display = '';
        this.video.onended = () => this._onMediaEnded();
        try {
          await this.video.play();
        } catch (err) {
          console.error('Video ad play error', err);
          setTimeout(() => this._onMediaEnded(), 50);
        }
      } else if (ext === 'mp3' || ext === 'wav' || ext === 'aac') {
        this.audio.src = url;
        this.audio.style.display = '';
        this.audio.onended = () => this._onMediaEnded();
        try {
          await this.audio.play();
        } catch (err) {
          console.error('Audio ad play error', err);
          setTimeout(() => this._onMediaEnded(), 50);
        }
      } else if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'bmp') {
        this.img.src = url;
        this.img.style.display = '';
        // Use advertisement's timeinterval to determine display duration
        const intervalMs = (Number(ad.timeinterval) || 5) * 1000;
        setTimeout(() => {
          this._onMediaEnded();
        }, intervalMs);
      } else {
        // Web advertisement
        this.iframe.src = url;
        this.iframe.style.display = '';
        const intervalMs = (Number(ad.timeinterval) || 10) * 1000;
        setTimeout(() => {
          this._onMediaEnded();
        }, intervalMs);
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
      // Pause any media that might still be playing
      try { this.video.pause(); } catch (err) {}
      try { this.audio.pause(); } catch (err) {}
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
        if (now - this._lastProgressTime > 30000) {
          // No progress for over 30 seconds; restart current media
          console.warn('Playback stalled; restarting current media');
          if (this.isPlayingAd) {
            // Force end and resume song
            this._onMediaEnded();
          } else {
            // Restart current song
            this._playSongAtIndex(this.currentSongIndex);
          }
          this._lastProgressTime = now;
        }
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
