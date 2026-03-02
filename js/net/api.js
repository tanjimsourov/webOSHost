/**
 * Simple network abstraction that mirrors the behaviour of the Android
 * `OkHttpUtil` class.  This module exposes a `callRequest` method which
 * performs a JSON POST against the provided endpoint and invokes the
 * supplied listener callbacks.  Requests are automatically retried a
 * configurable number of times on failure and time‑out using the
 * AbortController API.  All bodies are sent with the
 * `Content-Type: application/json` header and no additional
 * authentication headers are added by default.
 *
 * Usage:
 *
 * ```javascript
 * const listener = {
 *   onResponse: (response, tag) => { console.log('success', tag, response); },
 *   onError: (err, tag) => { console.error('error', tag, err); }
 * };
 * OkHttpUtil.callRequest(ENDPOINTS.CHECK_USER_LOGIN, JSON.stringify(payload), listener, TAGS.CHECK_USER_LOGIN_TAG);
 * ```
 */
(function () {
  /**
   * Perform a JSON POST to the specified URL.  The request will be retried
   * `retries` times if it fails due to a network error.  Each attempt
   * honours the `timeout` and aborts the request if it does not complete
   * within the allotted time.  On success the `listener.onResponse`
   * method is invoked with the response body text and tag.  On failure
   * after all retries the `listener.onError` method is called with the
   * encountered error and tag.
   *
   * @param {string} url The absolute endpoint to call.
   * @param {string} jsonBody A JSON encoded string to send as the body.
   * @param {object} listener An object implementing `onResponse` and
   *                          `onError` callbacks.
   * @param {number} tag A numeric identifier used to correlate responses.
   * @param {number} [retries=3] Number of retry attempts on failure.
   * @param {number} [timeout=15000] Timeout in milliseconds for each call.
   */
  function callRequest(url, jsonBody, listener, tag, retries = 3, timeout = 15000) {
    // Ensure arguments are sane
    if (typeof listener !== 'object' || !listener) {
      throw new Error('listener must be an object implementing onResponse and onError');
    }
    const attempt = (remaining) => {
      const controller = new AbortController();
      const timerId = setTimeout(() => {
        controller.abort();
      }, timeout);
      // Allow routing API requests through a local dev proxy when
      // `window.PROXY_API_BASE` is set (e.g. http://localhost:3000/proxy?url=)
      var finalUrl = url;
      try {
        if (window && window.PROXY_API_BASE && typeof window.PROXY_API_BASE === 'string' && /^https?:\/\//i.test(url)) {
          finalUrl = window.PROXY_API_BASE + encodeURIComponent(url);
        }
      } catch (e) {}

      fetch(finalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonBody,
        signal: controller.signal,
      })
        .then((resp) => {
          clearTimeout(timerId);
          if (!resp.ok) {
            return resp.text().then((text) => {
              throw new Error('HTTP ' + resp.status + ': ' + (text || resp.statusText || 'Request failed'));
            });
          }
          return resp.text();
        })
        .then((text) => {
          try {
            listener.onResponse(text, tag);
          } catch (cbErr) {
            console.error('Error in onResponse callback', cbErr);
          }
        })
        .catch((err) => {
          clearTimeout(timerId);
          if (remaining > 0) {
            // retry with capped exponential backoff
            var retryIndex = retries - remaining + 1;
            var waitMs = Math.min(8000, Math.pow(2, retryIndex) * 400);
            setTimeout(() => attempt(remaining - 1), waitMs);
          } else {
            try {
              listener.onError(err, tag);
            } catch (cbErr) {
              console.error('Error in onError callback', cbErr);
            }
          }
        });
    };
    attempt(retries);
  }

  /**
   * Convenience wrapper functions for frequently used API calls.  These
   * helpers assemble the payload expected by each endpoint and invoke
   * `callRequest` with the appropriate tag.  See
   * docs/api_payload_examples.md for details on the shape of each
   * payload.
   */
  function checkUserRights(deviceIds, listener) {
    const payload = deviceIds.map((id) => ({ DeviceId: id }));
    callRequest(ENDPOINTS.CHECK_USER_RIGHTS, JSON.stringify(payload), listener, TAGS.CHECK_USER_RIGHTS_TAG);
  }

  function checkUserLogin({ deviceId, tokenNo, userName, dbType = 'Nusign', playerType = 'LGWebOS' }, listener) {
    const payload = {
      DeviceId: deviceId,
      TokenNo: tokenNo,
      UserName: userName,
      DBType: dbType,
      PlayerType: playerType,
    };
    callRequest(ENDPOINTS.CHECK_USER_LOGIN, JSON.stringify(payload), listener, TAGS.CHECK_USER_LOGIN_TAG);
  }

  function getPlaylistsSchedule({ dfClientId, tokenId, weekNo }, listener) {
    const payload = {
      DfClientId: dfClientId,
      TokenId: tokenId,
      WeekNo: weekNo,
    };
    callRequest(ENDPOINTS.GET_SPL_PLAYLIST_SCHEDULE, JSON.stringify(payload), listener, TAGS.GET_SPL_PLAYLIST_TAG);
  }

  function getPlaylistsContent({ splPlaylistId }, listener) {
    const payload = { splPlaylistId };
    callRequest(ENDPOINTS.GET_SPL_PLAYLIST_CONTENT, JSON.stringify(payload), listener, TAGS.GET_SPL_PLAY_LIST_TITLES_TAG);
  }

  function getAdvertisements(params, listener) {
    // Expected params: { Cityid, CountryId, CurrentDate, DfClientId, StateId, TokenId, WeekNo }
    callRequest(ENDPOINTS.ADVERTISEMENTS, JSON.stringify(params), listener, TAGS.ADVERTISEMENTS_TAG);
  }

  function getSplPlaylistLive(params, listener) {
    // Expected params: similar to getPlaylistsSchedule
    callRequest(ENDPOINTS.GET_SPL_PLAYLIST, JSON.stringify(params), listener, TAGS.GET_SPL_PLAYLIST_TAG);
  }

  function getSplPlaylistTitlesLive(params, listener) {
    // Expected params: { tokenId, dfClientId }
    callRequest(ENDPOINTS.GET_SPL_PLAYLIST_TITLES, JSON.stringify(params), listener, TAGS.GET_SPL_PLAY_LIST_TITLES_TAG);
  }

  function getScheduledSongs(params, listener) {
    // Expected params: { tokenId, weekNo, dfClientId }
    callRequest(ENDPOINTS.SCHEDULED_SONGS, JSON.stringify(params), listener, TAGS.SCHEDULED_SONGS_TAG);
  }

  function getTokenContent(params, listener) {
    // Expected params: { tokenId }
    callRequest(ENDPOINTS.GET_TOKEN_CONTENT, JSON.stringify(params), listener, TAGS.GET_TOKEN_CONTENT_TAG);
  }

  function updateFCMId(params, listener) {
    // Expected params: { fcmId, deviceId }
    callRequest(ENDPOINTS.UPDATE_FCM, JSON.stringify(params), listener, TAGS.UPDATE_FCM_TAG);
  }

  // Export functions globally
  window.OkHttpUtil = {
    callRequest,
    checkUserRights,
    checkUserLogin,
    getPlaylistsSchedule,
    getPlaylistsContent,
    getAdvertisements,
    getSplPlaylistLive,
    getSplPlaylistTitlesLive,
    getScheduledSongs,
    getTokenContent,
    updateFCMId,
    // Backward-compatible alias
    updateFcm: updateFCMId,
  };
})();