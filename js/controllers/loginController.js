/**
 * Login controller implementing the Java???style login and rights flow on webOS.
 *
 * Responsibilities:
 *   - Bind click handlers to the Submit and Cancel buttons.
 *   - Validate required fields (user name and token number) and display
 *     appropriate messages when invalid.
 *   - Defer login attempts when offline and show a banner indicating
 *     connectivity status. Submit is disabled until the device is back
 *     online.
 *   - Authenticate the user via the AppLogin endpoint and subsequently
 *     validate device rights via CheckUserRightsLive_bulk. On success
 *     preferences are persisted using the same keys as the Android
 *     implementation and the user is navigated to the home screen.
 *   - On failure the user remains on the login screen and an alert
 *     describing the error is shown.
 *
 * This controller exposes itself on `window.loginController` to comply
 * with the existing controller registry. All asynchronous steps are
 * logged with the tag defined below. Networking is performed via the
 * OkHttpUtil helper and preferences are stored via the global prefs
 * utility.
 */
(function () {
  var TAG = '[LOGIN]';
  // Ensure dmIsRunning exists early in case other scripts haven't defined it yet
  if (typeof window.dmIsRunning !== 'function') {
    window.dmIsRunning = function (dm) {
      try {
        if (!dm) return false;
        if (typeof dm.isRunning === 'function') return !!dm.isRunning();
        return !!dm.isRunning;
      } catch (e) {
        return false;
      }
    };
  }
  var log = (window.ControllerBase && window.ControllerBase.createLogger)
    ? window.ControllerBase.createLogger(TAG)
    : {
        info: console.log.bind(console, TAG),
        warn: console.warn.bind(console, TAG),
        error: console.error.bind(console, TAG),
      };

  // Internal state used to detach listeners on unmount
  var state = { isSubmitting: false, latestSubmitNonce: 0 };
  var progressDialog = null;

  /**
   * Compute the server week number used by Android (Sunday=1 ... Saturday=7).
   */
  function getWeekNumber() {
    var jsDay = new Date().getDay(); // 0=Sunday
    return jsDay === 0 ? 1 : jsDay + 1;
  }

  function formatCurrentDateForAds() {
    var now = new Date();
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return String(now.getDate()) + '-' + months[now.getMonth()] + '-' + String(now.getFullYear());
  }

  /**
   * Build a stable list of non-empty device identifiers.
   */
  function collectDeviceIds(ids) {
    var values = [];
    if (ids && typeof ids === 'object') {
      values.push(ids.deviceId);
      values.push(ids.macAddress);
      values.push(ids.macAddressAlt);
      values.push(ids.serialNumber);
    }
    values.push((prefs.getDeviceId && prefs.getDeviceId()) || prefs.getString('device_id', ''));

    var seen = {};
    var out = [];
    for (var i = 0; i < values.length; i++) {
      var raw = values[i];
      if (raw == null) continue;
      var id = String(raw).trim();
      var lower = id.toLowerCase();
      if (!id) continue;
      if (lower === 'unknown' || lower === 'webos-device' || lower === 'sn-webos') continue;
      if (lower === '00:00:00:00:00:00' || lower === '00-00-00-00-00-00') continue;
      if (seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  /**
   * Persist rights payload fields.
   * Matches Flutter flow where rights data is saved regardless of Response value.
   */
  function persistRightsData(rightsObj, fallbackDeviceId) {
    if (!rightsObj || typeof rightsObj !== 'object') return;

    var cityId = rightsObj.Cityid || rightsObj.cityid || '';
    var countryId = rightsObj.CountryId || rightsObj.countryid || '';
    var stateId = rightsObj.StateId || rightsObj.stateid || '';
    var dfClientId = rightsObj.DfClientId || rightsObj.dfclientid || rightsObj.dfClientId || '';
    var tokenId = rightsObj.TokenId || rightsObj.tokenId || '';
    var isStopControl = rightsObj.IsStopControl || rightsObj.isStopControl || '';
    var indicatorType = rightsObj.IsIndicatorActive || rightsObj.indicatorActive || '';
    var schType = rightsObj.scheduleType || rightsObj.schtype || '';
    var imgType = rightsObj.LogoId || rightsObj.imgtype || '';
    var rotation = rightsObj.Rotation || rightsObj.rotation || '';
    var reboot = rightsObj.RebootTime || rightsObj.reboot || '';

    if (cityId !== '' && prefs.setCityId) prefs.setCityId(cityId);
    if (countryId !== '' && prefs.setCountryId) prefs.setCountryId(countryId);
    if (stateId !== '' && prefs.setStateId) prefs.setStateId(stateId);
    if (dfClientId !== '' && prefs.setDfClientId) prefs.setDfClientId(dfClientId);
    if (tokenId !== '') {
      if (prefs.setTokenId) {
        prefs.setTokenId(tokenId);
      } else {
        prefs.setString('token_no', tokenId);
      }
    }
    if (isStopControl !== '') prefs.setString('IsStopcontrol', isStopControl);
    if (indicatorType !== '') prefs.setString('indicator', indicatorType);
    if (schType !== '') prefs.setString('schtype', schType);
    if (imgType !== '') prefs.setString('imgtype', imgType);
    if (rotation !== '') prefs.setString('rotation', rotation);
    if (reboot !== '') prefs.setString('reboot', reboot);

    var deviceIdToSave = fallbackDeviceId || '';
    if (deviceIdToSave !== '') {
      if (prefs.setDeviceId) {
        prefs.setDeviceId(deviceIdToSave);
      } else {
        prefs.setString('device_id', deviceIdToSave);
      }
    }
  }

  async function queueAllPendingMediaDownloads(playlistManager, adsManager, downloadManager) {
    if (!playlistManager || !downloadManager) {
      return { songs: 0, ads: 0 };
    }

    var songsQueued = 0;
    var adsQueued = 0;
    var songsDataSource = new SongsDataSource();
    var playlists = await playlistManager.getAllDistinctPlaylists();
    var songsToQueue = [];

    for (var i = 0; i < playlists.length; i++) {
      var playlistId = playlists[i] && playlists[i].sp_playlist_id;
      if (!playlistId) continue;
      var pendingSongs = await songsDataSource.getSongsThoseAreNotDownloaded(playlistId);
      if (Array.isArray(pendingSongs) && pendingSongs.length > 0) {
        songsToQueue = songsToQueue.concat(pendingSongs);
      }
    }

    if (songsToQueue.length > 0 && downloadManager && typeof downloadManager.addSongsToQueue === 'function') {
      downloadManager.addSongsToQueue(songsToQueue);
      songsQueued = songsToQueue.length;
    }

    if (adsManager && typeof adsManager.getAdvertisementsToBeDownloaded === 'function') {
      var pendingAds = await adsManager.getAdvertisementsToBeDownloaded();
      if (Array.isArray(pendingAds) && pendingAds.length > 0 && downloadManager && typeof downloadManager.addAdsToQueue === 'function') {
        downloadManager.addAdsToQueue(pendingAds);
        adsQueued = pendingAds.length;
      }
    }

    if ((songsQueued > 0 || adsQueued > 0) && downloadManager && typeof downloadManager.start === 'function') {
      try {
        console.log(TAG, 'queueAllPendingMediaDownloads: downloadManager type=', typeof downloadManager, 'isRunning type=', typeof (downloadManager && downloadManager.isRunning));
      } catch (e) {
        // ignore
      }
      var running = window.dmIsRunning(downloadManager);
      if (!running) {
        downloadManager.start();
      }
    }

    return { songs: songsQueued, ads: adsQueued };
  }

  /**
   * Start playlist sync exactly like Android LoginActivity:
   * rights OK -> PlaylistManager.getPlaylistsFromServer -> on finished -> go Home.
   */
  function startPlaylistSyncAndProceedHome() {
    if (!window.PlaylistManager) {
      log.warn('PlaylistManager missing; proceeding to home without sync');
      hideProgressDialog();
      router.navigate('/home');
      return;
    }

    var dfClientId = (prefs.getDfClientId && prefs.getDfClientId()) || prefs.getString('dfclientid', '');
    var tokenId = (prefs.getTokenId && prefs.getTokenId()) || prefs.getString('token_no', '');
    var cityId = (prefs.getCityId && prefs.getCityId()) || prefs.getString('cityid', '');
    var countryId = (prefs.getCountryId && prefs.getCountryId()) || prefs.getString('countryid', '');
    var stateId = (prefs.getStateId && prefs.getStateId()) || prefs.getString('stateid', '');
    var weekNo = String(getWeekNumber());

    // Flutter parity: do not block successful login when rights payload is incomplete.
    if (!tokenId || !dfClientId) {
      log.warn('Skipping startup sync because TokenId or DfClientId is missing');
      setLoginStatus('Sign-in successful. Waiting for device rights; continuing with local content.', 'info');
      hideProgressDialog();
      router.navigate('/home');
      return;
    }

    var playlistManager = new window.PlaylistManager({
      startedGettingPlaylist: function () {
        showProgressDialog('Syncing playlists...', false);
      },
      finishedGettingPlaylist: function () {
        log.info('Playlist sync completed');
      },
      errorInGettingPlaylist: function () {
        log.warn('Playlist sync completed with errors');
      }
    });
    var adsManager = window.AdsManager ? new window.AdsManager() : null;
    var downloadManager = window.DownloadManager ? new window.DownloadManager() : null;

    playlistManager
      .getPlaylistsFromServer({ dfClientId: dfClientId, tokenId: tokenId, weekNo: weekNo })
      .then(function () {
        if (!adsManager || typeof adsManager.fetchAdvertisements !== 'function') {
          return null;
        }
        showProgressDialog('Syncing advertisements...', false);
        return adsManager.fetchAdvertisements({
          Cityid: cityId,
          CountryId: countryId,
          CurrentDate: formatCurrentDateForAds(),
          DfClientId: dfClientId,
          StateId: stateId,
          TokenId: tokenId,
          WeekNo: weekNo
        });
      })
      .then(function () {
        showProgressDialog('Preparing downloads...', false);
        return queueAllPendingMediaDownloads(playlistManager, adsManager, downloadManager);
      })
      .then(function (counts) {
        var songCount = counts && counts.songs ? counts.songs : 0;
        var adCount = counts && counts.ads ? counts.ads : 0;
        setLoginStatus(
          'Sign-in successful. Download queue started (' + songCount + ' songs, ' + adCount + ' ads).',
          'info'
        );
        hideProgressDialog();
        router.navigate('/home');
      })
      .catch(function (err) {
        log.error('Error during initial sync/download workflow', err);
        setLoginStatus('Sign-in successful. Sync had issues, continuing with available content.', 'info');
        hideProgressDialog();
        router.navigate('/home');
      });
  }
  
  /**
   * Show progress dialog matching Java ProgressDialog
   * @param {string} message Progress message
   * @param {boolean} cancelable Whether dialog is cancelable
   */
  function showProgressDialog(message, cancelable) {
    try {
      if (progressDialog) {
        // Update existing dialog
        DialogManager.updateProgress(progressDialog, { message: message });
      } else {
        // Create new dialog
        progressDialog = DialogManager.showProgress({
          title: 'Loading',
          message: message || 'Please wait...',
          cancelable: cancelable || false,
          indeterminate: true
        });
      }
    } catch (err) {
      log.error('Failed to show progress dialog:', err);
    }
  }
  
  /**
   * Hide progress dialog
   */
  function hideProgressDialog() {
    try {
      if (progressDialog) {
        DialogManager.dismissAll();
        progressDialog = null;
      }
    } catch (err) {
      log.error('Failed to hide progress dialog:', err);
    }
  }

  /**
   * Show alert dialog - replacement for window.alert
   * @param {string} title Alert title
   * @param {string} message Alert message
   */
  function showAlert(title, message) {
    setLoginStatus(message, 'error');
    try {
      if (window.AlertDialog) {
        new AlertDialog.Builder()
          .setTitle(title)
          .setMessage(message)
          .setPositiveButton('OK', null)
          .setCancelable(true)
          .show();
      } else {
        // Fallback to native alert
        window.alert(title + '\n' + message);
      }
    } catch (err) {
      log.error('Failed to show alert:', err);
      window.alert(title + '\n' + message);
    }
  }

  function setLoginStatus(message, type) {
    var statusEl = document.getElementById('loginStatusMessage');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.setAttribute('data-state', type || 'info');
    statusEl.style.display = message ? 'block' : 'none';
  }

  /**
   * Java parity: LoginActivity deletes old local media/database folder on start.
   * On webOS we safely clear download cache + download queue when token changes.
   * This avoids stale content across accounts without blocking the UI.
   */
  function resetLocalStateIfTokenChanged(nextToken) {
    try {
      var prev = prefs.getString('token_no', '') || '';
      if (prev && nextToken && prev !== nextToken) {
        console.log(TAG, 'Token changed. Clearing local cache and metadata for parity.');
        // Clear download manager persisted state
        prefs.setString('download_manager_state', '');
        prefs.setString('download_overlay_seen', '0');

        // Clear cache storage (best-effort)
        if (window.caches && typeof caches.keys === 'function') {
          caches.keys().then(function (keys) {
            return Promise.all(
              keys
                .filter(function (k) { return String(k).toLowerCase().indexOf('download') >= 0; })
                .map(function (k) { return caches.delete(k); })
            );
          }).catch(function () {});
        }

        // Clear stale playlist/song/advertisement metadata for account switch.
        if (window.DB && typeof DB.withTransaction === 'function') {
          DB.withTransaction(['playlist', 'songs', 'advertisement'], 'readwrite', function (stores) {
            stores.playlist.clear();
            stores.songs.clear();
            stores.advertisement.clear();
          }).catch(function () {});
        }
      }
    } catch (e) {
      // best effort
    }
  }

  /**
   * Update connectivity state. Shows or hides an offline banner and
   * disables/enables the submit button accordingly. The banner is
   * created on demand the first time this function runs.
   */
  function updateConnectivity() {
    var online = navigator.onLine;
    var banner = document.getElementById('offlineBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offlineBanner';
      banner.textContent = 'Network offline. Connect internet to continue.';
      banner.className = 'offline-banner';
      document.body.appendChild(banner);
    }
    banner.style.display = online ? 'none' : 'block';
    var submitBtn = document.getElementById('btn_Submit');
    if (submitBtn) {
      submitBtn.disabled = !online;
    }
    if (!online) {
      setLoginStatus('Network offline. Connect internet to sign in.', 'error');
      return;
    }
    var statusEl = document.getElementById('loginStatusMessage');
    if (statusEl && /network offline/i.test(statusEl.textContent || '')) {
      setLoginStatus('', 'info');
    }
  }

  /**
   * Attach event listeners and initialise the login view. This function
   * is invoked by the router when navigating to the `/login` route.
   *
   * @param {Object} context Route context provided by the router (unused)
   */
  function mount(context) {
    log.info('mount', context && context.route ? 'route=' + context.route : '');
    // Capture references to important DOM elements. If any element is
    // missing from the template a log entry is produced but execution
    // continues gracefully.
    var usernameEl = document.getElementById('edit_username');
    var tokenEl = document.getElementById('edit_tokenNo');
    var dealerEl = document.getElementById('edit_dealerCode');
    var submitBtn = document.getElementById('btn_Submit');
    var cancelBtn = document.getElementById('btn_Cancel');
    if (!usernameEl || !tokenEl || !submitBtn || !cancelBtn) {
      log.error('One or more required elements are missing in activity_login.html');
    }
    // Initialise connectivity banner and state
    updateConnectivity();
    setLoginStatus('', 'info');
    if (usernameEl && typeof usernameEl.focus === 'function') {
      setTimeout(function () {
        try { usernameEl.focus(); } catch (e) {}
      }, 40);
    }
    // Define handlers
    function handleLogin() {
      if (state.isSubmitting) {
        log.warn('Ignoring duplicate login submit while request is in flight');
        return;
      }
      // Do not attempt login when offline
      if (!navigator.onLine) {
        showAlert('Network error', 'Please connect to the internet and try again.');
        return;
      }
      var userName = usernameEl ? usernameEl.value.trim() : '';
      var token = tokenEl ? tokenEl.value.trim() : '';

      // Security validation (token format) - based on Java LoginActivity patterns
      if (window.SecurityManager && typeof SecurityManager.validateToken === 'function') {
        if (!SecurityManager.validateToken(token)) {
          log.warn('Token failed validation');
          if (tokenEl) tokenEl.focus();
          showAlert('Invalid', 'Please enter a valid token number.');
          return;
        }
      }
      // Validate required fields
      if (!userName) {
        log.warn('Username missing');
        if (usernameEl) usernameEl.focus();
        showAlert('Invalid', 'Please enter the user name.');
        return;
      }
      if (!token) {
        log.warn('Token number missing');
        if (tokenEl) tokenEl.focus();
        showAlert('Invalid', 'Please enter the token number.');
        return;
      }

      // Clear stale local cache if this login uses a different token
      resetLocalStateIfTokenChanged(token);

      // Disable submit to prevent multiple submissions
      if (submitBtn) submitBtn.disabled = true;
      state.isSubmitting = true;
      state.latestSubmitNonce = Date.now();
      log.info('Attempting login for', userName);
      setLoginStatus('Signing in...', 'info');
      
      // Show progress dialog
      showProgressDialog('Verifying credentials...', false);
      
      // Retrieve device identifiers via deviceIdentity helper if available
      var ids =
        window.deviceIdentity && typeof window.deviceIdentity.getDeviceIdentity === 'function'
          ? window.deviceIdentity.getDeviceIdentity()
          : {
              deviceId:
                (window.deviceIdentity && typeof window.deviceIdentity.getStableDeviceId === 'function'
                  ? window.deviceIdentity.getStableDeviceId()
                  : '') ||
                (prefs.getDeviceId && prefs.getDeviceId()) ||
                prefs.getString('device_id', ''),
              macAddress: '',
              macAddressAlt: '',
              serialNumber:
                (window.deviceIdentity && typeof window.deviceIdentity.getStableDeviceId === 'function'
                  ? window.deviceIdentity.getStableDeviceId()
                  : '') ||
                (prefs.getDeviceId && prefs.getDeviceId()) ||
                prefs.getString('device_id', ''),
            };
      var deviceIds = collectDeviceIds(ids);
      // Build login listener
      var loginListener = {
        onResponse: function (responseText, tag) {
          // Re-enable submit; do NOT hide progress here because Android keeps
          // the "Syncing content" dialog visible until playlists finish.
          if (submitBtn) submitBtn.disabled = false;
          state.isSubmitting = false;
          try {
            var parsed = JSON.parse(responseText);
            var respObj = Array.isArray(parsed) ? parsed[0] : parsed;
            var respVal = respObj && (respObj.Response || respObj.response);
            if (String(respVal) === '1') {
              // Persist login details exactly as Java does
              if (prefs.setTokenId) {
                prefs.setTokenId(token);
              } else {
                prefs.setString('token_no', token);
              }
              prefs.setString('login', 'Permit');
              prefs.setString('user_name', userName);
              if (prefs.setSetupComplete) {
                prefs.setSetupComplete(true);
              } else {
                prefs.setBool('setup_complete', true);
              }
              // Define rights listener
              var rightsListener = {
                onResponse: function (rightsText, tag2) {
                  try {
                    var parsed2 = JSON.parse(rightsText);
                    var rightsObj = Array.isArray(parsed2) ? parsed2[0] : parsed2;
                    var rightsVal = rightsObj && (rightsObj.Response || rightsObj.response);
                    var leftDays = parseInt((rightsObj && (rightsObj.LeftDays || rightsObj.leftDays || '0')) || '0', 10) || 0;

                    persistRightsData(rightsObj, ids && ids.deviceId ? ids.deviceId : '');
                    setLoginStatus('Sign-in successful. Syncing content...', 'info');

                    if (String(rightsVal) === '1') {
                      // Show subscription renewal dialog if needed
                      if (leftDays >= 2 && leftDays <= 7) {
                        // 2-7 days left warning
                        if (window.DialogManager) {
                          DialogManager.showSubscriptionDialog(leftDays, function() {
                            // Continue with playlist fetching after dialog
                            startPlaylistSyncAndProceedHome();
                          });
                        } else {
                          // Fallback - continue without dialog
                          startPlaylistSyncAndProceedHome();
                        }
                      } else if (leftDays === 1) {
                        // 1 day left warning
                        if (window.DialogManager) {
                          DialogManager.showSubscriptionDialog(leftDays, function() {
                            // Continue with playlist fetching after dialog
                            startPlaylistSyncAndProceedHome();
                          });
                        } else {
                          // Fallback - continue without dialog
                          startPlaylistSyncAndProceedHome();
                        }
                      } else if (leftDays < 0) {
                        // Expired subscription
                        hideProgressDialog();
                        if (window.DialogManager) {
                          DialogManager.showSubscriptionDialog(leftDays, function() {
                            // Navigate to login after expired dialog
                            router.navigate('/login');
                          });
                        } else {
                          // Fallback - navigate to login
                          router.navigate('/login');
                        }
                      } else {
                        // Normal case - fetch playlists
                        startPlaylistSyncAndProceedHome();
                      }
                    } else {
                      // Flutter parity: AppLogin success remains the hard gate.
                      log.warn('Device rights returned non-success response. Continuing with best-effort startup.', rightsVal);
                      startPlaylistSyncAndProceedHome();
                    }
                  } catch (err) {
                    log.error('Error parsing rights response', err);
                    // Non-fatal once login succeeded.
                    startPlaylistSyncAndProceedHome();
                  }
                },
                onError: function (err2, tag2) {
                  log.error('Rights request failed', err2);
                  // Non-fatal in Flutter flow.
                  startPlaylistSyncAndProceedHome();
                },
              };
              // Perform rights call
              if (deviceIds.length === 0) {
                log.warn('No usable device IDs available for rights check; continuing');
                startPlaylistSyncAndProceedHome();
              } else {
                OkHttpUtil.checkUserRights(deviceIds, rightsListener);
              }
            } else {
              // Login invalid
              log.warn('Invalid login credentials');
              hideProgressDialog();
              prefs.setString('login', '');
              showAlert('Invalid', 'Please enter valid credentials.');
            }
          } catch (parseErr) {
            log.error('Login response parse error', parseErr);
            hideProgressDialog();
            prefs.setString('login', '');
            showAlert('Error', 'Invalid server response.');
          }
        },
        onError: function (err, tag) {
          if (submitBtn) submitBtn.disabled = false;
          hideProgressDialog();
          state.isSubmitting = false;
          prefs.setString('login', '');
          log.error('Login request error', err);
          if (window.ErrorHandler && typeof ErrorHandler.handle === 'function') {
            ErrorHandler.handle(err, 'login:checkUserLogin', function () {
              OkHttpUtil.checkUserLogin(
                {
                  deviceId: ids.deviceId,
                  tokenNo: token,
                  userName: userName,
                  dbType: 'Nusign',
                  playerType: 'LGWebOS',
                },
                loginListener
              );
            });
          } else {
            state.isSubmitting = false;
            showAlert('Network error', 'Unable to connect. Please try again.');
          }
        },
      };
      // Kick off login request
      OkHttpUtil.checkUserLogin(
        {
          deviceId: ids.deviceId,
          tokenNo: token,
          userName: userName,
          dbType: 'Nusign',
          playerType: 'LGWebOS',
        },
        loginListener,
      );
    }
    function handleCancel() {
      // Clear fields and navigate back to splash screen
      if (usernameEl) usernameEl.value = '';
      if (tokenEl) tokenEl.value = '';
      if (dealerEl) dealerEl.value = '';
      setLoginStatus('', 'info');
      router.back();
    }

    function insertTextAtCursor(inputEl, text) {
      if (!inputEl || typeof inputEl.value !== 'string') return;
      var start = typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : inputEl.value.length;
      var end = typeof inputEl.selectionEnd === 'number' ? inputEl.selectionEnd : inputEl.value.length;
      var clean = String(text || '').replace(/\r?\n/g, ' ').trim();
      if (!clean) return;
      inputEl.value = inputEl.value.slice(0, start) + clean + inputEl.value.slice(end);
      var caret = start + clean.length;
      if (typeof inputEl.setSelectionRange === 'function') {
        inputEl.setSelectionRange(caret, caret);
      }
    }

    function parseCredentialsFromClipboard(text) {
      var raw = String(text || '').replace(/\r/g, '').trim();
      if (!raw) return null;

      var lines = raw.split('\n').map(function (v) { return v.trim(); }).filter(function (v) { return !!v; });
      if (lines.length >= 2) {
        return { userName: lines[0], tokenNo: lines[1] };
      }

      var parts = raw.split(/[\t,;|]/).map(function (v) { return v.trim(); }).filter(function (v) { return !!v; });
      if (parts.length >= 2) {
        return { userName: parts[0], tokenNo: parts[1] };
      }

      return null;
    }

    function applyClipboardPayload(targetInput, clipboardText) {
      var raw = String(clipboardText || '');
      if (!raw.trim()) return;

      var parsed = parseCredentialsFromClipboard(raw);
      if (parsed && usernameEl && tokenEl) {
        usernameEl.value = parsed.userName;
        tokenEl.value = parsed.tokenNo;
        if (targetInput === tokenEl) {
          try { tokenEl.focus(); } catch (e) {}
        } else {
          try { usernameEl.focus(); } catch (e) {}
        }
        return;
      }

      insertTextAtCursor(targetInput, raw);
    }

    function getClipboardText(evt) {
      if (evt && evt.clipboardData && typeof evt.clipboardData.getData === 'function') {
        return evt.clipboardData.getData('text') || '';
      }
      if (window.clipboardData && typeof window.clipboardData.getData === 'function') {
        return window.clipboardData.getData('Text') || '';
      }
      return '';
    }

    function getPreferredInputTarget() {
      var active = document.activeElement;
      if (active === usernameEl || active === tokenEl) return active;
      if (usernameEl && !String(usernameEl.value || '').trim()) return usernameEl;
      if (tokenEl && !String(tokenEl.value || '').trim()) return tokenEl;
      return usernameEl || tokenEl || active;
    }

    function handleInputPaste(evt) {
      if (!evt || !evt.target) return;
      var clipboardText = getClipboardText(evt);
      if (!clipboardText) return;
      evt.preventDefault();
      applyClipboardPayload(evt.target, clipboardText);
    }

    function handleDocumentPaste(evt) {
      if (!evt) return;
      var target = evt.target;
      var isLoginInput = (target === usernameEl || target === tokenEl);
      if (!isLoginInput) {
        return;
      }
      // Input-specific handler already applies payload.
    }

    function handleDocumentPasteFallback(evt) {
      if (!evt) return;
      var target = evt.target;
      var isLoginInput = (target === usernameEl || target === tokenEl);
      if (isLoginInput) return;

      var clipboardText = getClipboardText(evt);
      if (!clipboardText) return;

      var preferredTarget = getPreferredInputTarget();
      if (!preferredTarget || (preferredTarget !== usernameEl && preferredTarget !== tokenEl)) return;

      evt.preventDefault();
      applyClipboardPayload(preferredTarget, clipboardText);
    }

    function handleDocumentKeydown(evt) {
      if (!evt) return;
      var pasteCombo = (evt.ctrlKey || evt.metaKey) && (evt.key === 'v' || evt.key === 'V');
      var shiftInsert = evt.shiftKey && evt.key === 'Insert';
      if (!pasteCombo && !shiftInsert) return;

      var preferredTarget = getPreferredInputTarget();
      if (!preferredTarget || (preferredTarget !== usernameEl && preferredTarget !== tokenEl)) return;
      var beforeValue = String(preferredTarget.value || '');

      // Let native paste run first. If no change, use clipboard API fallback.
      setTimeout(function () {
        if (String(preferredTarget.value || '') !== beforeValue) return;
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return;
        navigator.clipboard.readText()
          .then(function (clipText) {
            applyClipboardPayload(preferredTarget, clipText);
          })
          .catch(function () {
            // Ignore clipboard permission/runtime errors.
          });
      }, 80);
    }

    function handleInputKeydown(evt) {
      if (!evt) return;

      if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'v' || evt.key === 'V')) {
        var targetInput = evt.target;
        var beforeValue = targetInput && typeof targetInput.value === 'string' ? targetInput.value : '';

        // Keep native paste path first. If it does not change the value,
        // attempt clipboard API fallback for emulator/browser variance.
        setTimeout(function () {
          if (!targetInput || typeof targetInput.value !== 'string') return;
          if (targetInput.value !== beforeValue) return;
          if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return;

          navigator.clipboard.readText()
            .then(function (clipText) {
              applyClipboardPayload(targetInput, clipText);
            })
            .catch(function () {
              // Ignore clipboard permission/runtime errors.
            });
        }, 60);
        return;
      }
      if (evt.key === 'Enter') {
        evt.preventDefault();
        handleLogin();
      }
      if (evt.key === 'Escape') {
        evt.preventDefault();
        handleCancel();
      }
    }
    // Attach listeners
    if (submitBtn) submitBtn.addEventListener('click', handleLogin);
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
    if (usernameEl) usernameEl.addEventListener('keydown', handleInputKeydown);
    if (tokenEl) tokenEl.addEventListener('keydown', handleInputKeydown);
    if (usernameEl) usernameEl.addEventListener('paste', handleInputPaste);
    if (tokenEl) tokenEl.addEventListener('paste', handleInputPaste);
    document.addEventListener('paste', handleDocumentPasteFallback);
    document.addEventListener('keydown', handleDocumentKeydown);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    // Persist state for unmount
    state = {
      isSubmitting: false,
      latestSubmitNonce: 0,
      loginHandler: handleLogin,
      cancelHandler: handleCancel,
      keydownHandler: handleInputKeydown,
      pasteHandler: handleInputPaste,
      docPasteHandler: handleDocumentPasteFallback,
      docKeydownHandler: handleDocumentKeydown,
      connectivityHandler: updateConnectivity,
    };
  }

  /**
   * Detach event listeners and clean up any timers or state when the
   * user leaves the login route.
   *
   * @param {Object} context Route context provided by the router (unused)
   */
  function unmount(context) {
    log.info('unmount', context && context.route ? 'route=' + context.route : '');
    var usernameEl = document.getElementById('edit_username');
    var tokenEl = document.getElementById('edit_tokenNo');
    var submitBtn = document.getElementById('btn_Submit');
    var cancelBtn = document.getElementById('btn_Cancel');
    if (state) {
      if (submitBtn && state.loginHandler) submitBtn.removeEventListener('click', state.loginHandler);
      if (cancelBtn && state.cancelHandler) cancelBtn.removeEventListener('click', state.cancelHandler);
      if (usernameEl && state.keydownHandler) usernameEl.removeEventListener('keydown', state.keydownHandler);
      if (tokenEl && state.keydownHandler) tokenEl.removeEventListener('keydown', state.keydownHandler);
      if (usernameEl && state.pasteHandler) usernameEl.removeEventListener('paste', state.pasteHandler);
      if (tokenEl && state.pasteHandler) tokenEl.removeEventListener('paste', state.pasteHandler);
      if (state.docPasteHandler) document.removeEventListener('paste', state.docPasteHandler);
      if (state.docKeydownHandler) document.removeEventListener('keydown', state.docKeydownHandler);
      window.removeEventListener('online', state.connectivityHandler);
      window.removeEventListener('offline', state.connectivityHandler);
    }
    var banner = document.getElementById('offlineBanner');
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
    state = { isSubmitting: false, latestSubmitNonce: 0 };
  }

  // Expose controller
  window.loginController = {
    mount: mount,
    unmount: unmount,
  };
})();











