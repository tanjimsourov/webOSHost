/**
 * WatchdogService monitors playback state and recovers from stalls/freezes.
 * Replicates Java ApplicationChecker/MyService watchdog behavior.
 *
 * Java reference:
 *   - ApplicationChecker.java (CHECK_TIME = 300000ms, checks if app is running)
 *   - MyService.java (runnable every 150-200 seconds, checks foreground state)
 *
 * Key behaviors:
 *   - S6-R1: No infinite restart loop; enforce max retries per hour
 *   - S6-R2: Use Java intervals/timeouts where possible
 *   - Monitors playback progress and restarts if stuck
 *   - Attempts soft reload if player restart fails
 */
(function () {
  var TAG = '[WATCHDOG]';

  // Intervals matching Java
  var CHECK_INTERVAL_MS = 15000; // Check every 15 seconds
  var STALL_THRESHOLD_MS = 30000; // Consider stalled after 30 seconds no progress
  var APP_CHECK_INTERVAL_MS = 300000; // 5 minutes (Java ApplicationChecker.CHECK_TIME)

  // Max retries to prevent infinite loops (S6-R1)
  var MAX_RESTART_RETRIES_PER_HOUR = 5;
  var restartRetryCount = 0;
  var retryResetTime = Date.now() + 3600000;

  // State tracking
  var lastProgressTime = Date.now();
  var lastPlaybackState = null;
  var consecutiveStalls = 0;
  var MAX_CONSECUTIVE_STALLS = 3;

  // Timer references
  var checkTimer = null;
  var appCheckTimer = null;
  var isRunning = false;

  // Player reference
  var playerRef = null;

  /**
   * Persist watchdog state to localStorage for recovery after reload.
   */
  function persistState() {
    try {
      var state = {
        lastProgressTime: lastProgressTime,
        restartRetryCount: restartRetryCount,
        retryResetTime: retryResetTime,
        consecutiveStalls: consecutiveStalls,
        timestamp: Date.now()
      };
      localStorage.setItem('smc_watchdog_state', JSON.stringify(state));
    } catch (err) {
      console.error(TAG, 'Failed to persist state:', err);
    }
  }

  /**
   * Restore watchdog state from localStorage.
   */
  function restoreState() {
    try {
      var stateStr = localStorage.getItem('smc_watchdog_state');
      if (stateStr) {
        var state = JSON.parse(stateStr);
        // Only restore if state is recent (within 10 minutes)
        if (Date.now() - state.timestamp < 600000) {
          restartRetryCount = state.restartRetryCount || 0;
          retryResetTime = state.retryResetTime || Date.now() + 3600000;
          consecutiveStalls = state.consecutiveStalls || 0;
          console.log(TAG, 'Restored state - retries:', restartRetryCount, 'stalls:', consecutiveStalls);
        }
      }
    } catch (err) {
      console.error(TAG, 'Failed to restore state:', err);
    }
  }

  /**
   * Check and reset retry counter if hour has passed.
   */
  function checkRetryLimit() {
    var now = Date.now();
    if (now > retryResetTime) {
      restartRetryCount = 0;
      retryResetTime = now + 3600000;
      console.log(TAG, 'Retry counter reset');
    }
    return restartRetryCount < MAX_RESTART_RETRIES_PER_HOUR;
  }

  /**
   * Record playback progress. Called by player on timeupdate events.
   */
  function recordProgress() {
    lastProgressTime = Date.now();
    consecutiveStalls = 0; // Reset stall counter on progress
  }

  /**
   * Get current playback state from player.
   */
  function getPlaybackState() {
    if (!playerRef) {
      return { isPlaying: false, currentTime: 0, paused: true };
    }

    var video = playerRef.video;
    var audio = playerRef.audio;
    var activeElement = null;

    if (video && video.style.display !== 'none') {
      activeElement = video;
    } else if (audio && audio.style.display !== 'none') {
      activeElement = audio;
    }

    if (!activeElement) {
      return { isPlaying: false, currentTime: 0, paused: true, type: 'none' };
    }

    return {
      isPlaying: !activeElement.paused && !activeElement.ended,
      currentTime: activeElement.currentTime || 0,
      paused: activeElement.paused,
      ended: activeElement.ended,
      type: activeElement === video ? 'video' : 'audio'
    };
  }

  /**
   * Check if playback is stalled.
   */
  function isPlaybackStalled() {
    var now = Date.now();
    var timeSinceProgress = now - lastProgressTime;
    var state = getPlaybackState();

    // If actively playing but no progress for threshold, it's stalled
    if (state.isPlaying && timeSinceProgress > STALL_THRESHOLD_MS) {
      return true;
    }

    // Check if state hasn't changed and we expected playback
    if (lastPlaybackState && state.isPlaying && lastPlaybackState.isPlaying) {
      if (Math.abs(state.currentTime - lastPlaybackState.currentTime) < 0.1) {
        // Time hasn't advanced
        if (timeSinceProgress > STALL_THRESHOLD_MS) {
          return true;
        }
      }
    }

    lastPlaybackState = state;
    return false;
  }

  /**
   * Attempt to restart the current media.
   */
  function restartCurrentMedia() {
    if (!playerRef) {
      console.warn(TAG, 'No player reference, cannot restart');
      return false;
    }

    console.log(TAG, 'Attempting to restart current media');

    try {
      // If playing an ad, force end it
      if (playerRef.isPlayingAd) {
        console.log(TAG, 'Forcing ad end');
        playerRef._onMediaEnded();
        return true;
      }

      // Restart current song
      var currentIndex = playerRef.currentSongIndex || 0;
      console.log(TAG, 'Restarting song at index:', currentIndex);
      playerRef._playSongAtIndex(currentIndex);
      return true;
    } catch (err) {
      console.error(TAG, 'Failed to restart media:', err);
      return false;
    }
  }

  /**
   * Attempt a soft reload of the route/app.
   */
  function softReload() {
    console.warn(TAG, 'Attempting soft reload');

    try {
      // Try to navigate to home route to trigger remount
      if (window.router && typeof router.navigate === 'function') {
        router.navigate('/home');
        return true;
      }

      // Fallback: reload the page
      console.warn(TAG, 'Router not available, reloading page');
      window.location.reload();
      return true;
    } catch (err) {
      console.error(TAG, 'Soft reload failed:', err);
      return false;
    }
  }

  /**
   * Main watchdog check routine.
   */
  function performCheck() {
    if (!isRunning) {
      return;
    }

    var state = getPlaybackState();

    // Skip check if nothing is supposed to be playing
    if (state.type === 'none' || state.paused || state.ended) {
      lastProgressTime = Date.now(); // Reset timer when not playing
      return;
    }

    if (isPlaybackStalled()) {
      consecutiveStalls++;
      console.warn(TAG, 'Playback stall detected. Consecutive stalls:', consecutiveStalls);

      if (!checkRetryLimit()) {
        console.error(TAG, 'Max restart retries reached for this hour');
        return;
      }

      restartRetryCount++;
      persistState();

      if (consecutiveStalls >= MAX_CONSECUTIVE_STALLS) {
        // Too many consecutive stalls, try soft reload
        console.warn(TAG, 'Too many consecutive stalls, attempting soft reload');
        softReload();
        consecutiveStalls = 0;
      } else {
        // Try restarting current media
        var success = restartCurrentMedia();
        if (success) {
          lastProgressTime = Date.now();
        }
      }
    }
  }

  /**
   * Application-level check (like Java ApplicationChecker).
   * Verifies the app is still responsive.
   */
  function performAppCheck() {
    console.log(TAG, 'Performing app-level check');

    // Check if DOM is responsive
    try {
      var testEl = document.createElement('div');
      testEl.id = 'watchdog-test-' + Date.now();
      document.body.appendChild(testEl);
      var found = document.getElementById(testEl.id);
      document.body.removeChild(testEl);

      if (!found) {
        console.error(TAG, 'DOM not responsive');
        softReload();
        return;
      }
    } catch (err) {
      console.error(TAG, 'App check failed:', err);
      softReload();
      return;
    }

    // Check if player is in a valid state
    if (playerRef && playerRef.playlist && playerRef.playlist.length > 0) {
      var state = getPlaybackState();
      if (state.type === 'none' && !playerRef.isPlayingAd) {
        console.warn(TAG, 'Player has playlist but nothing playing, restarting');
        if (checkRetryLimit()) {
          restartRetryCount++;
          restartCurrentMedia();
        }
      }
    }

    console.log(TAG, 'App check complete - app is responsive');
  }

  /**
   * Start the watchdog service.
   * @param {Object} options - Configuration options
   * @param {Player} options.player - Player instance to monitor
   */
  function start(options) {
    if (isRunning) {
      console.log(TAG, 'Watchdog already running');
      return;
    }

    options = options || {};
    playerRef = options.player || null;

    console.log(TAG, 'Starting watchdog service');
    console.log(TAG, 'Check interval:', CHECK_INTERVAL_MS, 'ms');
    console.log(TAG, 'Stall threshold:', STALL_THRESHOLD_MS, 'ms');
    console.log(TAG, 'App check interval:', APP_CHECK_INTERVAL_MS, 'ms');

    // Restore previous state
    restoreState();

    isRunning = true;
    lastProgressTime = Date.now();

    // Start playback check timer
    checkTimer = setInterval(function () {
      performCheck();
    }, CHECK_INTERVAL_MS);

    // Start app-level check timer (like Java ApplicationChecker)
    appCheckTimer = setInterval(function () {
      performAppCheck();
    }, APP_CHECK_INTERVAL_MS);

    // Hook into player progress events if available
    if (playerRef) {
      hookPlayerEvents();
    }

    console.log(TAG, 'Watchdog service started');
  }

  /**
   * Hook into player events for progress tracking.
   */
  function hookPlayerEvents() {
    if (!playerRef) return;

    // Hook video timeupdate
    if (playerRef.video) {
      var originalVideoTimeUpdate = playerRef.video.ontimeupdate;
      playerRef.video.ontimeupdate = function () {
        recordProgress();
        if (originalVideoTimeUpdate) {
          originalVideoTimeUpdate.call(playerRef.video);
        }
      };
    }

    // Hook audio timeupdate
    if (playerRef.audio) {
      var originalAudioTimeUpdate = playerRef.audio.ontimeupdate;
      playerRef.audio.ontimeupdate = function () {
        recordProgress();
        if (originalAudioTimeUpdate) {
          originalAudioTimeUpdate.call(playerRef.audio);
        }
      };
    }

    console.log(TAG, 'Hooked player events');
  }

  /**
   * Stop the watchdog service.
   */
  function stop() {
    if (!isRunning) {
      console.log(TAG, 'Watchdog not running');
      return;
    }

    console.log(TAG, 'Stopping watchdog service');

    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }

    if (appCheckTimer) {
      clearInterval(appCheckTimer);
      appCheckTimer = null;
    }

    isRunning = false;
    persistState();
    console.log(TAG, 'Watchdog service stopped');
  }

  /**
   * Update player reference (e.g., after player recreation).
   */
  function setPlayer(player) {
    playerRef = player;
    if (isRunning && playerRef) {
      hookPlayerEvents();
    }
  }

  /**
   * Check if watchdog is running.
   */
  function isWatchdogRunning() {
    return isRunning;
  }

  /**
   * Get current watchdog status.
   */
  function getStatus() {
    return {
      isRunning: isRunning,
      lastProgressTime: lastProgressTime,
      timeSinceProgress: Date.now() - lastProgressTime,
      restartRetryCount: restartRetryCount,
      consecutiveStalls: consecutiveStalls,
      playbackState: getPlaybackState()
    };
  }

  // Expose globally
  window.WatchdogService = {
    start: start,
    stop: stop,
    setPlayer: setPlayer,
    isRunning: isWatchdogRunning,
    getStatus: getStatus,
    recordProgress: recordProgress,
    performCheck: performCheck
  };
})();
