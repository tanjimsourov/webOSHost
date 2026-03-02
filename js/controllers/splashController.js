/**
 * Splash controller.
 *
 * Startup state machine:
 * 1) Missing required setup -> /settings
 * 2) Setup done, not logged in -> /login
 * 3) Logged in -> online sync (best effort) then /home
 * 4) Offline -> /home if local cache exists, otherwise /login
 */
(function () {
  var TAG = '[SPLASH]';
  var log = (window.ControllerBase && window.ControllerBase.createLogger)
    ? window.ControllerBase.createLogger(TAG)
    : {
        info: console.log.bind(console, TAG),
        warn: console.warn.bind(console, TAG),
        error: console.error.bind(console, TAG)
      };

  var state = {
    timers: []
  };
  var version = '3.03';

  function setCurrentTask(message) {
    var taskEl = document.getElementById('txtCurrentProgress');
    if (taskEl) {
      taskEl.textContent = message || '';
    }
  }

  function showProgress(show) {
    var progressEl = document.getElementById('progress_view');
    if (!progressEl) return;
    progressEl.style.display = show ? 'block' : 'none';
  }

  function setTokenLabel() {
    var tokenEl = document.getElementById('txtTokenId');
    if (!tokenEl) return;
    var token = (window.prefs && (prefs.getTokenId && prefs.getTokenId())) || prefs.getString('token_no', '');
    tokenEl.textContent = token ? ('Token: ' + token) : '';
  }

  function setVersionLabel() {
    var verEl = document.getElementById('txtver');
    if (!verEl) return;
    verEl.textContent = 'Version: ' + version;
  }

  function stopDownloadManager() {
    try {
      if (window._sharedDownloadManager && typeof window._sharedDownloadManager.stop === 'function') {
        window._sharedDownloadManager.stop();
      }
    } catch (e) {
      log.warn('stopDownloadManager failed', e);
    }
  }

  function delayNavigate(route, delayMs) {
    var id = setTimeout(function () {
      router.navigate(route);
    }, delayMs || 0);
    state.timers.push(id);
  }

  function hasRequiredSetup() {
    if (!window.prefs) return false;
    if (typeof prefs.hasRequiredSetup === 'function') {
      return prefs.hasRequiredSetup();
    }
    return prefs.getBool('setup_complete', false);
  }

  function isLoggedIn() {
    if (!window.prefs) return false;
    if (typeof prefs.isLoggedIn === 'function') {
      return prefs.isLoggedIn();
    }
    return prefs.getString('login', '') === 'Permit';
  }

  async function hasAnyLocalPlayableContent() {
    try {
      var songsDS = new SongsDataSource();
      var downloadedCount = await songsDS.getCountForTotalSongsDownloaded();
      return Number(downloadedCount || 0) > 0;
    } catch (e) {
      log.warn('Local content check failed', e);
      return false;
    }
  }

  function collectDeviceIds() {
    var ids = [];

    try {
      if (window.deviceIdentity && typeof window.deviceIdentity.getDeviceIdentity === 'function') {
        var identity = window.deviceIdentity.getDeviceIdentity();
        if (identity) {
          if (identity.deviceId) ids.push(identity.deviceId);
          if (identity.serialNumber) ids.push(identity.serialNumber);
          if (identity.macAddress) ids.push(identity.macAddress);
          if (identity.macAddressAlt) ids.push(identity.macAddressAlt);
        }
      }
    } catch (e) {
      log.warn('collectDeviceIds from deviceIdentity failed', e);
    }

    var prefDevice = prefs.getDeviceId ? prefs.getDeviceId() : prefs.getString('device_id', '');
    if (prefDevice) ids.push(prefDevice);

    var seen = {};
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var v = String(ids[i] || '').trim();
      if (!v) continue;
      if (seen[v]) continue;
      seen[v] = true;
      out.push(v);
    }

    if (out.length === 0 && window.deviceIdentity && typeof deviceIdentity.getStableDeviceId === 'function') {
      out.push(deviceIdentity.getStableDeviceId());
    }

    return out;
  }

  function persistRightsData(obj, fallbackDeviceId) {
    if (!obj || typeof obj !== 'object') return;

    var cityId = obj.Cityid || obj.cityid || '';
    var countryId = obj.CountryId || obj.countryid || '';
    var stateId = obj.StateId || obj.stateid || '';
    var dfClientId = obj.DfClientId || obj.dfClientId || obj.dfclientid || '';
    var tokenId = obj.TokenId || obj.tokenId || '';
    var rotation = obj.Rotation || obj.rotation || '';
    var reboot = obj.RebootTime || obj.reboot || '';

    if (cityId && prefs.setCityId) prefs.setCityId(cityId);
    if (countryId && prefs.setCountryId) prefs.setCountryId(countryId);
    if (stateId && prefs.setStateId) prefs.setStateId(stateId);
    if (dfClientId && prefs.setDfClientId) prefs.setDfClientId(dfClientId);
    if (tokenId) {
      if (prefs.setTokenId) prefs.setTokenId(tokenId);
      else prefs.setString('token_no', tokenId);
    }
    if (rotation) prefs.setRotation ? prefs.setRotation(rotation) : prefs.setString('rotation', rotation);
    if (reboot) prefs.setString('reboot', reboot);

    var deviceId = fallbackDeviceId || '';
    if (!deviceId && window.deviceIdentity && typeof deviceIdentity.getStableDeviceId === 'function') {
      deviceId = deviceIdentity.getStableDeviceId();
    }
    if (deviceId) {
      if (prefs.setDeviceId) prefs.setDeviceId(deviceId);
      else prefs.setString('device_id', deviceId);
    }
  }

  function parseRightsResponse(responseText) {
    if (!responseText) return null;

    if (typeof responseText === 'string' && responseText.trim().charAt(0) === '<') {
      return null;
    }

    try {
      var parsed = JSON.parse(responseText);
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed[0] : null;
      }
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function checkDeviceRights() {
    return new Promise(function (resolve) {
      try {
        if (!window.OkHttpUtil || typeof OkHttpUtil.checkUserRights !== 'function') {
          resolve(null);
          return;
        }

        var deviceIds = collectDeviceIds();
        if (!deviceIds || deviceIds.length === 0) {
          resolve(null);
          return;
        }

        OkHttpUtil.checkUserRights(deviceIds, {
          onResponse: function (text) {
            resolve(parseRightsResponse(text));
          },
          onError: function () {
            resolve(null);
          }
        });
      } catch (e) {
        log.warn('checkDeviceRights failed', e);
        resolve(null);
      }
    });
  }

  async function queuePendingDownloads(playlistManager, adsManager, downloadManager) {
    var songsQueued = 0;
    var adsQueued = 0;

    var playlists = await playlistManager.getAllDistinctPlaylists();
    var songsDS = new SongsDataSource();
    var pendingSongs = [];

    for (var i = 0; i < playlists.length; i++) {
      var playlistId = playlists[i] && playlists[i].sp_playlist_id;
      if (!playlistId) continue;
      if (typeof songsDS.removeDuplicateSongsForPlaylist === 'function') {
        await songsDS.removeDuplicateSongsForPlaylist(playlistId);
      }
      var notDownloaded = await songsDS.getSongsThoseAreNotDownloaded(playlistId);
      if (Array.isArray(notDownloaded) && notDownloaded.length > 0) {
        pendingSongs = pendingSongs.concat(notDownloaded);
      }
    }

    if (pendingSongs.length > 0) {
      downloadManager.addSongsToQueue(pendingSongs);
      songsQueued = pendingSongs.length;
    }

    if (adsManager && typeof adsManager.getAdvertisementsToBeDownloaded === 'function') {
      var pendingAds = await adsManager.getAdvertisementsToBeDownloaded();
      if (Array.isArray(pendingAds) && pendingAds.length > 0) {
        downloadManager.addAdsToQueue(pendingAds);
        adsQueued = pendingAds.length;
      }
    }

    if ((songsQueued > 0 || adsQueued > 0) && !window.dmIsRunning(downloadManager)) {
      await downloadManager.start();
    }

    return { songsQueued: songsQueued, adsQueued: adsQueued };
  }

  async function syncAndContinueHome() {
    var dfClientId = prefs.getDfClientId ? prefs.getDfClientId() : prefs.getString('dfclientid', '');
    var tokenId = prefs.getTokenId ? prefs.getTokenId() : prefs.getString('token_no', '');

    // Missing rights payload is tolerated - continue with local cache.
    if (!dfClientId || !tokenId) {
      setCurrentTask('Using local content');
      delayNavigate('/home', 300);
      return;
    }

    var jsDay = new Date().getDay();
    var weekNo = String(jsDay === 0 ? 1 : jsDay + 1);
    var playlistManager = new PlaylistManager({
      startedGettingPlaylist: function () {
        setCurrentTask('Syncing playlists...');
      },
      finishedGettingPlaylist: function () {
        setCurrentTask('Playlist sync complete');
      },
      errorInGettingPlaylist: function () {
        setCurrentTask('Playlist sync failed, using local cache');
      }
    });

    var adsManager = new AdsManager();
    var downloadManager = new DownloadManager();
    window._sharedDownloadManager = downloadManager;

    try {
      await playlistManager.getPlaylistsFromServer({
        dfClientId: dfClientId,
        tokenId: tokenId,
        weekNo: weekNo
      });

      var cityId = prefs.getCityId ? prefs.getCityId() : prefs.getString('cityid', '');
      var countryId = prefs.getCountryId ? prefs.getCountryId() : prefs.getString('countryid', '');
      var stateId = prefs.getStateId ? prefs.getStateId() : prefs.getString('stateid', '');
      var now = new Date();
      var month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()];

      await adsManager.fetchAdvertisements({
        Cityid: cityId,
        CountryId: countryId,
        CurrentDate: String(now.getDate()) + '-' + month + '-' + String(now.getFullYear()),
        DfClientId: dfClientId,
        StateId: stateId,
        TokenId: tokenId,
        WeekNo: weekNo
      });

      setCurrentTask('Queueing downloads...');
      await queuePendingDownloads(playlistManager, adsManager, downloadManager);
    } catch (e) {
      log.warn('syncAndContinueHome failed, proceeding with local content', e);
    }

    delayNavigate('/home', 350);
  }

  async function mount(context) {
    log.info('mount', context && context.route ? ('route=' + context.route) : '');

    stopDownloadManager();
    setVersionLabel();
    setTokenLabel();
    showProgress(true);
    setCurrentTask('Starting...');

    if (window.deviceIdentity && typeof deviceIdentity.init === 'function') {
      try {
        await deviceIdentity.init();
      } catch (e) {
        log.warn('deviceIdentity.init failed', e);
      }
    }

    if (!hasRequiredSetup()) {
      showProgress(false);
      setCurrentTask('');
      delayNavigate('/settings', 120);
      return;
    }

    if (!isLoggedIn()) {
      showProgress(false);
      setCurrentTask('');
      delayNavigate('/settings', 120);
      return;
    }

    if (!navigator.onLine) {
      var hasLocal = await hasAnyLocalPlayableContent();
      showProgress(false);
      setCurrentTask('');
      if (hasLocal) {
        delayNavigate('/home', 200);
      } else {
        delayNavigate('/login', 200);
      }
      return;
    }

    setCurrentTask('Verifying device rights...');
    var rights = await checkDeviceRights();
    var stableDeviceId = '';
    if (window.deviceIdentity && typeof deviceIdentity.getStableDeviceId === 'function') {
      stableDeviceId = deviceIdentity.getStableDeviceId();
    }
    persistRightsData(rights || {}, stableDeviceId);

    await syncAndContinueHome();
  }

  function unmount(context) {
    log.info('unmount', context && context.route ? ('route=' + context.route) : '');
    for (var i = 0; i < state.timers.length; i++) {
      clearTimeout(state.timers[i]);
    }
    state.timers = [];
  }

  window.splashController = {
    mount: mount,
    unmount: unmount
  };
})();

