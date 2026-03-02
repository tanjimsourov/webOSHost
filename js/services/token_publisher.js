/**
 * TokenPublisher service handles the publish/update handshake used
 * by the player to refresh schedules and media without requiring a
 * full reboot.  It mirrors the behaviour described in the API
 * payload examples and the Android codebase: the client periodically
 * polls the server via `CheckTokenPublish` and, when an update is
 * required, acknowledges it via `UpdateTokenPublish`.  After a
 * successful acknowledgement the caller should refresh playlists,
 * advertisements and downloads.
 *
 * Usage:
 *   TokenPublisher.init({
 *     onRefreshRequested: function() {
 *       // called when the server indicates a publish update is needed
 *       // your code should refresh playlists/ads and downloads
 *     }
 *   });
 *
 * The polling interval is configurable; by default it checks every
 * 30 minutes which matches the Java implementation.
 */
(function() {
  class TokenPublisher {
    constructor() {
      this.intervalMs = 30 * 60 * 1000; // 30 minutes
      this.timer = null;
      this.onRefreshRequested = null;
    }

    /**
     * Initialise the publisher.  Accepts a callback invoked when
     * the server requests a publish update.  Starts the periodic
     * polling immediately.
     * @param {Object} opts
     * @param {Function} opts.onRefreshRequested Callback invoked when
     *     the server signals an update is needed.
     * @param {number} [opts.intervalMs] Optional polling interval.
     */
    init(opts = {}) {
      if (typeof opts.onRefreshRequested === 'function') {
        this.onRefreshRequested = opts.onRefreshRequested;
      }
      if (typeof opts.intervalMs === 'number') {
        this.intervalMs = opts.intervalMs;
      }
      this.stop();
      // Immediately perform a check then schedule periodic polling
      this._check();
      this.timer = setInterval(() => this._check(), this.intervalMs);
    }

    /**
     * Stop polling.  Safe to call multiple times.
     */
    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    /**
     * Perform the check/update handshake.  Sends an empty array
     * payload to `CheckTokenPublish` and, if `IsPublishUpdate` is
     * "1", invokes the onRefreshRequested callback and then
     * acknowledges via `UpdateTokenPublish`.
     */
    _check() {
      const listener = {
        onResponse: (text, tag) => {
          let json;
          try {
            json = JSON.parse(text);
          } catch (err) {
            console.error('[TokenPublisher]', 'Failed to parse CheckTokenPublish response', err);
            return;
          }
          // Response expected to be an array with IsPublishUpdate flag
          try {
            const arr = Array.isArray(json) ? json : json.data || [];
            if (arr && arr.length > 0) {
              const flag = arr[0].IsPublishUpdate || arr[0].isPublishUpdate;
              if (String(flag) === '1') {
                console.log('[TokenPublisher]', 'Publish update flag received');
                if (typeof this.onRefreshRequested === 'function') {
                  try {
                    this.onRefreshRequested();
                  } catch (err) {
                    console.error('[TokenPublisher]', 'Error invoking refresh callback', err);
                  }
                }
                // After handling refresh, call update
                this._update();
              }
            }
          } catch (err) {
            console.error('[TokenPublisher]', 'Error handling CheckTokenPublish response', err);
          }
        },
        onError: (err, tag) => {
          console.error('[TokenPublisher]', 'CheckTokenPublish error', err);
        }
      };
      try {
        OkHttpUtil.callRequest(
          ENDPOINTS.CHECK_TOKEN_PUBLISH,
          JSON.stringify([{}]),
          listener,
          TAGS.CHECK_TOKEN_PUBLISH_TAG
        );
      } catch (err) {
        console.error('[TokenPublisher]', 'Failed to invoke CheckTokenPublish', err);
      }
    }

    /**
     * Acknowledge that the token has been refreshed by calling
     * UpdateTokenPublish with the current token id.  Errors are
     * logged but not retried here; the periodic checker will
     * eventually attempt another update if needed.
     */
    _update() {
      const tokenId = prefs.getString('token_no', '') || prefs.getString('TokenId', '');
      const listener = {
        onResponse: (text, tag) => {
          // Success is indicated by IsPublishUpdate="0" in response array
          console.log('[TokenPublisher]', 'UpdateTokenPublish response', text);
        },
        onError: (err, tag) => {
          console.error('[TokenPublisher]', 'UpdateTokenPublish error', err);
        }
      };
      const body = [{ TokenId: tokenId }];
      try {
        OkHttpUtil.callRequest(
          ENDPOINTS.UPDATE_TOKEN_PUBLISH,
          JSON.stringify(body),
          listener,
          TAGS.UPDATE_TOKEN_PUBLISH_TAG
        );
      } catch (err) {
        console.error('[TokenPublisher]', 'Failed to invoke UpdateTokenPublish', err);
      }
    }
  }
  // Expose globally
  window.TokenPublisher = new TokenPublisher();
})();