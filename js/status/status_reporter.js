/**
 * StatusReporter handles all server status posts (login, heartbeat, played song/ad, logout)
 * with exact parity to Java PlayerStatusManager. Implements offline queue with flush-on-reconnect.
 *
 * Java reference: PlayerStatusManager.java
 * Endpoints used:
 *   - PlayerLoginStatusJsonArray
 *   - PlayerHeartBeatStatusJsonArray
 *   - PlayedSongsStatusJsonArray
 *   - PlayedAdvertisementStatusJsonArray
 *   - PlayerLogoutStatusJsonArray
 *
 * Key behaviors:
 *   - S5-R1: Payload structure matches Java (field names, arrays, timestamps)
 *   - S5-R2: Offline queue with ordered flush when online
 *   - S5-R3: No double-reporting (unique identifiers: title_id + timestamp)
 */
(function () {
  var TAG = '[STATUS]';

  // Heartbeat interval matching Java (60 seconds)
  var HEARTBEAT_INTERVAL_MS = 60000;

  // Max items per batch (Java uses 50 for songs)
  var MAX_BATCH_SIZE = 50;

  // Track reported items to prevent double-reporting (S5-R3)
  var reportedSongKeys = new Set();
  var reportedAdKeys = new Set();

  // Heartbeat timer reference
  var heartbeatTimer = null;

  // Online status tracking
  var isOnline = navigator.onLine;

  /**
   * Format date matching Java SimpleDateFormat "dd/MMM/yyyy hh:mm:ss a"
   * Example: "26/Jan/2026 06:30:45 PM"
   */
  function formatDateTime(date) {
    var d = date || new Date();
    var day = String(d.getDate()).padStart(2, '0');
    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var month = monthNames[d.getMonth()];
    var year = d.getFullYear();
    var hours = d.getHours();
    var minutes = String(d.getMinutes()).padStart(2, '0');
    var seconds = String(d.getSeconds()).padStart(2, '0');
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    var hourStr = String(hours).padStart(2, '0');
    return day + '/' + month + '/' + year + ' ' + hourStr + ':' + minutes + ':' + seconds + ' ' + ampm;
  }

  /**
   * Format date only matching Java "dd/MMM/yyyy"
   */
  function formatDate(date) {
    var d = date || new Date();
    var day = String(d.getDate()).padStart(2, '0');
    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var month = monthNames[d.getMonth()];
    var year = d.getFullYear();
    return day + '/' + month + '/' + year;
  }

  /**
   * Format time only matching Java "hh:mm:ss a"
   */
  function formatTime(date) {
    var d = date || new Date();
    var hours = d.getHours();
    var minutes = String(d.getMinutes()).padStart(2, '0');
    var seconds = String(d.getSeconds()).padStart(2, '0');
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    var hourStr = String(hours).padStart(2, '0');
    return hourStr + ':' + minutes + ':' + seconds + ' ' + ampm;
  }

  /**
   * Get TokenId from preferences (matches Java SharedPreferenceUtil)
   */
  function getTokenId() {
    return prefs.getString('token_no', '') || prefs.getString('TokenId', '');
  }

  /**
   * Queue a status for offline storage. Uses IndexedDB status_queue store.
   */
  async function queueStatus(statusType, payload) {
    try {
      await DB.withTransaction(['status_queue'], 'readwrite', function (stores) {
        return new Promise(function (resolve, reject) {
          var record = {
            type: statusType,
            payload: payload,
            timestamp: Date.now(),
            retries: 0
          };
          var req = stores.status_queue.add(record);
          req.onsuccess = function () {
            console.log(TAG, 'Queued offline status:', statusType);
            resolve(req.result);
          };
          req.onerror = function () {
            reject(req.error);
          };
        });
      });
    } catch (err) {
      console.error(TAG, 'Failed to queue status:', err);
    }
  }

  /**
   * Flush all queued statuses in order when back online.
   */
  async function flushQueue() {
    if (!navigator.onLine) {
      console.log(TAG, 'Still offline, skipping flush');
      return;
    }
    try {
      var queued = await DB.withTransaction(['status_queue'], 'readonly', function (stores) {
        return new Promise(function (resolve) {
          var results = [];
          var req = stores.status_queue.openCursor();
          req.onsuccess = function (event) {
            var cursor = event.target.result;
            if (cursor) {
              results.push({ id: cursor.key, data: cursor.value });
              cursor.continue();
            } else {
              resolve(results);
            }
          };
          req.onerror = function () {
            resolve([]);
          };
        });
      });

      if (queued.length === 0) {
        return;
      }

      console.log(TAG, 'Flushing', queued.length, 'queued statuses');

      // Sort by timestamp to maintain order
      queued.sort(function (a, b) {
        return a.data.timestamp - b.data.timestamp;
      });

      for (var i = 0; i < queued.length; i++) {
        var item = queued[i];
        var success = await sendStatusToServer(item.data.type, item.data.payload);
        if (success) {
          // Remove from queue
          await DB.withTransaction(['status_queue'], 'readwrite', function (stores) {
            return new Promise(function (resolve) {
              var req = stores.status_queue.delete(item.id);
              req.onsuccess = function () { resolve(true); };
              req.onerror = function () { resolve(false); };
            });
          });
        }
      }
      console.log(TAG, 'Queue flush complete');
    } catch (err) {
      console.error(TAG, 'Error flushing queue:', err);
    }
  }

  /**
   * Send status payload to server. Returns true on success.
   */
  function sendStatusToServer(statusType, payload) {
    return new Promise(function (resolve) {
      var endpoint;
      var tag;

      switch (statusType) {
        case 'login':
          endpoint = ENDPOINTS.PLAYER_LOGIN_STATUS_STREAM;
          tag = TAGS.PLAYER_LOGIN_STATUS_STREAM_TAG;
          break;
        case 'heartbeat':
          endpoint = ENDPOINTS.PLAYER_HEARTBEAT_STATUS_STREAM;
          tag = TAGS.PLAYER_HEARTBEAT_STATUS_STREAM_TAG;
          break;
        case 'song':
          endpoint = ENDPOINTS.PLAYED_SONG_STATUS_STREAM;
          tag = TAGS.PLAYED_SONG_STATUS_STREAM_TAG;
          break;
        case 'ad':
          endpoint = ENDPOINTS.PLAYED_ADVERTISEMENT_STATUS_STREAM;
          tag = TAGS.ADVERTISEMENTS_TAG;
          break;
        case 'logout':
          endpoint = ENDPOINTS.PLAYER_LOGOUT_STATUS_STREAM;
          tag = TAGS.PLAYER_LOGOUT_STATUS_STREAM_TAG;
          break;
        default:
          console.error(TAG, 'Unknown status type:', statusType);
          resolve(false);
          return;
      }

      var listener = {
        onResponse: function (response, responseTag) {
          try {
            var parsed = JSON.parse(response);
            var resp = Array.isArray(parsed) && parsed[0] ? parsed[0].Response : null;
            if (resp === '1' || resp === 1) {
              console.log(TAG, 'Status reported successfully:', statusType);
              resolve(true);
            } else {
              console.warn(TAG, 'Status report response not 1:', statusType, response);
              resolve(true); // Still consider it sent
            }
          } catch (e) {
            console.log(TAG, 'Status sent (non-JSON response):', statusType);
            resolve(true);
          }
        },
        onError: function (err, errorTag) {
          console.error(TAG, 'Status report failed:', statusType, err);
          resolve(false);
        }
      };

      OkHttpUtil.callRequest(endpoint, JSON.stringify(payload), listener, tag);
    });
  }

  /**
   * Report login status to server.
   * Java reference: PlayerStatusManager.updateLoginStatus() + updateDataOnServer()
   * Payload: [{ LoginDate, LoginTime, TokenId }]
   */
  async function reportLogin() {
    var now = new Date();
    var tokenId = getTokenId();

    // Store locally first (like Java)
    var playerStatusDS = new PlayerStatusDataSource();
    try {
      await playerStatusDS.createPlayerStatus({
        login_date: formatDate(now),
        login_time: formatTime(now),
        is_player_status_type: 'login'
      });
    } catch (err) {
      console.error(TAG, 'Failed to store login status locally:', err);
    }

    // Build payload matching Java exactly
    var payload = [{
      LoginDate: formatDate(now),
      LoginTime: formatTime(now),
      TokenId: tokenId
    }];

    if (!navigator.onLine) {
      console.log(TAG, 'Offline - queuing login status');
      await queueStatus('login', payload);
      return;
    }

    var success = await sendStatusToServer('login', payload);
    if (success) {
      // Delete local login records on success (like Java)
      try {
        await playerStatusDS.deletePlayedStatus('login');
      } catch (err) {
        console.error(TAG, 'Failed to delete login status:', err);
      }
    } else {
      await queueStatus('login', payload);
    }
    console.log(TAG, 'Login status reported');
  }

  /**
   * Report heartbeat status to server.
   * Java reference: PlayerStatusManager.updateHeartBeatStatus() + sendHeartBeatStatusOnServer()
   * Payload: [{ HeartbeatDateTime, TokenId }]
   */
  async function reportHeartbeat() {
    var now = new Date();
    var tokenId = getTokenId();

    // Store locally first
    var playerStatusDS = new PlayerStatusDataSource();
    try {
      await playerStatusDS.createPlayerStatus({
        heartbeat_datetime: formatDateTime(now),
        is_player_status_type: 'heartbeat'
      });
    } catch (err) {
      console.error(TAG, 'Failed to store heartbeat locally:', err);
    }

    // Build payload matching Java exactly
    var payload = [{
      HeartbeatDateTime: formatDateTime(now),
      TokenId: tokenId
    }];

    if (!navigator.onLine) {
      console.log(TAG, 'Offline - queuing heartbeat');
      await queueStatus('heartbeat', payload);
      return;
    }

    var success = await sendStatusToServer('heartbeat', payload);
    if (success) {
      // Delete local heartbeat records on success
      try {
        await playerStatusDS.deletePlayedStatus('heartbeat');
      } catch (err) {
        console.error(TAG, 'Failed to delete heartbeat status:', err);
      }
    }
    console.log(TAG, 'Heartbeat reported');
  }

  /**
   * Report played song status to server.
   * Java reference: PlayerStatusManager.insertSongPlayedStatus() + sendPlayedSongsStatusOnServer()
   * Payload: [{ ArtistId, PlayedDateTime, splPlaylistId, TokenId, TitleId }]
   *
   * @param {Object} song - Song object with artist_id, title_id, sp_playlist_id
   */
  async function reportPlayedSong(song) {
    if (!song) {
      console.warn(TAG, 'No song provided to reportPlayedSong');
      return;
    }

    var now = new Date();
    var tokenId = getTokenId();
    var playedDateTime = formatDateTime(now);
    var titleId = song.title_id || song.titleId || '';
    var artistId = song.artist_id || song.artistId || '';
    var splPlaylistId = song.sp_playlist_id || song.splPlaylistId || '';

    // S5-R3: Check for duplicate (title_id + timestamp)
    var uniqueKey = titleId + '_' + playedDateTime;
    if (reportedSongKeys.has(uniqueKey)) {
      console.log(TAG, 'Song already reported, skipping:', uniqueKey);
      return;
    }
    reportedSongKeys.add(uniqueKey);

    // Limit the set size to prevent memory issues
    if (reportedSongKeys.size > 1000) {
      var keysArray = Array.from(reportedSongKeys);
      reportedSongKeys = new Set(keysArray.slice(-500));
    }

    // Store locally first (like Java)
    var playerStatusDS = new PlayerStatusDataSource();
    try {
      await playerStatusDS.createPlayerStatus({
        artist_id_song: artistId,
        played_date_time_song: playedDateTime,
        title_id_song: titleId,
        spl_playlist_id_song: splPlaylistId,
        is_player_status_type: 'song'
      });
    } catch (err) {
      console.error(TAG, 'Failed to store song status locally:', err);
    }

    // Build payload matching Java exactly
    var payload = [{
      ArtistId: artistId,
      PlayedDateTime: playedDateTime,
      splPlaylistId: splPlaylistId,
      TokenId: tokenId,
      TitleId: titleId
    }];

    if (!navigator.onLine) {
      console.log(TAG, 'Offline - queuing played song');
      await queueStatus('song', payload);
      return;
    }

    var success = await sendStatusToServer('song', payload);
    if (success) {
      // Delete this specific song status on success
      try {
        await playerStatusDS.deletePlayedSongStatusForTime('song', titleId, playedDateTime);
      } catch (err) {
        console.error(TAG, 'Failed to delete song status:', err);
      }
    } else {
      await queueStatus('song', payload);
    }
    console.log(TAG, 'Played song reported:', titleId);
  }

  /**
   * Report played advertisement status to server.
   * Java reference: PlayerStatusManager.insertAdvPlayerStatus() + sendPlayedAdsStatusOnServer()
   * Payload: [{ AdvId, AdvPlayedDate, AdvPlayedTime, TokenId }]
   *
   * @param {Object} ad - Advertisement object with adv_id
   */
  async function reportPlayedAd(ad) {
    if (!ad) {
      console.warn(TAG, 'No ad provided to reportPlayedAd');
      return;
    }

    var now = new Date();
    var tokenId = getTokenId();
    var advId = ad.adv_id || ad.advId || ad.AdvtID || '';
    var playedDate = formatDate(now);
    var playedTime = formatTime(now);

    // S5-R3: Check for duplicate (adv_id + date + time)
    var uniqueKey = advId + '_' + playedDate + '_' + playedTime;
    if (reportedAdKeys.has(uniqueKey)) {
      console.log(TAG, 'Ad already reported, skipping:', uniqueKey);
      return;
    }
    reportedAdKeys.add(uniqueKey);

    // Limit the set size
    if (reportedAdKeys.size > 500) {
      var keysArray = Array.from(reportedAdKeys);
      reportedAdKeys = new Set(keysArray.slice(-250));
    }

    // Store locally first
    var playerStatusDS = new PlayerStatusDataSource();
    try {
      await playerStatusDS.createPlayerStatus({
        advertisement_id_status: advId,
        advertisement_played_date: playedDate,
        advertisement_played_time: playedTime,
        is_player_status_type: 'ad'
      });
    } catch (err) {
      console.error(TAG, 'Failed to store ad status locally:', err);
    }

    // Build payload matching Java exactly
    var payload = [{
      AdvId: advId,
      AdvPlayedDate: playedDate,
      AdvPlayedTime: playedTime,
      TokenId: tokenId
    }];

    if (!navigator.onLine) {
      console.log(TAG, 'Offline - queuing played ad');
      await queueStatus('ad', payload);
      return;
    }

    var success = await sendStatusToServer('ad', payload);
    if (success) {
      // Delete this specific ad status on success
      try {
        await playerStatusDS.deletePlayedAdvStatus('ad', advId);
      } catch (err) {
        console.error(TAG, 'Failed to delete ad status:', err);
      }
    } else {
      await queueStatus('ad', payload);
    }
    console.log(TAG, 'Played ad reported:', advId);
  }

  /**
   * Report logout status to server.
   * Java reference: PlayerStatusManager.updateLogoutStatus() + updateLogoutStatusOnServer()
   * Payload: [{ LogoutDate, LogoutTime, TokenId }]
   */
  async function reportLogout() {
    var now = new Date();
    var tokenId = getTokenId();

    // Store locally first
    var playerStatusDS = new PlayerStatusDataSource();
    try {
      await playerStatusDS.createPlayerStatus({
        logout_date: formatDate(now),
        logout_time: formatTime(now),
        is_player_status_type: 'logout'
      });
    } catch (err) {
      console.error(TAG, 'Failed to store logout status locally:', err);
    }

    // Build payload matching Java exactly
    var payload = [{
      LogoutDate: formatDate(now),
      LogoutTime: formatTime(now),
      TokenId: tokenId
    }];

    if (!navigator.onLine) {
      console.log(TAG, 'Offline - queuing logout status');
      await queueStatus('logout', payload);
      return;
    }

    await sendStatusToServer('logout', payload);
    console.log(TAG, 'Logout status reported');
  }

  /**
   * Start the heartbeat timer. Matches Java interval (60 seconds).
   */
  function startHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    console.log(TAG, 'Starting heartbeat timer (interval:', HEARTBEAT_INTERVAL_MS, 'ms)');
    heartbeatTimer = setInterval(function () {
      reportHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    // Send initial heartbeat
    reportHeartbeat();
  }

  /**
   * Stop the heartbeat timer.
   */
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      console.log(TAG, 'Heartbeat timer stopped');
    }
  }

  /**
   * Initialize online/offline listeners for queue management.
   */
  function initNetworkListeners() {
    window.addEventListener('online', function () {
      console.log(TAG, 'Network online - flushing queue');
      isOnline = true;
      flushQueue();
    });

    window.addEventListener('offline', function () {
      console.log(TAG, 'Network offline');
      isOnline = false;
    });
  }

  // Initialize network listeners on load
  initNetworkListeners();

  // Expose globally
  window.StatusReporter = {
    reportLogin: reportLogin,
    reportHeartbeat: reportHeartbeat,
    reportPlayedSong: reportPlayedSong,
    reportPlayedAd: reportPlayedAd,
    reportLogout: reportLogout,
    startHeartbeat: startHeartbeat,
    stopHeartbeat: stopHeartbeat,
    flushQueue: flushQueue,
    // Expose for testing
    formatDateTime: formatDateTime,
    formatDate: formatDate,
    formatTime: formatTime
  };
})();
