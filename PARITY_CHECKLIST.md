# PARITY_CHECKLIST

This checklist tracks **Java → webOS parity** at a feature/module level.

**Status values:** `DONE`, `IN-PROGRESS`, `TODO`

---

## Section 1 — Baseline Parity Map + Controller Glue Framework

| Item | Java reference (source of truth) | webOS mapping (controller/service/file) | Status | Notes |
|---|---|---|---|---|
| Route controller glue (mount/unmount) | N/A (foundation layer) | `js/router.js` (renderRouteWithController), `js/controllers/_controller_registry.js`, `js/controllers/_base_controller.js` | **DONE** | Wiring + scaffolding only (no business logic). |
| Splash screen lifecycle | `app/src/main/java/com/ApplicationAddonsSignage/activities/Splash_Activity.java` | `templates/activity_splash_.html`, `js/controllers/splashController.js` | **DONE** | Implemented splash delay and boot flow. |
| Login screen lifecycle | `app/src/main/java/com/ApplicationAddonsSignage/activities/LoginActivity.java` | `templates/activity_login.html`, `js/controllers/loginController.js` | **DONE** | Added full login flow with validation, offline guard, API calls and rights check. |
| Home screen lifecycle | `app/src/main/java/com/ApplicationAddonsSignage/activities/HomeActivity.java` | `templates/activity_main.html`, `js/controllers/homeController.js` | **DONE** | Implemented playlist/ads fetch orchestration, downloads and playback start. |
| Settings screen lifecycle | `app/src/main/java/com/ApplicationAddonsSignage/activities/SettingsActivity.java` | `templates/activity_settings.html`, `js/controllers/settingsController.js` | **DONE** | Full parity: rotation/startup/ad toggles, validation, Java key compatibility, route flow (settings→login/home). |

### Manual verification (Section 1)
1. Launch the webOS app and open DevTools console.
2. Confirm initial load logs include:
   - `[ROUTER] renderRoute START ...`
   - `[ROUTER] controller mount SUCCESS ...`
3. Change routes (e.g., `location.hash = '#/login'` then `#/home`) and confirm logs show:
   - unmount for previous route then mount for next route.
4. Ensure the app remains usable if a controller throws (should log `controller mount FAIL` but not crash).

---

## Section 2 — Status Reporting Parity (Login / Heartbeat / Played Songs / Played Ads / Logout)

| Item | Java reference (source of truth) | webOS mapping | Status | Notes |
|---|---|---|---|---|
| StatusReporter module | `PlayerStatusManager.java` | `js/status/status_reporter.js` | **DONE** | Full implementation with all 5 status types. |
| Login status | `updateLoginStatus()`, `updateDataOnServer()` | `StatusReporter.reportLogin()` | **DONE** | Payload: `[{LoginDate, LoginTime, TokenId}]` |
| Heartbeat status | `updateHeartBeatStatus()`, `sendHeartBeatStatusOnServer()` | `StatusReporter.reportHeartbeat()` | **DONE** | 60s interval matching Java. Payload: `[{HeartbeatDateTime, TokenId}]` |
| Played song status | `insertSongPlayedStatus()`, `sendPlayedSongsStatusOnServer()` | `StatusReporter.reportPlayedSong()` | **DONE** | Payload: `[{ArtistId, PlayedDateTime, splPlaylistId, TokenId, TitleId}]` |
| Played ad status | `insertAdvPlayerStatus()`, `sendPlayedAdsStatusOnServer()` | `StatusReporter.reportPlayedAd()` | **DONE** | Payload: `[{AdvId, AdvPlayedDate, AdvPlayedTime, TokenId}]` |
| Logout status | `updateLogoutStatus()`, `updateLogoutStatusOnServer()` | `StatusReporter.reportLogout()` | **DONE** | Payload: `[{LogoutDate, LogoutTime, TokenId}]` |
| Offline queue (S5-R2) | `PlayerStatusDataSource.java` (SQLite) | `status_queue` IndexedDB store | **DONE** | Queues offline, flushes in order when online. |
| No double-report (S5-R3) | Unique title_id + timestamp | `reportedSongKeys`, `reportedAdKeys` Sets | **DONE** | Prevents duplicate reporting. |
| Player integration | `HomeActivity.java` playback hooks | `js/player/player.js` | **DONE** | Calls StatusReporter on song/ad play. |
| Home controller integration | `HomeActivity.onResume()` | `js/controllers/homeController.js` mount/unmount | **DONE** | Login on mount, logout on unmount, heartbeat timer. |

### Manual verification (Section 2)
1. Open DevTools Network tab and console.
2. Navigate to home route - verify `[STATUS] Login status reported` log and network call to `PlayerLoginStatusJsonArray`.
3. Wait 60 seconds - verify `[STATUS] Heartbeat reported` log and network call to `PlayerHeartBeatStatusJsonArray`.
4. Play a song - verify `[STATUS] Played song reported` log and network call to `PlayedSongsStatusJsonArray`.
5. Play an ad - verify `[STATUS] Played ad reported` log and network call to `PlayedAdvertisementStatusJsonArray`.
6. Navigate away from home - verify `[STATUS] Logout status reported` log and network call to `PlayerLogoutStatusJsonArray`.
7. Test offline: disconnect network, play songs, reconnect - verify queued statuses flush in order.

---

## Section 3 — Background Scheduler + Watchdog (Service/Worker Parity)

| Item | Java reference (source of truth) | webOS mapping | Status | Notes |
|---|---|---|---|---|
| Scheduler service | `MyService.java`, `MyWorker.java`, `WorkManager` | `js/services/scheduler.js` | **DONE** | 16-min refresh (WorkManager), 150s quick check (MyService). |
| Content refresh | `HomeActivity` periodic refresh | `Scheduler.refreshContent()` | **DONE** | Fetches playlists and ads from server. |
| Download queue | `DownloadService.java` | `Scheduler.queueMissingDownloads()` | **DONE** | Queues missing songs/ads for download. |
| Max retries (S6-R1) | N/A (safety) | 10 retries per hour limit | **DONE** | Prevents infinite restart loops. |
| Watchdog service | `ApplicationChecker.java` (CHECK_TIME=300000) | `js/services/watchdog_service.js` | **DONE** | 15s playback check, 5-min app check. |
| Stall detection | MyService runnable | `WatchdogService.isPlaybackStalled()` | **DONE** | Detects 30s+ no progress. |
| Player restart | App restart logic | `WatchdogService.restartCurrentMedia()` | **DONE** | Restarts current song on stall. |
| Soft reload | App relaunch | `WatchdogService.softReload()` | **DONE** | Route reload after 3 consecutive stalls. |
| State persistence | SharedPreferences | localStorage `smc_watchdog_state` | **DONE** | Persists retry counters across reloads. |

### Manual verification (Section 3)
1. Open DevTools console.
2. Navigate to home - verify `[SCHEDULER] Starting scheduler service` and `[WATCHDOG] Starting watchdog service` logs.
3. Wait 150 seconds - verify `[SCHEDULER] Running quick check` log.
4. Simulate stall (pause video element manually) - verify `[WATCHDOG] Playback stall detected` and recovery attempt.
5. Verify no infinite loops - check retry counter doesn't exceed 10/hour.

---

## Section 4 — SignalR Remote Control (Server Push Commands)

| Item | Java reference (source of truth) | webOS mapping | Status | Notes |
|---|---|---|---|---|
| SignalR client | `SignalRClient.java` | `js/realtime/signalr_client.js` | **DONE** | Hub URL: `https://api.applicationaddons.com/pushNotification` |
| Welcome handler | `hubConnection.on("WelcomeMethodName", ...)` | `handleWelcome()` | **DONE** | Sends token via `GetDataFromClient`. |
| Private message handler | `hubConnection.on("privateMessageMethodName", ...)` | `handlePrivateMessage()` | **DONE** | Parses all command types. |
| Play Next command | `playType === "Next"` | `onPlayNextCallback` | **DONE** | Advances to next song. |
| Play Playlist command | `playType === "Playlist"` | `onPlayPlaylistCallback` | **DONE** | Loads and plays specified playlist. |
| Play Ad command | `playType === "Ads"` | `onPlayAdCallback` | **DONE** | Plays specified advertisement. |
| Publish Update command | `dataType === "Publish" && playType === "UpdateNow"` | `onPublishUpdateCallback` | **DONE** | Refreshes playlists and ads. |
| Restart command | `playerrestart === "1"` | `onRestartCallback` | **DONE** | Reloads current playlist. |
| Reconnect logic (S7-R2) | N/A (robustness) | Exponential backoff | **DONE** | 1s-60s delay, max 10 attempts per 5-min window. |
| WebSocket fallback | N/A | `connectWebSocketFallback()` | **DONE** | Works without SignalR library. |
| Home controller integration | `HomeActivity.onResume()` SignalR init | `homeController.js` mount | **DONE** | Connects on mount, disconnects on unmount. |

### Manual verification (Section 4)
1. Open DevTools console.
2. Navigate to home - verify `[SIGNALR] Connecting to hub` and `[SIGNALR] Connected successfully` logs.
3. Send test command from server (if available) - verify command is received and executed.
4. Disconnect network - verify `[SIGNALR] Connection closed` and reconnect attempts with backoff.
5. Reconnect network - verify `[SIGNALR] Connected successfully` after reconnect.

---

## Parity map (high level)

| Feature / Module | Java reference hint | webOS current location | Status | Notes |
|---|---|---|---|---|
| Player | Look for `PlayerActivity` / player classes | `templates/activity_player.html`, `js/player/player.js` | **DONE** | Integrated with StatusReporter. |
| Scheduler | Look for playlist schedule / alarms / timers | `js/services/scheduler.js`, `js/engine/playlist_watcher.js` | **DONE** | Full Java timing parity. |
| Watchdog | Look for keep-alive / restart / receiver | `js/services/watchdog_service.js` | **DONE** | Monitors playback, recovers from stalls. |
| SignalR | Look for SignalR client usage | `js/realtime/signalr_client.js` | **DONE** | Full command parity with Java. |
| Status reporting | Look for status upload / heartbeat | `js/status/status_reporter.js` | **DONE** | Full payload+interval parity. |
| DataSource parity | Look for Room/SQLite data sources | `js/storage/*.js` | **DONE** | Full method parity with Java. |
| Prayer feature | Look for prayer schedule / logic | `js/storage/PrayerDataSource.js`, `js/engine/prayer_manager.js` | **DONE** | Fetches, stores, and applies prayer windows. |

---

## Section 5 — DataSource Method Parity + Strict Cleanup

| Item | Java reference | webOS mapping | Status | Notes |
|---|---|---|---|---|
| PlaylistDataSource.getAllPlaylistsInPlayingOrder | `PlaylistDataSource.java` | `js/storage/PlaylistDataSource.js` | **DONE** | Returns all playlists sorted by start_time. |
| PlaylistDataSource.getRemainingAllPlaylists | `PlaylistDataSource.java` | `js/storage/PlaylistDataSource.js` | **DONE** | Returns future playlists. |
| PlaylistDataSource.getPendingPastPlaylist | `PlaylistDataSource.java` | `js/storage/PlaylistDataSource.js` | **DONE** | Returns past playlists. |
| PlaylistDataSource.getListNotAvailableinWebResponse | `PlaylistDataSource.java` | `js/storage/PlaylistDataSource.js` | **DONE** | Finds stale playlists not on server. |
| PlaylistDataSource.getPlaylistGoneTime | `PlaylistDataSource.java` | `js/storage/PlaylistDataSource.js` | **DONE** | Returns expired playlists. |
| SongsDataSource.deleteSongsWithPlaylist | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Deletes songs by playlist ID. |
| SongsDataSource.getAllDownloadedSongs | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Gets downloaded songs by title ID. |
| SongsDataSource.getAllSongsThatAreDownloaded | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Gets downloaded songs verifying path. |
| SongsDataSource.checkifSongExist | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Checks/creates song with download status from existing. |
| SongsDataSource.checkifSongsExist1 | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Checks if multiple songs with same title exist. |
| SongsDataSource.updateSongsListWithSerialNumber | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Updates song serial number and fields. |
| SongsDataSource.getUnschdSongsThoseAreNotDownloaded | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Gets all non-downloaded songs. |
| SongsDataSource.updateSongsColumnDownloadStatus | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Resets download status to 0. |
| SongsDataSource.getSongListNotAvailableinWebResponse | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Finds stale songs not on server. |
| SongsDataSource.getSongsToBeDeletedWithTitleIds | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Gets songs to delete based on title IDs. |
| SongsDataSource.getCountForTotalSongsDownloaded | `SongsDataSource.java` | `js/storage/SongsDataSource.js` | **DONE** | Counts downloaded songs in active playlists. |
| AdvertisementDataSource.deleteAdvIfNotInServer | `AdvertisementDataSource.java` | `js/storage/AdvertisementDataSource.js` | **DONE** | Clears all advertisements. |
| AdvertisementDataSource.deleteAdvUnUsed | `AdvertisementDataSource.java` | `js/storage/AdvertisementDataSource.js` | **DONE** | Clears all unused advertisements. |
| AdvertisementDataSource.getNotExistInStorage | `AdvertisementDataSource.java` | `js/storage/AdvertisementDataSource.js` | **DONE** | Finds ads needing re-download. |

---

## Section 6 — Prayer Timing Feature

| Item | Java reference | webOS mapping | Status | Notes |
|---|---|---|---|---|
| PrayerDataSource CRUD | `Prayers.java` model | `js/storage/PrayerDataSource.js` | **DONE** | Full CRUD operations. |
| Prayer fetch from server | `PRAYER_TIME` endpoint | `js/engine/prayer_manager.js` | **DONE** | Fetches and stores prayer times. |
| Prayer window detection | HomeActivity prayer logic | `js/engine/prayer_manager.js` | **DONE** | Detects active prayer windows. |
| Playback pause/resume | Prayer affects playback | `js/engine/prayer_manager.js` | **DONE** | Pauses during prayer, resumes after. |
| Home controller integration | HomeActivity.onResume | `js/controllers/homeController.js` | **DONE** | Starts/stops PrayerManager. |

---

## Section 7 — Bug Fixes + Regression

| Item | Issue | Fix Location | Status | Notes |
|---|---|---|---|---|
| Endpoint constant: DOWNLOADINGPROCESS | Wrong constant name | `js/download/download_manager.js` | **DONE** | Changed to DOWNLOADING_PROCESS. |
| Endpoint constant: UPDATE_Ads_DETAILS | Wrong constant name | `js/download/download_manager.js` | **DONE** | Changed to UPDATE_ADS_DETAILS. |
| Login guard Permit check | Router guard verification | `js/router.js` | **DONE** | Verified: checks 'Permit' correctly. |
| Logout clears Permit | Settings logout flow | `js/controllers/settingsController.js` | **DONE** | Clears 'login' pref on logout. |
| PRAYER_TIME_TAG missing | Tag for prayer API | `js/net/endpoints.js` | **DONE** | Added PRAYER_TIME_TAG: 19. |

---

## Files changed in Sections 5-7

**MODIFY**
  - `index.html` (added PrayerDataSource.js and prayer_manager.js includes)
  - `js/storage/PlaylistDataSource.js` (added 5 missing methods)
  - `js/storage/SongsDataSource.js` (added 11 missing methods)
  - `js/storage/AdvertisementDataSource.js` (added 4 missing methods)
  - `js/net/endpoints.js` (added PRAYER_TIME_TAG)
  - `js/download/download_manager.js` (fixed endpoint constant bugs)
  - `js/controllers/homeController.js` (integrated PrayerManager)
  - `js/controllers/settingsController.js` (implemented logout with Permit clearing)
  - `PARITY_CHECKLIST.md` (updated with Sections 5-7)

**CREATE**
  - `js/storage/PrayerDataSource.js` (prayer CRUD operations)
  - `js/engine/prayer_manager.js` (prayer fetch and scheduling)
  - `REGRESSION_CHECKLIST.md` (manual testing checklist)

