/**
 * RebootScheduler schedules a daily reboot of the webOS signage
 * application.  The reboot time is read from the preferences
 * (`prefs.getString('reboot_time')`) in 24‑hour HH:mm format.  If
 * not set, a default of 03:00 AM is used.  At the scheduled time
 * the scheduler attempts to reboot the device via `webosBridge`
 * (if available) or falls back to reloading the application.
 *
 * Usage:
 *   RebootScheduler.start();
 *   // Later, to stop: RebootScheduler.stop();
 */
(function() {
  class RebootScheduler {
    constructor() {
      this.timerId = null;
    }

    /**
     * Parse the reboot time string and return a Date for the
     * next occurrence.  If the time has already passed today it
     * schedules for tomorrow.
     * @param {string} timeStr Format HH:mm
     */
    _nextOccurrence(timeStr) {
      const now = new Date();
      const parts = timeStr.split(':');
      const hour = parseInt(parts[0], 10);
      const minute = parseInt(parts[1], 10);
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    /**
     * Start the reboot scheduler.  Reads the reboot time from
     * preferences and schedules the next reboot.  If already
     * scheduled the previous timer is cleared.
     */
    start() {
      this.stop();
      // default time at 3 AM
      const timePref = prefs.getString('reboot_time', '03:00');
      const next = this._nextOccurrence(timePref);
      const delay = next.getTime() - Date.now();
      console.log('[RebootScheduler]', 'Next reboot scheduled at', next.toString());
      this.timerId = setTimeout(() => {
        this._performReboot();
        // After performing reboot schedule the next one for tomorrow
        this.start();
      }, delay);
    }

    /**
     * Cancel any scheduled reboot.
     */
    stop() {
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
    }

    /**
     * Perform the actual reboot.  Tries to use the webOS
     * `webosBridge` API if available; otherwise falls back to
     * reloading the current page.
     */
    _performReboot() {
      try {
        console.log('[RebootScheduler]', 'Performing scheduled reboot');
        if (window.webosBridge && typeof webosBridge.reboot === 'function') {
          webosBridge.reboot();
        } else if (window.webosBridge && typeof webosBridge.relaunch === 'function') {
          webosBridge.relaunch();
        } else {
          // Fallback: reload page
          window.location.reload();
        }
      } catch (err) {
        console.error('[RebootScheduler]', 'Reboot failed', err);
        // As a last resort reload
        window.location.reload();
      }
    }
  }
  window.RebootScheduler = new RebootScheduler();
})();