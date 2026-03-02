/**
 * Endpoint and tag definitions for the Smc Signage webOS port.  This module
 * mirrors the string constants found in the Android `Constants.java` file.
 * Each property exposed on the `ENDPOINTS` object is a fully qualified URL
 * constructed from the base `SERVER` path defined below.  The `TAGS`
 * collection enumerates the integer identifiers used throughout the
 * application to correlate network responses with their originating requests.
 *
 * These objects are attached to the global `window` so that other modules
 * (such as the API layer or playlist manager) can reference the same
 * definitions without requiring an import system.  Keeping a single source
 * of truth for endpoints and tags helps prevent typos and makes it easy to
 * update the server base URL in one place if needed.
 */
(function () {
  const SERVER = 'https://applicationaddons.com/api/';

  /**
   * Mapping of logical endpoint names to their corresponding URLs.  The
   * property names mirror those found in the Java `Constants` class.  If
   * additional endpoints are introduced in the future they should be added
   * here to keep the API surface consistent.
   */
  const ENDPOINTS = {
    CHECK_USER_RIGHTS: SERVER + 'CheckUserRightsLive_bulk',
    CHECK_USER_LOGIN: SERVER + 'AppLogin',
    UPDATE_CRASH_LOG: SERVER + 'TokenCrashLog',
    GET_SPL_PLAYLIST_SCHEDULE: SERVER + 'GetPlaylistsSchedule',
    GET_SPL_PLAYLIST_CONTENT: SERVER + 'GetPlaylistsContent',
    UPDATE_FCM: SERVER + 'UpdateFCMId',
    UPDATE_NETWORK_PARAMS: SERVER + 'SaveNetworkSpeed',
    // Status reporting streams (Android parity)
    PLAYER_LOGIN_STATUS_STREAM: SERVER + 'PlayerLoginStatusJsonArray',
    PLAYED_SONG_STATUS_STREAM: SERVER + 'PlayedSongsStatusJsonArray',
    PLAYER_HEARTBEAT_STATUS_STREAM: SERVER + 'PlayerHeartBeatStatusJsonArray',
    ADVERTISEMENTS: SERVER + 'AdvtSchedule',
    GET_SPL_PLAYLIST: SERVER + 'GetSplPlaylistLive',
    GET_SPL_PLAYLIST_TITLES: SERVER + 'GetSplPlaylistTitlesLive',
    PRAYER_TIME: SERVER + 'PrayerTiming',
    PLAYER_LOGOUT_STATUS_STREAM: SERVER + 'PlayerLogoutStatusJsonArray',
    PLAYED_PRAYER_STATUS_STREAM: SERVER + 'PlayedPrayerStatusJsonArray',

    // Aliases expected by API parity checker / legacy modules
    // (keeps naming consistent with Java "player status" usage)
    PLAYER_STATUS_LOGIN: SERVER + 'PlayerLoginStatusJsonArray',
    PLAYER_STATUS_HEARTBEAT: SERVER + 'PlayerHeartBeatStatusJsonArray',
    PLAYER_STATUS_LOGOUT: SERVER + 'PlayerLogoutStatusJsonArray',
    PLAYED_ADVERTISEMENT_STATUS_STREAM: SERVER + 'PlayedAdvertisementStatusJsonArray',
    DOWNLOADING_PROCESS: SERVER + 'DownloadingProcess',
    CHECK_TOKEN_PUBLISH: SERVER + 'CheckTokenPublish',
    UPDATE_TOKEN_PUBLISH: SERVER + 'UpdateTokenPublish',
    UPDATE_PLAYLIST_DOWNLOADED_SONGS: SERVER + 'PlaylistWiseDownloadedTotalSong',
    UPDATE_PLAYLIST_SONGS_DETAILS: SERVER + 'PlaylistWiseDownloadedSongsDetail',
    SCHEDULED_SONGS: SERVER + 'GetAllPlaylistScheduleSongs',
    GET_TOKEN_CONTENT: SERVER + 'GetTokenContent',
    UPDATE_ADS_DETAILS: SERVER + 'AdsDownloadedStatus'
  };

  /**
   * Tag values associated with each network request.  These numeric codes are
   * used to disambiguate responses in callback handlers.  They mirror the
   * constants defined in the Java code under `Constants.java`.
   */
  const TAGS = {
    CHECK_USER_RIGHTS_TAG: 1,
    CHECK_USER_LOGIN_TAG: 2,
    GET_SPL_PLAYLIST_TAG: 3,
    GET_SPL_PLAY_LIST_TITLES_TAG: 4,
    PLAYER_LOGIN_STATUS_STREAM_TAG: 5,
    PLAYED_SONG_STATUS_STREAM_TAG: 6,
    PLAYER_HEARTBEAT_STATUS_STREAM_TAG: 7,
    ADVERTISEMENTS_TAG: 8,
    PLAYER_LOGOUT_STATUS_STREAM_TAG: 9,
    DOWNLOADINGPROCESS_TAG: 10,
    CHECK_TOKEN_PUBLISH_TAG: 11,
    UPDATE_TOKEN_PUBLISH_TAG: 12,
    UPDATE_PLAYLIST_DOWNLOADED_SONGS_TAG: 13,
    UPDATE_PLAYLIST_SONGS_DETAILS_TAG: 14,
    UPDATE_CRASH_LOG_TAG: 15,
    SCHEDULED_SONGS_TAG: 16,
    GET_TOKEN_CONTENT_TAG: 17,
    UPDATE_ADS_DETAILS_TAG: 18,
    PRAYER_TIME_TAG: 19,
    UPDATE_FCM_TAG: 20,
    UPDATE_NETWORK_PARAM_TAG: 21
  };

  // Expose as globals
  window.ENDPOINTS = ENDPOINTS;
  window.TAGS = TAGS;
})();