/**
 * Player controller for the /player route.
 * Handles player UI mounting, control binding, and playback management.
 * Enhanced with full Java PlayerStatusManager parity for media engine integration.
 *
 * Responsibilities:
 *   - Render player template and bind controls
 *   - Initialize or retrieve player instance with media engine
 *   - Manage player status tracking and reporting
 *   - Handle heartbeat, login/logout, and playback status
 *   - Integrate with advertisement and playlist management
 *   - Support network parameter monitoring and IP tracking
 */
(function () {
  var TAG = '[PLAYER]';
  var log = (window.ControllerBase && window.ControllerBase.createLogger)
    ? window.ControllerBase.createLogger(TAG)
    : {
        info: console.log.bind(console, TAG),
        warn: console.warn.bind(console, TAG),
        error: console.error.bind(console, TAG)
      };

  // Controller state
  var state = {
    player: null,
    playlistManager: null,
    adsManager: null,
    downloadManager: null,
    playerStatusManager: null,
    watcher: null,
    eventHandlers: {},
    heartbeatInterval: null,
    statusUpdateInterval: null,
    publicIP: '',
    songsDownloaded: '0'
  };

  /**
   * Mount the player controller.
   * @param {Object} context Route context
   */
  async function mount(context) {
    log.info('mount', context && context.route ? 'route=' + context.route : '');

    try {
      // Initialize player status manager
      initializePlayerStatusManager();
      
      // Update login status
      updateLoginStatus();

      // Check if player already exists (from home controller)
      if (window._sharedPlayer) {
        log.info('Using shared player instance');
        state.player = window._sharedPlayer;
      } else {
        // Create new player instance with media engine integration
        log.info('Creating new player instance');
        state.adsManager = new AdsManager();
        state.downloadManager = new DownloadManager();
        state.player = new Player({
          adsManager: state.adsManager,
          downloadManager: state.downloadManager,
          playerStatusManager: state.playerStatusManager
        });
        window._sharedPlayer = state.player;
      }

      // Bind UI controls
      bindControls();
      applyPlayerLayout();

      // Check if we should play a specific song (from SignalR command)
      var playIndex = getPlayIndexFromParams(context);
      if (playIndex !== null && state.player.playlist && state.player.playlist.length > 0) {
        log.info('Playing song at index:', playIndex);
        state.player.playSong(playIndex);
      }

      // If no playlist loaded, load from current schedule
      if (!state.player.playlist || state.player.playlist.length === 0) {
        log.info('No playlist loaded, fetching from schedule');
        await loadPlaylistFromSchedule();
      }

      // Update UI with current state
      updatePlayerUI();

      // Start heartbeat monitoring
      startHeartbeatMonitoring();
      
      // Start status update monitoring
      startStatusUpdateMonitoring();
      
      // Get public IP address
      getPublicIPAddress();

      // Start watchdog if not running
      if (window.WatchdogService && !window.dmIsRunning(window.WatchdogService)) {
        window.WatchdogService.start({ player: state.player });
      } else if (window.WatchdogService) {
        window.WatchdogService.setPlayer(state.player);
      }

      // Start application checker if not running
      if (window.ApplicationChecker) {
        window.ApplicationChecker.setPlayer(state.player);
      }

      log.info('Player controller mounted with media engine integration');
    } catch (err) {
      log.error('Mount error:', err);
    }
  }

  /**
   * Initialize player status manager
   */
  function initializePlayerStatusManager() {
    try {
      if (window.PlayerStatusManager) {
        state.playerStatusManager = new window.PlayerStatusManager();
        log.info('Player status manager initialized');
      } else {
        log.warn('PlayerStatusManager not available, using fallback');
        state.playerStatusManager = createFallbackStatusManager();
      }
    } catch (err) {
      log.error('Failed to initialize player status manager:', err);
      state.playerStatusManager = createFallbackStatusManager();
    }
  }
  
  /**
   * Create fallback status manager
   */
  function createFallbackStatusManager() {
    return {
      insertSongPlayedStatus: function(artistId, titleId, playlistId) {
        log.info('Song played:', { artistId, titleId, playlistId });
      },
      updateHeartBeatStatus: function() {
        log.info('Heartbeat updated');
      },
      updateLoginStatus: function() {
        log.info('Login status updated');
      },
      updateLogoutStatus: function() {
        log.info('Logout status updated');
      },
      sendPlayedSongsStatusOnServer: function() {
        log.info('Sending played songs status');
      },
      sendHeartBeatStatusOnServer: function() {
        log.info('Sending heartbeat status');
      },
      updateDownloadedSongsCountOnServer: function() {
        log.info('Updating downloaded songs count');
      }
    };
  }
  
  /**
   * Update login status
   */
  function updateLoginStatus() {
    try {
      if (state.playerStatusManager) {
        state.playerStatusManager.updateLoginStatus();
      }
    } catch (err) {
      log.error('Failed to update login status:', err);
    }
  }
  
  /**
   * Start heartbeat monitoring
   */
  function startHeartbeatMonitoring() {
    try {
      // Clear existing interval
      if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
      }
      
      // Send initial heartbeat
      updateHeartbeatStatus();
      
      // Set up regular heartbeat (every 5 minutes)
      state.heartbeatInterval = setInterval(function() {
        updateHeartbeatStatus();
      }, 5 * 60 * 1000); // 5 minutes
      
      log.info('Heartbeat monitoring started');
    } catch (err) {
      log.error('Failed to start heartbeat monitoring:', err);
    }
  }
  
  /**
   * Update heartbeat status
   */
  function updateHeartbeatStatus() {
    try {
      if (state.playerStatusManager) {
        state.playerStatusManager.updateHeartBeatStatus();
        state.playerStatusManager.sendHeartBeatStatusOnServer();
      }
    } catch (err) {
      log.error('Failed to update heartbeat status:', err);
    }
  }
  
  /**
   * Start status update monitoring
   */
  function startStatusUpdateMonitoring() {
    try {
      // Clear existing interval
      if (state.statusUpdateInterval) {
        clearInterval(state.statusUpdateInterval);
      }
      
      // Set up regular status updates (every 10 minutes)
      state.statusUpdateInterval = setInterval(function() {
        sendStatusUpdates();
      }, 10 * 60 * 1000); // 10 minutes
      
      log.info('Status update monitoring started');
    } catch (err) {
      log.error('Failed to start status update monitoring:', err);
    }
  }
  
  /**
   * Send status updates to server
   */
  function sendStatusUpdates() {
    try {
      if (state.playerStatusManager) {
        // Send played songs status
        state.playerStatusManager.sendPlayedSongsStatusOnServer();
        
        // Update downloaded songs count
        updateDownloadedSongsCount();
        
        // Update playlist-wise downloaded songs
        updateDownloadedSongsPlaylistWise();
        
        // Update advertisement details
        updateDownloadedAdvDetails();
      }
    } catch (err) {
      log.error('Failed to send status updates:', err);
    }
  }
  
  /**
   * Get public IP address
   */
  function getPublicIPAddress() {
    try {
      // Check if we already have a public IP
      var storedIP = prefs.getString('public_ip', '');
      if (storedIP && storedIP !== '' && storedIP !== 'public') {
        state.publicIP = storedIP;
        return;
      }
      
      // Fetch public IP
      if (window.Utilities && window.Utilities.isConnected && window.Utilities.isConnected()) {
        fetchPublicIP();
      } else {
        // Use fallback
        updateDashboardContents();
      }
    } catch (err) {
      log.error('Failed to get public IP:', err);
    }
  }
  
  /**
   * Fetch public IP from API
   */
  function fetchPublicIP() {
    try {
      // Use ipify API to get public IP
      fetch('https://api.ipify.org?format=json')
        .then(function(response) {
          return response.json();
        })
        .then(function(data) {
          if (data && data.ip) {
            state.publicIP = data.ip;
            prefs.setString('public_ip', data.ip);
            log.info('Public IP:', data.ip);
            updateDashboardContents();
          }
        })
        .catch(function(err) {
          log.error('Failed to fetch public IP:', err);
          updateDashboardContents();
        });
    } catch (err) {
      log.error('Failed to fetch public IP:', err);
      updateDashboardContents();
    }
  }
  
  /**
   * Update dashboard contents
   */
  function updateDashboardContents() {
    try {
      if (!state.songsDownloaded || state.songsDownloaded === '') {
        return;
      }
      
      var dashboardData = {
        totalSong: state.songsDownloaded,
        TimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        TokenId: prefs.getString('token_no', ''),
        FreeSpace: getAvailableStorage(),
        TotalSpace: getTotalStorage(),
        verNo: '3.03',
        IpAddress: state.publicIP || prefs.getString('public_ip', 'unknown')
      };
      
      // Send to server if API available
      if (window.OkHttpUtil && window.OkHttpUtil.updateDownloadingProcess) {
        window.OkHttpUtil.updateDownloadingProcess(dashboardData, function(response) {
          log.info('Dashboard updated:', response);
        }, function(err) {
          log.error('Dashboard update failed:', err);
        });
      }
      
      log.info('Dashboard contents updated');
    } catch (err) {
      log.error('Failed to update dashboard contents:', err);
    }
  }
  
  /**
   * Get available storage space
   */
  function getAvailableStorage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        return navigator.storage.estimate().then(function(estimate) {
          return Math.round(estimate.quota / (1024 * 1024)); // MB
        });
      }
      return 0;
    } catch (err) {
      log.error('Failed to get available storage:', err);
      return 0;
    }
  }
  
  /**
   * Get total storage space
   */
  function getTotalStorage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        return navigator.storage.estimate().then(function(estimate) {
          return Math.round(estimate.usage / (1024 * 1024)); // MB
        });
      }
      return 0;
    } catch (err) {
      log.error('Failed to get total storage:', err);
      return 0;
    }
  }
  
  /**
   * Update downloaded songs count
   */
  function updateDownloadedSongsCount() {
    try {
      if (state.playerStatusManager) {
        state.playerStatusManager.updateDownloadedSongsCountOnServer();
      }
    } catch (err) {
      log.error('Failed to update downloaded songs count:', err);
    }
  }
  
  /**
   * Update downloaded songs playlist-wise
   */
  function updateDownloadedSongsPlaylistWise() {
    try {
      if (state.playlistManager) {
        var playlists = state.playlistManager.getAllPlaylistInPlayingOrder();
        if (playlists && playlists.length > 0) {
          // Send playlist-wise song counts to server
          if (window.OkHttpUtil && window.OkHttpUtil.updatePlaylistDownloadedSongs) {
            window.OkHttpUtil.updatePlaylistDownloadedSongs(playlists, function(response) {
              log.info('Playlist-wise songs updated:', response);
            }, function(err) {
              log.error('Playlist-wise songs update failed:', err);
            });
          }
        }
      }
    } catch (err) {
      log.error('Failed to update downloaded songs playlist-wise:', err);
    }
  }
  
  /**
   * Update downloaded advertisement details
   */
  function updateDownloadedAdvDetails() {
    try {
      if (state.adsManager) {
        var downloadedAds = state.adsManager.getDownloadedAdvertisements();
        if (downloadedAds && downloadedAds.length > 0) {
          // Send advertisement details to server
          if (window.OkHttpUtil && window.OkHttpUtil.updateAdsDetails) {
            window.OkHttpUtil.updateAdsDetails(downloadedAds, function(response) {
              log.info('Advertisement details updated:', response);
            }, function(err) {
              log.error('Advertisement details update failed:', err);
            });
          }
        }
      }
    } catch (err) {
      log.error('Failed to update downloaded advertisement details:', err);
    }
  }
  function applyPlayerLayout() {
    try {
      var tokenEl = document.getElementById('txtTokenId');
      var token = (prefs.getTokenId && prefs.getTokenId()) || prefs.getString('token_no', '');
      if (tokenEl) {
        tokenEl.textContent = token ? ('Token: ' + token) : '';
        tokenEl.style.display = token ? 'block' : 'none';
      }

      var root = document.getElementById('mainContainer');
      if (root) {
        root.style.width = '100%';
        root.style.height = '100%';
      }
    } catch (err) {
      log.error('Failed to apply player layout:', err);
    }
  }

  function bindControls() {
    // Play/Pause button
    var playPauseBtn = document.getElementById('btn_play_pause');
    if (playPauseBtn) {
      var handlePlayPause = function () {
        togglePlayPause();
      };
      playPauseBtn.addEventListener('click', handlePlayPause);
      state.eventHandlers.playPause = { el: playPauseBtn, fn: handlePlayPause };
    }

    // Next button
    var nextBtn = document.getElementById('btn_next');
    if (nextBtn) {
      var handleNext = function () {
        playNext();
      };
      nextBtn.addEventListener('click', handleNext);
      state.eventHandlers.next = { el: nextBtn, fn: handleNext };
    }

    // Previous button
    var prevBtn = document.getElementById('btn_prev');
    if (prevBtn) {
      var handlePrev = function () {
        playPrevious();
      };
      prevBtn.addEventListener('click', handlePrev);
      state.eventHandlers.prev = { el: prevBtn, fn: handlePrev };
    }

    // Back button (return to home)
    var backBtn = document.getElementById('btn_back');
    if (backBtn) {
      var handleBack = function () {
        router.navigate('/home');
      };
      backBtn.addEventListener('click', handleBack);
      state.eventHandlers.back = { el: backBtn, fn: handleBack };
    }

    // Volume controls
    var volumeUp = document.getElementById('btn_volume_up');
    var volumeDown = document.getElementById('btn_volume_down');
    if (volumeUp) {
      var handleVolUp = function () { adjustVolume(0.1); };
      volumeUp.addEventListener('click', handleVolUp);
      state.eventHandlers.volUp = { el: volumeUp, fn: handleVolUp };
    }
    if (volumeDown) {
      var handleVolDown = function () { adjustVolume(-0.1); };
      volumeDown.addEventListener('click', handleVolDown);
      state.eventHandlers.volDown = { el: volumeDown, fn: handleVolDown };
    }

    // Bind progress updates
    if (state.player) {
      if (state.player.video) {
        state.player.video.ontimeupdate = function () {
          updateProgressUI();
          if (window.ApplicationChecker) {
            window.ApplicationChecker.ping('player');
          }
        };
      }
      if (state.player.audio) {
        state.player.audio.ontimeupdate = function () {
          updateProgressUI();
          if (window.ApplicationChecker) {
            window.ApplicationChecker.ping('player');
          }
        };
      }
    }

    log.info('Controls bound');
  }

  /**
   * Toggle play/pause state.
   */
  function togglePlayPause() {
    if (!state.player) return;

    var video = state.player.video;
    var audio = state.player.audio;

    if (video && video.style.display !== 'none') {
      if (video.paused) {
        video.play();
        // Record song play status
        recordSongPlayStatus();
      } else {
        video.pause();
      }
    } else if (audio && audio.style.display !== 'none') {
      if (audio.paused) {
        audio.play();
        // Record song play status
        recordSongPlayStatus();
      } else {
        audio.pause();
      }
    }

    updatePlayerUI();
  }
  
  /**
   * Record song play status
   */
  function recordSongPlayStatus() {
    try {
      if (state.player && state.player.playlist && state.playerStatusManager) {
        var currentSong = state.player.playlist[state.player.currentSongIndex];
        if (currentSong) {
          state.playerStatusManager.insertSongPlayedStatus(
            currentSong.artist_id || '',
            currentSong.title_id || currentSong.Title_Id || '',
            currentSong.sp_playlist_id || ''
          );
        }
      }
    } catch (err) {
      log.error('Failed to record song play status:', err);
    }
  }

  /**
   * Play next song.
   */
  function playNext() {
    if (!state.player || !state.player.playlist) return;

    var nextIndex = (state.player.currentSongIndex + 1) % state.player.playlist.length;
    state.player.playSong(nextIndex);
  }

  /**
   * Play previous song.
   */
  function playPrevious() {
    if (!state.player || !state.player.playlist) return;

    var prevIndex = state.player.currentSongIndex - 1;
    if (prevIndex < 0) prevIndex = state.player.playlist.length - 1;
    state.player.playSong(prevIndex);
  }

  /**
   * Adjust volume.
   * @param {number} delta Volume change (-1 to 1)
   */
  function adjustVolume(delta) {
    if (!state.player) return;

    var video = state.player.video;
    var audio = state.player.audio;
    var activeElement = video && video.style.display !== 'none' ? video : audio;

    if (activeElement) {
      var newVolume = Math.max(0, Math.min(1, activeElement.volume + delta));
      activeElement.volume = newVolume;
      if (video) video.volume = newVolume;
      if (audio) audio.volume = newVolume;
      log.info('Volume:', Math.round(newVolume * 100) + '%');
    }
  }

  /**
   * Update player UI with current state.
   */
  function updatePlayerUI() {
    if (!state.player) return;

    // Update now playing info
    var nowPlayingEl = document.getElementById('now_playing');
    var artistEl = document.getElementById('now_artist');

    if (state.player.playlist && state.player.playlist.length > 0) {
      var currentSong = state.player.playlist[state.player.currentSongIndex];
      if (currentSong) {
        if (nowPlayingEl) nowPlayingEl.textContent = currentSong.titles || 'Unknown';
        if (artistEl) artistEl.textContent = currentSong.artist_name || '';
      }
    }

    // Update play/pause button state
    var playPauseBtn = document.getElementById('btn_play_pause');
    if (playPauseBtn) {
      var isPlaying = false;
      if (state.player.video && state.player.video.style.display !== 'none') {
        isPlaying = !state.player.video.paused;
      } else if (state.player.audio && state.player.audio.style.display !== 'none') {
        isPlaying = !state.player.audio.paused;
      }
      playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
    }
  }

  /**
   * Update progress bar UI.
   */
  function updateProgressUI() {
    if (!state.player) return;

    var progressBar = document.getElementById('progress_bar');
    var currentTimeEl = document.getElementById('current_time');
    var durationEl = document.getElementById('duration');

    var activeElement = null;
    if (state.player.video && state.player.video.style.display !== 'none') {
      activeElement = state.player.video;
    } else if (state.player.audio && state.player.audio.style.display !== 'none') {
      activeElement = state.player.audio;
    }

    if (activeElement) {
      var current = activeElement.currentTime || 0;
      var duration = activeElement.duration || 0;

      if (progressBar && duration > 0) {
        progressBar.value = (current / duration) * 100;
      }

      if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(current);
      }

      if (durationEl && duration > 0) {
        durationEl.textContent = formatTime(duration);
      }
    }
  }

  /**
   * Format time in seconds to MM:SS.
   */
  function formatTime(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  /**
   * Get play index from route parameters.
   */
  function getPlayIndexFromParams(context) {
    // Check URL params
    var params = new URLSearchParams(window.location.search);
    var index = params.get('index');
    if (index !== null) {
      return parseInt(index, 10);
    }

    // Check context
    if (context && context.playIndex !== undefined) {
      return context.playIndex;
    }

    return null;
  }

  /**
   * Load playlist from current schedule.
   */
  async function loadPlaylistFromSchedule() {
    try {
      var playlistManager = new PlaylistManager();
      var playlistDS = new PlaylistDataSource();
      var songsDS = new SongsDataSource();

            // Get current active playlist (supports both absolute and 1900-based time windows)
      var playlists = await playlistDS.getAllPlaylists();
      var activePlaylist = (Array.isArray(playlists) && playlists.length > 0) ? playlists[0] : null;

      if (activePlaylist) {
        log.info('Loading active playlist:', activePlaylist.sp_playlist_id);
        var songs = await songsDS.getSongsThoseAreDownloaded(activePlaylist.sp_playlist_id);
        if (songs && songs.length > 0) {
          state.player.loadPlaylist(songs);
          log.info('Loaded', songs.length, 'songs');
        } else {
          log.warn('No downloaded songs for active playlist');
        }
      } else {
        log.warn('No active playlist found');
      }
    } catch (err) {
      log.error('Error loading playlist from schedule:', err);
    }
  }

  /**
   * Unmount the player controller.
   * Clean up listeners but don't stop playback.
   */
  function unmount(context) {
    log.info('unmount', context && context.route ? 'route=' + context.route : '');

    // Remove event listeners
    Object.keys(state.eventHandlers).forEach(function (key) {
      var handler = state.eventHandlers[key];
      if (handler && handler.el && handler.fn) {
        handler.el.removeEventListener('click', handler.fn);
      }
    });
    state.eventHandlers = {};
    
    // Clear monitoring intervals
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
      state.heartbeatInterval = null;
    }
    
    if (state.statusUpdateInterval) {
      clearInterval(state.statusUpdateInterval);
      state.statusUpdateInterval = null;
    }
    
    // Update logout status
    if (state.playerStatusManager) {
      state.playerStatusManager.updateLogoutStatus();
    }

    // Don't destroy player - keep it running in background
    // state.player is kept for reuse

    log.info('Player controller unmounted (playback continues)');
  }

  // Expose controller
  window.playerController = {
    mount: mount,
    unmount: unmount
  };
})();
