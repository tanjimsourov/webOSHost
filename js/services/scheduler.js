/**
 * Scheduler service replicating Java MyService/MyWorker/WorkManager behavior.
 * Periodically refreshes schedule/content and queues downloads.
 *
 * Java reference:
 *   - MyService.java (keep alive, periodic check every 150-200 seconds)
 *   - MyWorker.java (WorkManager periodic work every 16 minutes)
 *   - HomeActivity.startServiceViaWorker()
 *
 * Key behaviors:
 *   - S6-R1: No infinite restart loop; enforce max retries per hour
 *   - S6-R2: Use Java intervals/timeouts where possible
 */
(function () {
  var TAG = '[SCHEDULER]';

  // Intervals matching Java
  var REFRESH_INTERVAL_MS = 16 * 60 * 1000; // 16 minutes (Java WorkManager minimum)
  var QUICK_CHECK_INTERVAL_MS = 150000; // 150 seconds (Java MyService runnable)

  // Max retries per hour to prevent infinite loops (S6-R1)
  var MAX_RETRIES_PER_HOUR = 10;
  var retryCount = 0;
  var retryResetTime = Date.now() + 3600000; // Reset after 1 hour

  // Timer references
  var refreshTimer = null;
  var quickCheckTimer = null;
  var isRunning = false;

  // References to managers (set during start)
  var playlistManager = null;
  var adsManager = null;
  var downloadManager = null;

  /**
   * Check and reset retry counter if hour has passed.
   */
  function checkRetryLimit() {
    var now = Date.now();
    if (now > retryResetTime) {
      retryCount = 0;
      retryResetTime = now + 3600000;
      console.log(TAG, 'Retry counter reset');
    }
    if (retryCount >= MAX_RETRIES_PER_HOUR) {
      console.warn(TAG, 'Max retries reached for this hour, skipping');
      return false;
    }
    return true;
  }

  /**
   * Get current week number (Sunday=1, Saturday=7) matching Java.
   */
  function getWeekNumber() {
    var jsDay = new Date().getDay();
    return jsDay === 0 ? 1 : jsDay + 1;
  }

  function formatAdsDate() {
    var now = new Date();
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return String(now.getDate()) + '-' + months[now.getMonth()] + '-' + String(now.getFullYear());
  }

  /**
   * Refresh playlists and content from server.
   * Mirrors Java's periodic playlist refresh behavior.
   */
  async function refreshContent() {
    if (!checkRetryLimit()) {
      return;
    }

    console.log(TAG, 'Refreshing content from server');
    retryCount++;

    try {
      // Get identifiers from preferences
      var dfClientId = prefs.getString('dfclientid', '') || prefs.getString('DfClientId', '');
      var tokenId = prefs.getString('token_no', '') || prefs.getString('TokenId', '');
      var cityId = prefs.getString('cityid', '') || prefs.getString('Cityid', '');
      var countryId = prefs.getString('countryid', '') || prefs.getString('CountryId', '');
      var stateId = prefs.getString('stateid', '') || prefs.getString('StateId', '');
      var weekNo = String(getWeekNumber());

      if (!tokenId) {
        console.warn(TAG, 'No token ID, skipping refresh');
        return;
      }

      // Refresh playlists
      if (playlistManager) {
        console.log(TAG, 'Fetching playlists from server');
        await playlistManager.getPlaylistsFromServer({
          dfClientId: dfClientId,
          tokenId: tokenId,
          weekNo: weekNo
        });
        console.log(TAG, 'Playlists refreshed successfully');
      }

      // Refresh advertisements
      if (adsManager) {
        var currentDate = formatAdsDate();
        console.log(TAG, 'Fetching advertisements from server');
        await adsManager.fetchAdvertisements({
          Cityid: cityId,
          CountryId: countryId,
          CurrentDate: currentDate,
          DfClientId: dfClientId,
          StateId: stateId,
          TokenId: tokenId,
          WeekNo: weekNo
        });
        console.log(TAG, 'Advertisements refreshed successfully');
      }

      // Queue missing downloads
      await queueMissingDownloads();

      console.log(TAG, 'Content refresh complete');
    } catch (err) {
      console.error(TAG, 'Error refreshing content:', err);
    }
  }

  /**
   * Queue any songs or ads that are not yet downloaded.
   */
  async function queueMissingDownloads() {
    if (!downloadManager) {
      console.warn(TAG, 'No download manager available');
      return;
    }

    try {
      // Queue missing songs
      var songsDataSource = new SongsDataSource();
      var playlistDataSource = new PlaylistDataSource();
      var playlists = await playlistDataSource.getAllDistinctPlaylists();

      for (var i = 0; i < playlists.length; i++) {
        var pl = playlists[i];
        if (typeof songsDataSource.removeDuplicateSongsForPlaylist === 'function') {
          await songsDataSource.removeDuplicateSongsForPlaylist(pl.sp_playlist_id);
        }
        var missing = await songsDataSource.getSongsThoseAreNotDownloaded(pl.sp_playlist_id);
        if (missing && missing.length > 0) {
          console.log(TAG, 'Queuing', missing.length, 'missing songs for playlist', pl.sp_playlist_id);
          downloadManager.addSongsToQueue(missing);
        }
      }

      // Queue missing advertisements
      var missingAds = [];
      if (adsManager && typeof adsManager.getAdvertisementsToBeDownloaded === 'function') {
        missingAds = await adsManager.getAdvertisementsToBeDownloaded();
      } else {
        var advDataSource = new AdvertisementDataSource();
        missingAds = await advDataSource.getAdvThoseAreNotDownloaded();
      }
      if (missingAds.length > 0) {
        console.log(TAG, 'Queuing', missingAds.length, 'missing advertisements');
        downloadManager.addAdsToQueue(missingAds);
      }

      // Start downloads
      if (!window.dmIsRunning(downloadManager)) {
        downloadManager.start();
      }
    } catch (err) {
      console.error(TAG, 'Error queuing downloads:', err);
    }
  }

  /**
   * Quick check - lighter weight check that runs more frequently.
   * Mirrors Java MyService runnable (every 150 seconds).
   */
  async function quickCheck() {
    if (!navigator.onLine) {
      console.log(TAG, 'Offline, skipping quick check');
      return;
    }

    console.log(TAG, 'Running quick check');

    try {
      // Check if downloads are needed
      await queueMissingDownloads();

      // Flush any queued statuses
      if (window.StatusReporter) {
        await StatusReporter.flushQueue();
      }
    } catch (err) {
      console.error(TAG, 'Error in quick check:', err);
    }
  }

  /**
   * Start the scheduler service.
   * @param {Object} options - Configuration options
   * @param {PlaylistManager} options.playlistManager - Playlist manager instance
   * @param {AdsManager} options.adsManager - Ads manager instance
   * @param {DownloadManager} options.downloadManager - Download manager instance
   */
  function start(options) {
    if (isRunning) {
      console.log(TAG, 'Scheduler already running');
      return;
    }

    options = options || {};
    playlistManager = options.playlistManager || null;
    adsManager = options.adsManager || null;
    downloadManager = options.downloadManager || null;

    console.log(TAG, 'Starting scheduler service');
    console.log(TAG, 'Refresh interval:', REFRESH_INTERVAL_MS, 'ms');
    console.log(TAG, 'Quick check interval:', QUICK_CHECK_INTERVAL_MS, 'ms');

    isRunning = true;

    // Start refresh timer (16 minutes like Java WorkManager)
    refreshTimer = setInterval(function () {
      refreshContent();
    }, REFRESH_INTERVAL_MS);

    // Start quick check timer (150 seconds like Java MyService)
    quickCheckTimer = setInterval(function () {
      quickCheck();
    }, QUICK_CHECK_INTERVAL_MS);

    // Run initial refresh after a short delay
    setTimeout(function () {
      refreshContent();
    }, 5000);

    console.log(TAG, 'Scheduler service started');
  }

  /**
   * Stop the scheduler service.
   */
  function stop() {
    if (!isRunning) {
      console.log(TAG, 'Scheduler not running');
      return;
    }

    console.log(TAG, 'Stopping scheduler service');

    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }

    if (quickCheckTimer) {
      clearInterval(quickCheckTimer);
      quickCheckTimer = null;
    }

    isRunning = false;
    console.log(TAG, 'Scheduler service stopped');
  }

  /**
   * Check if scheduler is running.
   */
  function isSchedulerRunning() {
    return isRunning;
  }

  /**
   * Force an immediate refresh.
   */
  function forceRefresh() {
    console.log(TAG, 'Force refresh requested');
    refreshContent();
  }

  // Expose globally
  window.Scheduler = {
    start: start,
    stop: stop,
    isRunning: isSchedulerRunning,
    forceRefresh: forceRefresh,
    refreshContent: refreshContent,
    queueMissingDownloads: queueMissingDownloads
  };
})();
