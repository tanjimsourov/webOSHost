# Parity Map

This table maps each Java class from the original Android project to an equivalent module or concept in the new webOS implementation.

| Java Class | Purpose | webOS equivalent module | New file(s) |
|---|---|---|---|
| `com/ApplicationAddonsSignage/alarm_manager/PlaylistWatcher.java` | General class | General module | js/playlistwatcher.js |
| `com/ApplicationAddonsSignage/alarm_manager/MyReceiver.java` | Broadcast receiver MyReceiver | Receiver module | js/receivers/myreceiver.js |
| `com/ApplicationAddonsSignage/alarm_manager/MyWorker.java` | Background worker MyWorker | Worker module | js/workers/myworker.js |
| `com/ApplicationAddonsSignage/alarm_manager/ApplicationChecker.java` | Background service ApplicationChecker | Service module | js/services/applicationchecker.js |
| `com/ApplicationAddonsSignage/alarm_manager/MyService.java` | Background service MyService | Service module | js/services/myservice.js |
| `com/ApplicationAddonsSignage/activities/Splash_Activity.java` | Activity for Splash  | Route '#/splash' | templates/splash_activity.html |
| `com/ApplicationAddonsSignage/activities/HomeActivity.java` | Activity for Home | Route '#/home' | templates/homeactivity.html |
| `com/ApplicationAddonsSignage/activities/LoginActivity.java` | Activity for Login | Route '#/login' | templates/loginactivity.html |
| `com/ApplicationAddonsSignage/activities/SettingsActivity.java` | Activity for Settings | Route '#/settings' | templates/settingsactivity.html |
| `com/ApplicationAddonsSignage/database/MySQLiteHelper.java` | SQLite database helper | Data storage module | js/database/mysqlitehelper.js |
| `com/ApplicationAddonsSignage/database/SongsDataSource.java` | SQLite database helper | Data storage module | js/database/songsdatasource.js |
| `com/ApplicationAddonsSignage/database/PlayerStatusDataSource.java` | SQLite database helper | Data storage module | js/database/playerstatusdatasource.js |
| `com/ApplicationAddonsSignage/database/PlaylistDataSource.java` | SQLite database helper | Data storage module | js/database/playlistdatasource.js |
| `com/ApplicationAddonsSignage/database/AdvertisementDataSource.java` | SQLite database helper | Data storage module | js/database/advertisementdatasource.js |
| `com/ApplicationAddonsSignage/adapters/SongAdapter.java` | List adapter | View adapter | js/adapters/songadapter.js |
| `com/ApplicationAddonsSignage/adapters/PlaylistAdapter.java` | List adapter | View adapter | js/adapters/playlistadapter.js |
| `com/ApplicationAddonsSignage/application/AlenkaMedia.java` | General class | General module | js/alenkamedia.js |
| `com/ApplicationAddonsSignage/interfaces/DownloadListener.java` | Interface | Callback definitions | js/interfaces/downloadlistener.js |
| `com/ApplicationAddonsSignage/interfaces/PlaylistLoaderListener.java` | Interface | Callback definitions | js/interfaces/playlistloaderlistener.js |
| `com/ApplicationAddonsSignage/api_manager/DownloadService.java` | Background service DownloadService | Service module | js/services/downloadservice.js |
| `com/ApplicationAddonsSignage/api_manager/OkHttpUtil.java` | General class | General module | js/okhttputil.js |
| `com/ApplicationAddonsSignage/receiver/LaunchReceiver.java` | Broadcast receiver LaunchReceiver | Receiver module | js/receivers/launchreceiver.js |
| `com/ApplicationAddonsSignage/utils/ConnectionDetector.java` | Utility function | Utility module | js/utils/connectiondetector.js |
| `com/ApplicationAddonsSignage/utils/MyFirebaseMessagingService.java` | Utility function | Utility module | js/utils/myfirebasemessagingservice.js |
| `com/ApplicationAddonsSignage/utils/ExternalStorage.java` | Utility function | Utility module | js/utils/externalstorage.js |
| `com/ApplicationAddonsSignage/utils/Constants.java` | Utility function | Utility module | js/utils/constants.js |
| `com/ApplicationAddonsSignage/utils/MyNotificationManager.java` | Media/playlist/adv manager | Manager module | js/manager/mynotificationmanager.js |
| `com/ApplicationAddonsSignage/utils/ProgressBarAnimation.java` | Utility function | Utility module | js/utils/progressbaranimation.js |
| `com/ApplicationAddonsSignage/utils/AccessToken.java` | Utility function | Utility module | js/utils/accesstoken.js |
| `com/ApplicationAddonsSignage/utils/SharedPreferenceUtil.java` | Utility function | Utility module | js/utils/sharedpreferenceutil.js |
| `com/ApplicationAddonsSignage/utils/FileUtil.java` | Utility function | Utility module | js/utils/fileutil.js |
| `com/ApplicationAddonsSignage/utils/AlenkaMediaPreferences.java` | Utility function | Utility module | js/utils/alenkamediapreferences.js |
| `com/ApplicationAddonsSignage/utils/LoggingExceptionHandler.java` | Utility function | Utility module | js/utils/loggingexceptionhandler.js |
| `com/ApplicationAddonsSignage/utils/AlertDialogManager.java` | Media/playlist/adv manager | Manager module | js/manager/alertdialogmanager.js |
| `com/ApplicationAddonsSignage/utils/SignalRClient.java` | Utility function | Utility module | js/utils/signalrclient.js |
| `com/ApplicationAddonsSignage/utils/ConnectivityReceiver.java` | Broadcast receiver ConnectivityReceiver | Receiver module | js/receivers/connectivityreceiver.js |
| `com/ApplicationAddonsSignage/utils/StorageUtils.java` | Utility function | Utility module | js/utils/storageutils.js |
| `com/ApplicationAddonsSignage/utils/Utilities.java` | Utility function | Utility module | js/utils/utilities.js |
| `com/ApplicationAddonsSignage/utils/UpdateWithoutRestart.java` | Utility function | Utility module | js/utils/updatewithoutrestart.js |
| `com/ApplicationAddonsSignage/utils/NetworkUtil.java` | Utility function | Utility module | js/utils/networkutil.js |
| `com/ApplicationAddonsSignage/custom_views/MyClaudVideoView.java` | General class | General module | js/myclaudvideoview.js |
| `com/ApplicationAddonsSignage/custom_views/Lvideoads.java` | General class | General module | js/lvideoads.js |
| `com/ApplicationAddonsSignage/models/Songs.java` | Data model | Model definition | js/models/songs.js |
| `com/ApplicationAddonsSignage/models/Prayers.java` | Data model | Model definition | js/models/prayers.js |
| `com/ApplicationAddonsSignage/models/Playlist.java` | Data model | Model definition | js/models/playlist.js |
| `com/ApplicationAddonsSignage/models/PlayerStatus.java` | Data model | Model definition | js/models/playerstatus.js |
| `com/ApplicationAddonsSignage/models/Advertisements.java` | Data model | Model definition | js/models/advertisements.js |
| `com/ApplicationAddonsSignage/mediamanager/PlayerStatusManager.java` | Media/playlist/adv manager | Manager module | js/manager/playerstatusmanager.js |
| `com/ApplicationAddonsSignage/mediamanager/PlaylistManager.java` | Media/playlist/adv manager | Manager module | js/manager/playlistmanager.js |
| `com/ApplicationAddonsSignage/mediamanager/AdvertisementsManager.java` | Media/playlist/adv manager | Manager module | js/manager/advertisementsmanager.js |
| `com/ApplicationAddonsSignage/mediamanager/AdditionalSongsRemovalTask.java` | Media/playlist/adv manager | Manager module | js/manager/additionalsongsremovaltask.js |
