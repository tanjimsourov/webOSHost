/**
 * NetworkSpeedService periodically measures the device's network
 * throughput and reports it to the backend via the `SaveNetworkSpeed`
 * endpoint.  The Android implementation performs a download test
 * using a fixed file and posts the measured kilobits per second.
 * In the webOS port we approximate this by timing a fetch of a
 * lightweight resource (such as a small image) and computing the
 * throughput from the response size and duration.  Results are
 * aggregated and sent at a configurable interval.
 *
 * Usage:
 *   NetworkSpeedService.start({ intervalMs: 15 * 60 * 1000 });
 */
(function() {
  class NetworkSpeedService {
    constructor() {
      this.intervalMs = 15 * 60 * 1000; // default 15 minutes
      this.timer = null;
      this.testUrl = 'https://via.placeholder.com/512x512.png';
    }

    /**
     * Start periodic network speed measurement.  If already
     * running, the previous timer is cleared first.  Accepts an
     * optional configuration object:
     *   - intervalMs: number of milliseconds between reports
     *   - testUrl: URL of a resource used for measuring bandwidth
     */
    start(opts = {}) {
      if (opts.intervalMs) {
        this.intervalMs = opts.intervalMs;
      }
      if (opts.testUrl) {
        this.testUrl = opts.testUrl;
      }
      this.stop();
      // Immediately measure once then schedule periodic tests
      this._measureAndReport();
      this.timer = setInterval(() => this._measureAndReport(), this.intervalMs);
    }

    /**
     * Stop measurement timer.
     */
    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    /**
     * Measure network speed by downloading `testUrl` and timing
     * the transfer.  Once complete, send the measured speed to
     * the server via `SaveNetworkSpeed`.  Errors are logged but
     * do not throw.
     */
    async _measureAndReport() {
      try {
        const start = performance.now();
        const resp = await fetch(this.testUrl, { cache: 'no-cache' });
        const blob = await resp.blob();
        const end = performance.now();
        const durationSec = (end - start) / 1000;
        const sizeBytes = blob.size || 0;
        const speedKbps = durationSec > 0 ? (sizeBytes * 8) / 1024 / durationSec : 0;
        // Build payload similar to Java: TokenId and NetworkSpeed
        const tokenId = prefs.getString('token_no', '') || prefs.getString('TokenId', '');
        const payload = {
          TokenId: tokenId,
          NetworkSpeed: speedKbps.toFixed(2)
        };
        const listener = {
          onResponse: function(text, tag) {
            console.log('[NetworkSpeedService]', 'Speed report sent', text);
          },
          onError: function(err, tag) {
            console.error('[NetworkSpeedService]', 'Error sending speed report', err);
          }
        };
        OkHttpUtil.callRequest(
          ENDPOINTS.UPDATE_NETWORK_PARAMS,
          JSON.stringify(payload),
          listener,
          TAGS.UPDATE_NETWORK_PARAM_TAG
        );
      } catch (err) {
        console.error('[NetworkSpeedService]', 'Failed to measure/report network speed', err);
      }
    }
  }
  window.NetworkSpeedService = new NetworkSpeedService();
})();