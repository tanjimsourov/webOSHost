/**
 * Application entry point. This module performs any global setup
 * required before the router takes over. It may initialise device
 * identity, prefetch assets or seed default preferences. For now it
 * simply logs the detected device identity for debugging purposes.
 *
 * ============================================================
 * MANUAL TEST CHECKLIST (Section 13 - Android Parity)
 * ============================================================
 *
 * 1) NORMAL PLAYBACK TEST
 *    - Cold start the app
 *    - Login with valid credentials
 *    - Verify playback starts automatically with downloaded songs
 *    - Check console for [HOME], [Player], [SCHEDULER] logs
 *    Expected: Playback works, no errors in console
 *
 * 2) SIGNALR PLAYSONG COMMAND TEST
 *    - While playback is running, send PlaySong command from server
 *    - Command payload: { type: "PlaySong", songIndex: 2 } or { type: "Song", titleId: "xxx" }
 *    - Check console for [SIGNALR] Command: Play Song log
 *    Expected: Device switches to requested song immediately
 *
 * 3) PLAYLIST CLEANUP TEST
 *    - Trigger a playlist update (via SignalR Publish/UpdateNow or wait for scheduler)
 *    - Check console for [PlaylistManager] Scheduling cleanup and [Cleanup] logs
 *    - Verify orphan files are logged for deletion
 *    Expected: Cleanup runs after playlist update, deletes files not in playlist
 *
 * 4) NETWORK DISCONNECT/RECONNECT TEST
 *    - Disconnect network (disable WiFi/Ethernet)
 *    - Wait a few seconds, then reconnect
 *    - Check console for [LaunchReceiver] Network online log
 *    Expected: LaunchReceiver triggers SignalR reconnect + scheduler refresh
 *
 * 5) PLAYBACK STALL RECOVERY TEST
 *    - Simulate stall by pausing media element in DevTools (video.pause())
 *    - Wait for ApplicationChecker interval (60s) or call ApplicationChecker.performCheck()
 *    - Check console for [ApplicationChecker] Playback stall detected log
 *    Expected: ApplicationChecker calls recoverPlayback without crashing
 *
 * 6) SETTINGS PERSISTENCE TEST
 *    - Navigate to Settings screen
 *    - Enter City ID, Country ID, toggle advertisement settings
 *    - Click "Save Settings"
 *    - Restart app (or navigate away and back)
 *    - Verify values persist
 *    Expected: Settings saved and restored correctly after restart
 *
 * 7) LOGOUT TEST
 *    - Navigate to Settings screen
 *    - Click "Logout" button
 *    - Verify redirect to login screen
 *    - Check console for [SETTINGS] Logout requested log
 *    Expected: Login permit cleared, redirect to /login
 *
 * 8) APPLICATION CHECKER HEALTH TEST
 *    - In console, run: ApplicationChecker.getStatus()
 *    - Verify isRunning: true and reasonable timestamps
 *    Expected: Status shows active monitoring
 *
 * 9) PLAYER ROUTE TEST
 *    - Navigate to #/player route directly
 *    - Verify player UI mounts and playback continues
 *    Expected: Player controller mounts, playback not interrupted
 *
 * 10) RECEIVER TRIGGER TEST
 *     - In console, run: MyReceiver.trigger('SCHEDULE_DUE')
 *     - Check for [MyReceiver] Trigger received log
 *     Expected: Scheduler refresh triggered
 *
 * ============================================================
 */
(function () {
  if (window.deviceIdentity && typeof deviceIdentity.init === 'function') {
    deviceIdentity.init().catch(function (err) {
      console.warn('[APP] deviceIdentity.init failed', err);
    });
  }

  const identity = deviceIdentity.getDeviceIdentity();
  console.log('Device identity:', identity);
  // Example: set a default rotation preference if not already set
  if (!prefs.getString('rotation')) {
    prefs.setString('rotation', '0');
  }

  // Set default advertisement toggles if not set
  if (prefs.getString('isSongAdvEnabled') === '') {
    prefs.setBool('isSongAdvEnabled', true);
  }
  if (prefs.getString('isMinuteAdvEnabled') === '') {
    prefs.setBool('isMinuteAdvEnabled', true);
  }
  if (prefs.getString('isTimeAdvEnabled') === '') {
    prefs.setBool('isTimeAdvEnabled', true);
  }

  // Initialise crash logging service.  This hooks into the
  // global error and unhandled rejection events and will queue
  // logs when offline.  See services/crash_log.js for details.
  if (window.CrashLogService && typeof CrashLogService.init === 'function') {
    console.log('[APP]', 'Initialising CrashLogService');
    CrashLogService.init();
  }

  // Start network speed measurement and reporting.  This will
  // periodically measure the download bandwidth and notify the
  // backend via SaveNetworkSpeed.  See services/network_speed.js.
  if (window.NetworkSpeedService && typeof NetworkSpeedService.start === 'function') {
    console.log('[APP]', 'Starting NetworkSpeedService');
    NetworkSpeedService.start({ intervalMs: 15 * 60 * 1000 });
  }

  // Schedule daily reboot according to preferences.  This will
  // automatically reboot or relaunch the application at the
  // configured time (default 03:00).  See services/reboot_scheduler.js.
  if (window.RebootScheduler && typeof RebootScheduler.start === 'function') {
    console.log('[APP]', 'Starting RebootScheduler');
    RebootScheduler.start();
  }

  console.log('[APP] Bootstrap complete. Android-parity modules loaded.');
})();