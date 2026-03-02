# Java Audit Inventory

## Activities
- `com/ApplicationAddonsSignage/activities/Splash_Activity.java`
- `com/ApplicationAddonsSignage/activities/HomeActivity.java`
- `com/ApplicationAddonsSignage/activities/LoginActivity.java`
- `com/ApplicationAddonsSignage/activities/SettingsActivity.java`

## Services
- `com/ApplicationAddonsSignage/alarm_manager/ApplicationChecker.java`
- `com/ApplicationAddonsSignage/alarm_manager/MyService.java`
- `com/ApplicationAddonsSignage/api_manager/DownloadService.java`

## Receivers
- `com/ApplicationAddonsSignage/alarm_manager/MyReceiver.java`
- `com/ApplicationAddonsSignage/receiver/LaunchReceiver.java`
- `com/ApplicationAddonsSignage/utils/ConnectivityReceiver.java`

## Workers
- `com/ApplicationAddonsSignage/alarm_manager/MyWorker.java`

## Core Managers
- `com/ApplicationAddonsSignage/utils/MyNotificationManager.java`
- `com/ApplicationAddonsSignage/utils/AlertDialogManager.java`
- `com/ApplicationAddonsSignage/mediamanager/PlayerStatusManager.java`
- `com/ApplicationAddonsSignage/mediamanager/PlaylistManager.java`
- `com/ApplicationAddonsSignage/mediamanager/AdvertisementsManager.java`
- `com/ApplicationAddonsSignage/mediamanager/AdditionalSongsRemovalTask.java`

## Utilities
- `com/ApplicationAddonsSignage/utils/ConnectionDetector.java`
- `com/ApplicationAddonsSignage/utils/MyFirebaseMessagingService.java`
- `com/ApplicationAddonsSignage/utils/ExternalStorage.java`
- `com/ApplicationAddonsSignage/utils/Constants.java`
- `com/ApplicationAddonsSignage/utils/ProgressBarAnimation.java`
- `com/ApplicationAddonsSignage/utils/AccessToken.java`
- `com/ApplicationAddonsSignage/utils/SharedPreferenceUtil.java`
- `com/ApplicationAddonsSignage/utils/FileUtil.java`
- `com/ApplicationAddonsSignage/utils/AlenkaMediaPreferences.java`
- `com/ApplicationAddonsSignage/utils/LoggingExceptionHandler.java`
- `com/ApplicationAddonsSignage/utils/SignalRClient.java`
- `com/ApplicationAddonsSignage/utils/StorageUtils.java`
- `com/ApplicationAddonsSignage/utils/Utilities.java`
- `com/ApplicationAddonsSignage/utils/UpdateWithoutRestart.java`
- `com/ApplicationAddonsSignage/utils/NetworkUtil.java`

## Database/DataSources
- `com/ApplicationAddonsSignage/database/MySQLiteHelper.java`
- `com/ApplicationAddonsSignage/database/SongsDataSource.java`
- `com/ApplicationAddonsSignage/database/PlayerStatusDataSource.java`
- `com/ApplicationAddonsSignage/database/PlaylistDataSource.java`
- `com/ApplicationAddonsSignage/database/AdvertisementDataSource.java`

## Models
- `com/ApplicationAddonsSignage/models/Songs.java`
- `com/ApplicationAddonsSignage/models/Prayers.java`
- `com/ApplicationAddonsSignage/models/Playlist.java`
- `com/ApplicationAddonsSignage/models/PlayerStatus.java`
- `com/ApplicationAddonsSignage/models/Advertisements.java`

## Adapters
- `com/ApplicationAddonsSignage/adapters/SongAdapter.java`
- `com/ApplicationAddonsSignage/adapters/PlaylistAdapter.java`

## Interfaces
- `com/ApplicationAddonsSignage/interfaces/DownloadListener.java`
- `com/ApplicationAddonsSignage/interfaces/PlaylistLoaderListener.java`

## Other Classes
- `com/ApplicationAddonsSignage/alarm_manager/PlaylistWatcher.java`
- `com/ApplicationAddonsSignage/application/AlenkaMedia.java`
- `com/ApplicationAddonsSignage/api_manager/OkHttpUtil.java`
- `com/ApplicationAddonsSignage/custom_views/MyClaudVideoView.java`
- `com/ApplicationAddonsSignage/custom_views/Lvideoads.java`

## Endpoints and Tags (from `Constants.java`)

- public static final String SERVER = "https://applicationaddons.com/api/";
- public static final String VIDEO_TAG = "video";
- public static final String PLAYER_TYPE = "Android";
- public static final String CHECK_USER_RIGHTS = SERVER + "CheckUserRightsLive_bulk";//DeviceId
- public static final String CHECK_USER_LOGIN = SERVER + "AppLogin";//DeviceId,TokenNo,UserName
- public static final String UPDATE_CRASH_LOG = SERVER + "TokenCrashLog";
- public static final String GetSplPlaylist_VIDEO =  SERVER + "GetPlaylistsSchedule";
- public static final String CRASH_MESSAGE = "crash_message";
- public static final String GET_SPL_PLAY_LIST_TITLES_VIDEO = SERVER + "GetPlaylistsContent";
- public static final String UpdateFcm=SERVER + "UpdateFCMId";
- public static final String UpdateNetworkParametrs=SERVER + "SaveNetworkSpeed";
- public static final String PLAYER_LOGIN_STATUS_STREAM = SERVER + "PlayerLoginStatusJsonArray";// login status
- public static final String PLAYED_SONG_STATUS_STREAM = SERVER + "PlayedSongsStatusJsonArray";// played song status
- public static final String PLAYER_HEARTBEAT_STATUS_STREAM = SERVER + "PlayerHeartBeatStatusJsonArray";// player heartbeat
- public static final String ADVERTISEMENTS = SERVER + "AdvtSchedule";// prayer time
- public static final String GetSplPlaylist = SERVER + "GetSplPlaylistLive";// Special playlist
- public static final String GET_SPL_PLAY_LIST_TITLES = SERVER + "GetSplPlaylistTitlesLive";//playlist id
- public static final String PRAYER_TIME = SERVER + "PrayerTiming";// prayer time
- public static final String PLAYER_LOGOUT_STATUS_STREAM = SERVER + "PlayerLogoutStatusJsonArray";// logout status
- public static final String PLAYED_ADVERTISEMENT_STATUS_STREAM = SERVER + "PlayedAdvertisementStatusJsonArray";// played advertisement status
- public static final String DOWNLOADINGPROCESS = SERVER + "DownloadingProcess";// played advertisement status
- public static final String CHECK_TOKEN_PUBLISH = SERVER + "CheckTokenPublish";
- public static final String UPDATE_TOKEN_PUBLISH = SERVER + "UpdateTokenPublish";
- public static final String UPDATE_PLAYLIST_DOWNLOADED_SONGS = SERVER + "PlaylistWiseDownloadedTotalSong";
- public static final String UPDATE_PLAYLIST_SONGS_DETAILS = SERVER + "PlaylistWiseDownloadedSongsDetail";
- public static final String SCHEDULED_SONGS = SERVER + "GetAllPlaylistScheduleSongs";
- public static final String GetTokenContent = SERVER + "GetTokenContent";
- public static final String UPDATE_Ads_DETAILS = SERVER + "AdsDownloadedStatus";
- public static final String PLAYED_PRAYER_STATUS_STREAM = SERVER + "PlayedPrayerStatusJsonArray";// played prayer status
- public static final String KEY_PLAYLIST_NAMES_ARRAY = "playlistNamesArray";
- public static final String ALARM_ACTION = "com.alarm.action";
- public static final String ALARM_PLAYLIST_CHANGED = "com.alarm.playlist.changed";
- public static final String CONNECTIVITY_CHANGED = "android.net.conn.CONNECTIVITY_CHANGE";
- public static final String TOKEN_ID = "token_no";
- public static final String ROOT_FOLDER = "AlenkaMedia";
- public static final String ADVERTISEMENT_FOLDER = "Advertisements";
- public static final String CONTENT_FOLDER = "AlenkaMedia";
- public static final String TAG_START_DOWNLOAD_SERVICE = "TAG_START_DOWNLOAD_SERVICE";
- public static final String IS_UPDATE_IN_PROGRESS = "IS_UPDATE_IN_PROGRESS";
- public static final String TAG_FILE_EXTENSION_MP3 ="mp4";
- public static final String STORAGE_ALERT_SHOWN_ONCE = "STORAGE_ALERT_SHOWN_ONCE";
- public static final String SONGS_LAST_REMOVED = "SONGS_LAST_REMOVED";
- public static final int CHECK_USER_RIGHTS_TAG = 1;
- public static final int CHECK_USER_LOGIN_TAG = 2;
- public static final int UPDATE_CRASH_LOG_TAG = 15;
- public static final int GetSplPlaylist_TAG = 3;
- public static final int GET_SPL_PLAY_LIST_TITLES_TAG = 4;
- public static final int UpdateFcm_TAG= 20;
- public static final int UpdateNetworkParam_TAG= 21;
- public static final int PLAYER_LOGIN_STATUS_STREAM_TAG = 5;// login status
- public static final int PLAYED_SONG_STATUS_STREAM_TAG = 6;// login status
- public static final int PLAYER_HEARTBEAT_STATUS_STREAM_TAG = 7;// login status
- public static final int ADVERTISEMENTS_TAG = 8;// login status
- public static final int PLAYER_LOGOUT_STATUS_STREAM_TAG = 9;// login status
- public static final int PLAYED_ADVERTISEMENT_TAG = 8;// login status
- public static final int DOWNLOADINGPROCESS_TAG = 10;// login status
- public static final int CHECK_TOKEN_PUBLISH_TAG = 11;
- public static final int UPDATE_TOKEN_PUBLISH_TAG = 12;
- public static final int UPDATE_PLAYLIST_DOWNLOADED_SONGS_TAG = 13;
- public static final int UPDATE_PLAYLIST_SONGS_DETAILS_TAG = 14;
- public static final int SCHEDULED_SONGS_TAG = 16;
- public static final int  GetTokenContent_TAG = 17;
- public static final int UPDATE_Ads_DETAILS_TAG = 18;

## Preference Keys (from `AlenkaMediaPreferences.java`)

- public static final String MYClaudAlenkaPrefs = "myclaudalenka_prefs";
- public static final String DEVICE_ID = "device_id";
- public static final String TOKEN_ID = "token_no";
- public static final String Imgtype = "imgtype";
- public static final String LoginSuccess = "login";
- public static final String Rotation = "rotation";
- public static final String PublicIP = "public";
- public static final String Startup = "startup";
- public static final String Firebaseserver = "firebaseserver";
- public static final String Indicatorimg = "indicator";
- public static final String SchType = "schtype";
- public static final String DFCLIENT_ID = "dfclientid";
- public static final String City_ID = "cityid";
- public static final String Country_ID = "countryid";
- public static final String State_Id = "stateid";
- public static final String Is_Stop_Control = "IsStopcontrol";
- public static final String INDEX = "index";
- public static final String is_Minute_Adv = "is_minute_adv";
- public static final String Reboot_Time = "reboot";
- public static final String is_song_Adv = "is_song_adv";
- public static final String is_Time_Adv = "is_time_adv";
- public static final String playing_Type = "playing_type";
- public static final String sTime_in_Milli_Adv = "sTime_in_Milli_Adv";
- public static final String total_Songs = "total_Songs";
- public static final String total_minute_after_adv_play = "total_minute_after_adv_play";
- public static final String lastDownloadedPlaylistIndex = "lastDownloadedPlaylistIndex";
