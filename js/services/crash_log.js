/**
 * CrashLogService collects unhandled errors and promise rejections
 * across the application and forwards them to the backend via the
 * `TokenCrashLog` endpoint.  When offline or if a network error
 * occurs, crash logs are queued in localStorage and flushed when
 * connectivity is restored.  Each log entry contains the current
 * `TokenId` and the error message/stack trace.
 *
 * Usage: include this script on startup.  It automatically hooks
 * into `window.onerror` and `window.onunhandledrejection`.
 */
(function() {
  class CrashLogService {
    constructor() {
      this.queueKey = 'crash_logs_queue';
      this._flush = this._flush.bind(this);
    }

    /**
     * Initialize crash handlers.  This method should be invoked once
     * during application startup.  It attaches listeners for
     * uncaught errors and promise rejections and attempts to flush
     * any queued logs from previous sessions.
     */
    init() {
      window.addEventListener('error', (evt) => {
        const msg = evt.message || (evt.error && evt.error.stack) || String(evt.error);
        this._capture(msg);
      });
      window.addEventListener('unhandledrejection', (evt) => {
        const msg = evt.reason && (evt.reason.stack || evt.reason.message) || String(evt.reason);
        this._capture(msg);
      });
      // Attempt to flush queued logs on init
      this._flush();
      // Flush again whenever connectivity returns
      window.addEventListener('online', this._flush);
    }

    /**
     * Capture a crash message.  If online it is sent immediately,
     * otherwise it is queued in localStorage under `queueKey`.
     * @param {string} msg Crash message or stack trace.
     */
    _capture(msg) {
      try {
        const tokenId = prefs.getString('token_no', '') || prefs.getString('TokenId', '');
        const payload = {
          TokenId: tokenId,
          crash_message: msg
        };
        if (navigator.onLine) {
          this._send(payload);
        } else {
          this._enqueue(payload);
        }
      } catch (err) {
        console.error('[CrashLogService]', 'Failed to capture crash', err);
      }
    }

    /**
     * Send a crash log to the server.  Errors are logged and
     * unsent payloads are queued for later delivery.
     */
    _send(payload) {
      const listener = {
        onResponse: function(text, tag) {
          console.log('[CrashLogService]', 'Crash log sent', text);
        },
        onError: (err, tag) => {
          console.error('[CrashLogService]', 'Crash log failed, queuing', err);
          this._enqueue(payload);
        }
      };
      try {
        OkHttpUtil.callRequest(
          ENDPOINTS.UPDATE_CRASH_LOG,
          JSON.stringify(payload),
          listener,
          TAGS.UPDATE_CRASH_LOG_TAG
        );
      } catch (err) {
        console.error('[CrashLogService]', 'Call to UpdateCrashLog failed, queuing', err);
        this._enqueue(payload);
      }
    }

    /**
     * Add a payload to the queue stored in localStorage.
     */
    _enqueue(payload) {
      try {
        const raw = localStorage.getItem(this.queueKey);
        const queue = raw ? JSON.parse(raw) : [];
        queue.push(payload);
        localStorage.setItem(this.queueKey, JSON.stringify(queue));
      } catch (err) {
        console.error('[CrashLogService]', 'Failed to enqueue crash log', err);
      }
    }

    /**
     * Flush queued crash logs when online.  Each queued entry is
     * sent in order; on success it is removed from the queue.  If
     * sending fails the remaining items stay queued until the next
     * flush attempt.
     */
    _flush() {
      if (!navigator.onLine) return;
      try {
        const raw = localStorage.getItem(this.queueKey);
        const queue = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(queue) || queue.length === 0) return;
        const remaining = [];
        let promise = Promise.resolve();
        queue.forEach((payload) => {
          promise = promise.then(() => {
            return new Promise((resolve) => {
              const listener = {
                onResponse: function(text, tag) {
                  resolve();
                },
                onError: function(err, tag) {
                  console.error('[CrashLogService]', 'Flush error', err);
                  remaining.push(payload);
                  resolve();
                }
              };
              OkHttpUtil.callRequest(
                ENDPOINTS.UPDATE_CRASH_LOG,
                JSON.stringify(payload),
                listener,
                TAGS.UPDATE_CRASH_LOG_TAG
              );
            });
          });
        });
        promise.then(() => {
          if (remaining.length === 0) {
            localStorage.removeItem(this.queueKey);
          } else {
            localStorage.setItem(this.queueKey, JSON.stringify(remaining));
          }
        });
      } catch (err) {
        console.error('[CrashLogService]', 'Failed to flush crash logs', err);
      }
    }
  }
  window.CrashLogService = new CrashLogService();
})();