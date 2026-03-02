/**
 * LaunchReceiver mirrors Android's LaunchReceiver for app lifecycle events.
 * Handles app launch, resume, visibility changes, and network reconnection.
 *
 * Java reference: LaunchReceiver.java (handles BOOT_COMPLETED, QUICKBOOT_POWERON)
 *
 * Hooked events:
 *   - visibilitychange: When app becomes visible/hidden
 *   - online/offline: Network status changes
 *   - webOS launch events (if available)
 *   - focus/blur: Window focus changes
 */
(function () {
  var TAG = '[LaunchReceiver]';

  // Module references
  var routerRef = null;
  var schedulerRef = null;
  var signalrClientRef = null;
  var applicationCheckerRef = null;

  // State tracking
  var isInitialized = false;
  var wasOffline = false;
  var lastVisibleTime = Date.now();

  // Debounce timers
  var reconnectDebounce = null;
  var RECONNECT_DEBOUNCE_MS = 2000;

  /**
   * Initialize the LaunchReceiver and hook into lifecycle events.
   * @param {Object} options Configuration options
   * @param {Object} options.router Router instance
   * @param {Object} options.scheduler Scheduler instance
   * @param {Object} options.signalrClient SignalRClient instance
   * @param {Object} options.applicationChecker ApplicationChecker instance
   */
  function init(options) {
    if (isInitialized) {
      console.log(TAG, 'Already initialized');
      return;
    }

    options = options || {};
    routerRef = options.router || window.router || null;
    schedulerRef = options.scheduler || window.Scheduler || null;
    signalrClientRef = options.signalrClient || window.SignalRClient || null;
    applicationCheckerRef = options.applicationChecker || window.ApplicationChecker || null;

    console.log(TAG, 'Initializing LaunchReceiver');

    // Hook visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Hook online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Hook focus/blur
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Hook webOS-specific events if available
    hookWebOSEvents();

    // Set initial state
    wasOffline = !navigator.onLine;
    lastVisibleTime = Date.now();

    isInitialized = true;
    console.log(TAG, 'LaunchReceiver initialized');

    // Trigger initial launch sequence
    onAppLaunched();
  }

  /**
   * Handle document visibility change.
   */
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      console.log(TAG, 'App became visible');
      onAppResumed();
    } else {
      console.log(TAG, 'App became hidden');
      onAppPaused();
    }
  }

  /**
   * Handle network coming online.
   */
  function handleOnline() {
    console.log(TAG, 'Network online');
    wasOffline = false;

    // Debounce reconnection to avoid rapid fire
    if (reconnectDebounce) {
      clearTimeout(reconnectDebounce);
    }
    reconnectDebounce = setTimeout(function () {
      onNetworkRestored();
    }, RECONNECT_DEBOUNCE_MS);
  }

  /**
   * Handle network going offline.
   */
  function handleOffline() {
    console.log(TAG, 'Network offline');
    wasOffline = true;
  }

  /**
   * Handle window focus.
   */
  function handleFocus() {
    console.log(TAG, 'Window focused');
    // Similar to visibility, but may fire more frequently
  }

  /**
   * Handle window blur.
   */
  function handleBlur() {
    console.log(TAG, 'Window blurred');
  }

  /**
   * Hook webOS-specific launch events if available.
   */
  function hookWebOSEvents() {
    // Check for webOS visibility API
    if (window.webOS && window.webOS.platformBack) {
      console.log(TAG, 'webOS platform detected');
    }

    // webOS launch params callback
    if (window.webOS && typeof window.webOS.fetchAppInfo === 'function') {
      window.webOS.fetchAppInfo(function (appInfo) {
        console.log(TAG, 'webOS app info:', appInfo);
      });
    }

    // webOS relaunch handling
    if (window.webOS && window.webOS.appinfo) {
      console.log(TAG, 'webOS appinfo:', window.webOS.appinfo);
    }

    // Listen for webOS-specific window events
    document.addEventListener('webOSRelaunch', function (event) {
      console.log(TAG, 'webOS relaunch event:', event);
      onAppLaunched();
    });
  }

  /**
   * Called when app is first launched or relaunched.
   */
  function onAppLaunched() {
    console.log(TAG, 'App launched');

    // Ensure scheduler is running
    if (schedulerRef && typeof schedulerRef.start === 'function') {
      if (!window.dmIsRunning(schedulerRef)) {
        console.log(TAG, 'Starting scheduler on launch');
        schedulerRef.start();
      }
    }

    // Connect SignalR
    if (signalrClientRef && typeof signalrClientRef.connect === 'function') {
      var isConnected = typeof signalrClientRef.isConnected === 'function'
        ? signalrClientRef.isConnected()
        : false;
      if (!isConnected) {
        console.log(TAG, 'Connecting SignalR on launch');
        signalrClientRef.connect();
      }
    }

    // Start application checker
    if (applicationCheckerRef && typeof applicationCheckerRef.start === 'function') {
      console.log(TAG, 'Starting ApplicationChecker on launch');
      applicationCheckerRef.start({
        scheduler: schedulerRef,
        signalrClient: signalrClientRef
      });
    }

    // Ping application checker
    if (applicationCheckerRef && typeof applicationCheckerRef.ping === 'function') {
      applicationCheckerRef.ping('launch');
    }
  }

  /**
   * Called when app resumes from background/hidden state.
   */
  function onAppResumed() {
    console.log(TAG, 'App resumed');
    var now = Date.now();
    var hiddenDuration = now - lastVisibleTime;
    lastVisibleTime = now;

    console.log(TAG, 'Was hidden for', Math.round(hiddenDuration / 1000), 'seconds');

    // If app was hidden for more than 1 minute, refresh
    if (hiddenDuration > 60000) {
      console.log(TAG, 'Long pause detected, triggering refresh');

      // Force scheduler refresh
      if (schedulerRef && typeof schedulerRef.forceRefresh === 'function') {
        schedulerRef.forceRefresh();
      }

      // Reconnect SignalR if needed
      if (signalrClientRef) {
        var isConnected = typeof signalrClientRef.isConnected === 'function'
          ? signalrClientRef.isConnected()
          : false;
        if (!isConnected && typeof signalrClientRef.connect === 'function') {
          console.log(TAG, 'Reconnecting SignalR after resume');
          signalrClientRef.connect();
        }
      }
    }

    // Ping application checker
    if (applicationCheckerRef && typeof applicationCheckerRef.ping === 'function') {
      applicationCheckerRef.ping('resume');
    }

    // Trigger MyReceiver if available
    if (window.MyReceiver && typeof window.MyReceiver.trigger === 'function') {
      window.MyReceiver.trigger('APP_CHECK');
    }
  }

  /**
   * Called when app goes to background/hidden state.
   */
  function onAppPaused() {
    console.log(TAG, 'App paused');
    lastVisibleTime = Date.now();
  }

  /**
   * Called when network connection is restored.
   */
  function onNetworkRestored() {
    console.log(TAG, 'Network restored, triggering reconnection');

    // Reconnect SignalR
    if (signalrClientRef && typeof signalrClientRef.connect === 'function') {
      console.log(TAG, 'Reconnecting SignalR after network restore');
      signalrClientRef.connect();
    }

    // Force scheduler refresh
    if (schedulerRef && typeof schedulerRef.forceRefresh === 'function') {
      console.log(TAG, 'Refreshing schedule after network restore');
      schedulerRef.forceRefresh();
    }

    // Ping application checker
    if (applicationCheckerRef && typeof applicationCheckerRef.ping === 'function') {
      applicationCheckerRef.ping('network');
    }

    // Flush any queued status reports
    if (window.StatusReporter && typeof window.StatusReporter.flushQueue === 'function') {
      console.log(TAG, 'Flushing status queue after network restore');
      window.StatusReporter.flushQueue();
    }
  }

  /**
   * Cleanup and remove event listeners.
   */
  function destroy() {
    console.log(TAG, 'Destroying LaunchReceiver');

    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('blur', handleBlur);

    if (reconnectDebounce) {
      clearTimeout(reconnectDebounce);
    }

    isInitialized = false;
    console.log(TAG, 'LaunchReceiver destroyed');
  }

  /**
   * Check if initialized.
   */
  function isReady() {
    return isInitialized;
  }

  // Expose globally
  window.LaunchReceiver = {
    init: init,
    destroy: destroy,
    isReady: isReady,
    onAppLaunched: onAppLaunched,
    onAppResumed: onAppResumed,
    onNetworkRestored: onNetworkRestored
  };
})();
