/**
 * ApplicationChecker mirrors Android ApplicationChecker behavior.
 * Monitors scheduler refresh, SignalR connection, and player loop health.
 * Self-heals stuck states by triggering recovery actions.
 *
 * Java reference: ApplicationChecker.java (CHECK_TIME = 300000ms)
 *
 * Key behaviors:
 *   - Detects "stuck" states (no refresh for N minutes, SignalR disconnected, player stalled)
 *   - Self-heals by calling appropriate recovery methods
 *   - Reboot/relaunch as last resort after consecutive failures
 */
(function () {
  var TAG = '[ApplicationChecker]';
  var VERBOSE = false;

  // Check interval (60 seconds)
  var CHECK_INTERVAL_MS = 60000;

  // Thresholds for detecting stuck states
  var SCHEDULER_STALE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes
  var SIGNALR_DISCONNECT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  var PLAYBACK_STALL_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

  // Reboot/reload cooldown and limits
  var MAX_CONSECUTIVE_FAILURES = 3;
  var RELOAD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between reloads

  // State tracking
  var lastScheduleRefreshAt = Date.now();
  var lastSignalrMessageAt = Date.now();
  var lastPlaybackProgressAt = Date.now();
  var consecutiveFailures = 0;
  var lastReloadAt = 0;

  // Timer reference
  var checkTimer = null;
  var isRunning = false;

  // Module references
  var schedulerRef = null;
  var signalrClientRef = null;
  var playerRef = null;
  var prefsRef = null;
  var webosBridgeRef = null;

  /**
   * Start the ApplicationChecker service.
   * @param {Object} options Configuration options
   * @param {Object} options.scheduler Scheduler instance
   * @param {Object} options.signalrClient SignalRClient instance
   * @param {Object} options.player Player instance
   * @param {Object} options.prefs Prefs instance (optional, uses window.prefs)
   * @param {Object} options.webosBridge WebOS bridge instance (optional)
   */
  function start(options) {
    if (isRunning) {
      console.log(TAG, 'Already running');
      return;
    }

    options = options || {};
    schedulerRef = options.scheduler || window.Scheduler || null;
    signalrClientRef = options.signalrClient || window.SignalRClient || null;
    playerRef = options.player || null;
    prefsRef = options.prefs || window.prefs || null;
    webosBridgeRef = options.webosBridge || window.webosBridge || null;

    console.log(TAG, 'Starting ApplicationChecker');
    console.log(TAG, 'Check interval:', CHECK_INTERVAL_MS, 'ms');
    console.log(TAG, 'Scheduler stale threshold:', SCHEDULER_STALE_THRESHOLD_MS, 'ms');
    console.log(TAG, 'SignalR disconnect threshold:', SIGNALR_DISCONNECT_THRESHOLD_MS, 'ms');
    console.log(TAG, 'Playback stall threshold:', PLAYBACK_STALL_THRESHOLD_MS, 'ms');

    // Initialize timestamps
    lastScheduleRefreshAt = Date.now();
    lastSignalrMessageAt = Date.now();
    lastPlaybackProgressAt = Date.now();
    consecutiveFailures = 0;

    isRunning = true;

    // Start periodic check
    checkTimer = setInterval(function () {
      performCheck();
    }, CHECK_INTERVAL_MS);

    console.log(TAG, 'ApplicationChecker started');
  }

  /**
   * Stop the ApplicationChecker service.
   */
  function stop() {
    if (!isRunning) {
      console.log(TAG, 'Not running');
      return;
    }

    console.log(TAG, 'Stopping ApplicationChecker');

    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }

    isRunning = false;
    console.log(TAG, 'ApplicationChecker stopped');
  }

  /**
   * Update last-known-good timestamps. Called by other modules to signal activity.
   * @param {string} tag Tag identifying the caller (e.g., 'scheduler', 'signalr', 'player')
   */
  function ping(tag) {
    var now = Date.now();
    switch (tag) {
      case 'scheduler':
        lastScheduleRefreshAt = now;
        break;
      case 'signalr':
        lastSignalrMessageAt = now;
        break;
      case 'player':
        lastPlaybackProgressAt = now;
        break;
      case 'receiver':
        // General activity ping
        lastScheduleRefreshAt = now;
        break;
      default:
        // Unknown tag, update all
        lastScheduleRefreshAt = now;
        lastSignalrMessageAt = now;
        lastPlaybackProgressAt = now;
    }
  }

  /**
   * Main check routine. Detects stuck states and triggers recovery.
   */
  function performCheck() {
    if (!isRunning) return;

    var now = Date.now();
    var issues = [];
    var recovered = false;
    if (VERBOSE) {
      console.log(TAG, 'Performing health check');
    }

    // Check 1: Scheduler freshness
    var schedulerAge = now - lastScheduleRefreshAt;
    if (schedulerAge > SCHEDULER_STALE_THRESHOLD_MS) {
      console.warn(TAG, 'Scheduler stale for', Math.round(schedulerAge / 60000), 'minutes');
      issues.push('scheduler_stale');

      if (schedulerRef) {
        try {
          if (typeof schedulerRef.isRunning === 'function' && !schedulerRef.isRunning()) {
            console.log(TAG, 'Restarting stopped scheduler');
            schedulerRef.start();
          } else if (typeof schedulerRef.forceRefresh === 'function') {
            console.log(TAG, 'Forcing scheduler refresh');
            schedulerRef.forceRefresh();
          } else if (typeof schedulerRef.refreshContent === 'function') {
            console.log(TAG, 'Calling scheduler.refreshContent');
            schedulerRef.refreshContent();
          }
          lastScheduleRefreshAt = now;
          recovered = true;
        } catch (err) {
          console.error(TAG, 'Failed to recover scheduler:', err);
        }
      }
    }

    // Check 2: SignalR connection
    var signalrAge = now - lastSignalrMessageAt;
    if (signalrAge > SIGNALR_DISCONNECT_THRESHOLD_MS) {
      console.warn(TAG, 'SignalR inactive for', Math.round(signalrAge / 60000), 'minutes');
      issues.push('signalr_inactive');

      if (signalrClientRef) {
        try {
          var isConnected = typeof signalrClientRef.isConnected === 'function'
            ? signalrClientRef.isConnected()
            : false;

          if (!isConnected) {
            console.log(TAG, 'Reconnecting SignalR client');
            if (typeof signalrClientRef.connect === 'function') {
              signalrClientRef.connect();
            }
          }
          lastSignalrMessageAt = now;
          recovered = true;
        } catch (err) {
          console.error(TAG, 'Failed to reconnect SignalR:', err);
        }
      }
    }

    // Check 3: Player playback progress
    if (playerRef) {
      var playbackAge = now - lastPlaybackProgressAt;
      var isPlaying = isPlayerPlaying();

      if (isPlaying && playbackAge > PLAYBACK_STALL_THRESHOLD_MS) {
        console.warn(TAG, 'Playback stalled for', Math.round(playbackAge / 60000), 'minutes');
        issues.push('playback_stalled');

        try {
          console.log(TAG, 'Attempting playback recovery');
          if (typeof playerRef.recoverPlayback === 'function') {
            playerRef.recoverPlayback();
          } else if (typeof playerRef._playSongAtIndex === 'function') {
            var idx = playerRef.currentSongIndex || 0;
            playerRef._playSongAtIndex(idx);
          }
          lastPlaybackProgressAt = now;
          recovered = true;
        } catch (err) {
          console.error(TAG, 'Failed to recover playback:', err);
        }
      }
    }

    // Track consecutive failures
    if (issues.length > 0 && !recovered) {
      consecutiveFailures++;
      console.warn(TAG, 'Consecutive failures:', consecutiveFailures);

      // Last resort: reload after max consecutive failures
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        if (now - lastReloadAt > RELOAD_COOLDOWN_MS) {
          console.error(TAG, 'Max consecutive failures reached, attempting recovery');
          performLastResortRecovery();
          lastReloadAt = now;
          consecutiveFailures = 0;
        } else {
          console.warn(TAG, 'Reload cooldown active, waiting');
        }
      }
    } else if (issues.length === 0) {
      consecutiveFailures = 0;
    }
    if (VERBOSE || issues.length > 0 || recovered) {
      console.log(TAG, 'Health check complete. Issues:', issues.length, 'Recovered:', recovered);
    }
  }

  /**
   * Check if player is currently supposed to be playing.
   */
  function isPlayerPlaying() {
    if (!playerRef) return false;

    try {
      // Check if playlist is loaded
      if (!playerRef.playlist || playerRef.playlist.length === 0) {
        return false;
      }

      // Check video element
      if (playerRef.video && playerRef.video.style.display !== 'none') {
        return !playerRef.video.paused && !playerRef.video.ended;
      }

      // Check audio element
      if (playerRef.audio && playerRef.audio.style.display !== 'none') {
        return !playerRef.audio.paused && !playerRef.audio.ended;
      }

      return false;
    } catch (err) {
      return false;
    }
  }

  /**
   * Perform last resort recovery - try webOS relaunch or page reload.
   */
  function performLastResortRecovery() {
    console.warn(TAG, 'Performing last resort recovery');

    // Try webOS relaunch if available
    if (webosBridgeRef && typeof webosBridgeRef.call === 'function') {
      try {
        console.log(TAG, 'Attempting webOS app relaunch');
        webosBridgeRef.call(
          'luna://com.webos.applicationManager',
          'launch',
          {
            id: 'com.smcsignage.app',
            params: { relaunch: true }
          },
          function () {
            console.log(TAG, 'WebOS relaunch succeeded');
          },
          function (err) {
            console.error(TAG, 'WebOS relaunch failed:', err);
            // Fall back to page reload
            performPageReload();
          }
        );
        return;
      } catch (err) {
        console.error(TAG, 'WebOS relaunch error:', err);
      }
    }

    // Fallback: page reload
    performPageReload();
  }

  /**
   * Perform page reload as last resort.
   */
  function performPageReload() {
    console.warn(TAG, 'Performing page reload');
    try {
      window.location.reload();
    } catch (err) {
      console.error(TAG, 'Page reload failed:', err);
    }
  }

  /**
   * Update player reference.
   */
  function setPlayer(player) {
    playerRef = player;
  }

  /**
   * Get current status.
   */
  function getStatus() {
    var now = Date.now();
    return {
      isRunning: isRunning,
      lastScheduleRefreshAt: lastScheduleRefreshAt,
      schedulerAgeMs: now - lastScheduleRefreshAt,
      lastSignalrMessageAt: lastSignalrMessageAt,
      signalrAgeMs: now - lastSignalrMessageAt,
      lastPlaybackProgressAt: lastPlaybackProgressAt,
      playbackAgeMs: now - lastPlaybackProgressAt,
      consecutiveFailures: consecutiveFailures
    };
  }

  // Expose globally
  window.ApplicationChecker = {
    start: start,
    stop: stop,
    ping: ping,
    setPlayer: setPlayer,
    getStatus: getStatus,
    performCheck: performCheck
  };
})();

