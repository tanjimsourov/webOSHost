/**
 * MyReceiver emulates Android's MyReceiver for alarm-like event handling.
 * Centralizes trigger-based events that would be BroadcastReceiver intents in Android.
 *
 * Java reference: MyReceiver.java (handles alarm triggers)
 *
 * Supported trigger types:
 *   - SCHEDULE_DUE: Time to refresh schedule
 *   - PLAYLIST_DUE: Time to check playlist
 *   - HEARTBEAT: Periodic heartbeat trigger
 *   - DOWNLOAD_CHECK: Check for pending downloads
 */
(function () {
  var TAG = '[MyReceiver]';

  // Module references
  var schedulerRef = null;
  var playlistWatcherRef = null;
  var applicationCheckerRef = null;
  var downloadManagerRef = null;

  // Trigger type constants
  var TRIGGER_TYPES = {
    SCHEDULE_DUE: 'SCHEDULE_DUE',
    PLAYLIST_DUE: 'PLAYLIST_DUE',
    HEARTBEAT: 'HEARTBEAT',
    DOWNLOAD_CHECK: 'DOWNLOAD_CHECK',
    SIGNALR_RECONNECT: 'SIGNALR_RECONNECT',
    APP_CHECK: 'APP_CHECK'
  };

  // Event listeners
  var listeners = {};

  /**
   * Initialize the receiver with required module references.
   * @param {Object} options Configuration options
   * @param {Object} options.scheduler Scheduler instance
   * @param {Object} options.playlistWatcher PlaylistWatcher instance
   * @param {Object} options.applicationChecker ApplicationChecker instance
   * @param {Object} options.downloadManager DownloadManager instance (optional)
   */
  function init(options) {
    options = options || {};
    schedulerRef = options.scheduler || window.Scheduler || null;
    playlistWatcherRef = options.playlistWatcher || null;
    applicationCheckerRef = options.applicationChecker || window.ApplicationChecker || null;
    downloadManagerRef = options.downloadManager || null;

    console.log(TAG, 'Initialized with refs:',
      'scheduler=' + !!schedulerRef,
      'playlistWatcher=' + !!playlistWatcherRef,
      'applicationChecker=' + !!applicationCheckerRef,
      'downloadManager=' + !!downloadManagerRef
    );
  }

  /**
   * Trigger an event. Routes the event to appropriate handlers.
   * @param {string} type Trigger type (see TRIGGER_TYPES)
   * @param {Object} payload Optional payload data
   */
  function trigger(type, payload) {
    console.log(TAG, 'Trigger received:', type, payload ? JSON.stringify(payload) : '');

    try {
      switch (type) {
        case TRIGGER_TYPES.SCHEDULE_DUE:
          handleScheduleDue(payload);
          break;

        case TRIGGER_TYPES.PLAYLIST_DUE:
          handlePlaylistDue(payload);
          break;

        case TRIGGER_TYPES.HEARTBEAT:
          handleHeartbeat(payload);
          break;

        case TRIGGER_TYPES.DOWNLOAD_CHECK:
          handleDownloadCheck(payload);
          break;

        case TRIGGER_TYPES.SIGNALR_RECONNECT:
          handleSignalRReconnect(payload);
          break;

        case TRIGGER_TYPES.APP_CHECK:
          handleAppCheck(payload);
          break;

        default:
          console.warn(TAG, 'Unknown trigger type:', type);
      }

      // Notify listeners
      notifyListeners(type, payload);

    } catch (err) {
      console.error(TAG, 'Error handling trigger:', type, err);
    }
  }

  /**
   * Handle SCHEDULE_DUE trigger - refresh schedule from server.
   */
  function handleScheduleDue(payload) {
    console.log(TAG, 'Handling SCHEDULE_DUE');

    if (schedulerRef) {
      if (typeof schedulerRef.forceRefresh === 'function') {
        schedulerRef.forceRefresh();
      } else if (typeof schedulerRef.refreshContent === 'function') {
        schedulerRef.refreshContent();
      }
    }

    // Ping application checker
    if (applicationCheckerRef && typeof applicationCheckerRef.ping === 'function') {
      applicationCheckerRef.ping('scheduler');
    }
  }

  /**
   * Handle PLAYLIST_DUE trigger - check for playlist changes.
   */
  function handlePlaylistDue(payload) {
    console.log(TAG, 'Handling PLAYLIST_DUE');

    if (playlistWatcherRef) {
      if (typeof playlistWatcherRef.check === 'function') {
        playlistWatcherRef.check();
      }
    }
  }

  /**
   * Handle HEARTBEAT trigger - update health check timestamps.
   */
  function handleHeartbeat(payload) {
    console.log(TAG, 'Handling HEARTBEAT');

    if (applicationCheckerRef && typeof applicationCheckerRef.ping === 'function') {
      applicationCheckerRef.ping('receiver');
    }

    // Also report heartbeat via StatusReporter if available
    if (window.StatusReporter && typeof window.StatusReporter.reportHeartbeat === 'function') {
      window.StatusReporter.reportHeartbeat();
    }
  }

  /**
   * Handle DOWNLOAD_CHECK trigger - check for pending downloads.
   */
  function handleDownloadCheck(payload) {
    console.log(TAG, 'Handling DOWNLOAD_CHECK');

    if (downloadManagerRef) {
      if (typeof downloadManagerRef.start === 'function') {
        downloadManagerRef.start();
      }
    } else if (schedulerRef && typeof schedulerRef.queueMissingDownloads === 'function') {
      schedulerRef.queueMissingDownloads();
    }
  }

  /**
   * Handle SIGNALR_RECONNECT trigger - reconnect SignalR client.
   */
  function handleSignalRReconnect(payload) {
    console.log(TAG, 'Handling SIGNALR_RECONNECT');

    if (window.SignalRClient) {
      if (typeof window.SignalRClient.connect === 'function') {
        window.SignalRClient.connect();
      }
    }

    // Ping application checker
    if (applicationCheckerRef && typeof applicationCheckerRef.ping === 'function') {
      applicationCheckerRef.ping('signalr');
    }
  }

  /**
   * Handle APP_CHECK trigger - perform application health check.
   */
  function handleAppCheck(payload) {
    console.log(TAG, 'Handling APP_CHECK');

    if (applicationCheckerRef && typeof applicationCheckerRef.performCheck === 'function') {
      applicationCheckerRef.performCheck();
    }
  }

  /**
   * Add a listener for trigger events.
   * @param {string} type Trigger type to listen for
   * @param {function} callback Callback function(type, payload)
   */
  function addListener(type, callback) {
    if (!listeners[type]) {
      listeners[type] = [];
    }
    listeners[type].push(callback);
  }

  /**
   * Remove a listener.
   * @param {string} type Trigger type
   * @param {function} callback Callback to remove
   */
  function removeListener(type, callback) {
    if (listeners[type]) {
      listeners[type] = listeners[type].filter(function (cb) {
        return cb !== callback;
      });
    }
  }

  /**
   * Notify all listeners for a trigger type.
   */
  function notifyListeners(type, payload) {
    if (listeners[type]) {
      listeners[type].forEach(function (callback) {
        try {
          callback(type, payload);
        } catch (err) {
          console.error(TAG, 'Listener error:', err);
        }
      });
    }
  }

  // Expose globally
  window.MyReceiver = {
    init: init,
    trigger: trigger,
    addListener: addListener,
    removeListener: removeListener,
    TYPES: TRIGGER_TYPES
  };
})();
