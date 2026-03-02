/**
 * API Parity Check
 * ---------------
 * Lightweight runtime assertions to help catch missing endpoint wiring.
 * This does NOT change behaviour; it only logs warnings.
 */
(function () {
  function warn() {
    try { console.warn.apply(console, arguments); } catch (e) {}
  }

  function check() {
    if (!window.ENDPOINTS || !window.OkHttpUtil) {
      warn('[API_PARITY]', 'ENDPOINTS or OkHttpUtil missing');
      return;
    }

    const requiredEndpoints = [
      'CHECK_USER_LOGIN',
      'CHECK_USER_RIGHTS',
      'GET_SPL_PLAYLIST_SCHEDULE',
      'GET_SPL_PLAYLIST_CONTENT',
      'ADVERTISEMENTS',
      'PLAYER_STATUS_LOGIN',
      'PLAYER_STATUS_HEARTBEAT',
      'PLAYER_STATUS_LOGOUT'
    ];

    requiredEndpoints.forEach(function (k) {
      if (!ENDPOINTS[k]) warn('[API_PARITY]', 'Missing endpoint:', k);
    });

    const requiredFns = [
      'callRequest',
      'checkUserLogin',
      'checkUserRights',
      'getPlaylistsSchedule',
      'getPlaylistsContent',
      'getAdvertisements'
    ];

    requiredFns.forEach(function (fn) {
      if (typeof OkHttpUtil[fn] !== 'function') warn('[API_PARITY]', 'Missing OkHttpUtil function:', fn);
    });

    // Optional but useful modules
    if (!window.StatusReporter) warn('[API_PARITY]', 'StatusReporter missing (status reporting disabled)');
  }
  // Helper to safely query whether a download manager is running.
  // Some code historically exposes `isRunning` as a boolean property
  // instead of a function; callers should use this helper to avoid
  // TypeError when invoking non-functions.
  window.dmIsRunning = function (dm) {
    try {
      if (!dm) return false;
      if (typeof dm.isRunning === 'function') return !!dm.isRunning();
      return !!dm.isRunning;
    } catch (e) {
      return false;
    }
  };

  window.addEventListener('DOMContentLoaded', function () {
    // Run after scripts load
    setTimeout(check, 0);
  });
})();
