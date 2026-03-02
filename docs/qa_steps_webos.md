# QA Steps for webOS Port

This document outlines recommended test steps to validate the webOS implementation of the Smc Signage player.  The checks aim to mirror the behaviour of the original Android application while taking into account the limitations of a browser environment.  Follow each section to ensure parity across advertisements, downloads, playback and remote control features.

## 1. Advertisement Fetching and Persistence

1. Configure valid values in `prefs` for `Cityid`, `CountryId`, `CurrentDate`, `DfClientId`, `StateId`, `TokenId` and `WeekNo`.
2. Instantiate the `AdsManager` and call `fetchAdvertisements()` with the above parameters.
3. Inspect the IndexedDB `advertisement` store using browser dev tools.  Verify that records contain the following fields: `adv_id`, `adv_file_url`, `flavour`, `playlistid`, `adv_minute`, `adv_song`, `adv_time`, `adv_total_min`, `adv_total_song`, `adv_play_type`, `adv_sound_type`, `adv_start_date`, `adv_start_time`, `adv_end_date`, `download_status` and `adv_path`.
4. Confirm that stale advertisements are removed on subsequent fetches by modifying the server payload and invoking `fetchAdvertisements()` again.

## 2. Advertisement Insertion Rules

Test minute, song and fixed‐time advertisements separately using a controlled set of sample ads:

1. Minute‑based ads: insert an advertisement with `adv_minute=1` and `adv_total_min=1`.  Play a song of known duration and observe that `AdsManager.checkMinuteAd()` returns the ad after one minute of accumulated playback time.
2. Song‑based ads: insert an advertisement with `adv_song=1` and `adv_total_song=2`.  Play two consecutive songs and verify that `AdsManager.checkSongAd()` returns the ad after the second song finishes.
3. Fixed‑time ads: insert an advertisement with `adv_time=1`, `adv_start_date`/`adv_start_time` matching a near future window and `adv_end_date`/`adv_start_time` extending beyond that window.  Call `AdsManager.pickNextAd('time')` and confirm that the ad is returned only when the current system time falls within the scheduled window.
4. Flavour, playlist and sound type filters: set `flavour`, `playlistid`, `adv_play_type` and `adv_sound_type` on test ads.  Pass corresponding values in the filter object to `pickNextAd()` and verify that only matching ads are returned.

## 3. Download Manager Queue and Persistence

1. Populate `DownloadManager` with a mix of song and advertisement records using `addSongsToQueue()` and `addAdsToQueue()`.
2. Call `start()` and allow downloads to run.  Refresh the page mid‑way and re‑instantiate `DownloadManager`.  Check that `currentIndex`, `completed` and `failed` lists resume from where they left off by observing network activity and verifying `download_manager_state` in `localStorage`.
3. Inspect the `SongsDataSource` and `AdvertisementDataSource` tables.  Confirm that downloaded entries have `is_downloaded=1`/`download_status=1` and `song_path`/`adv_path` set to the original URL so that the Cache API can intercept subsequent fetches.
4. Monitor outgoing API calls via the network panel.  Verify that the following endpoints are hit after each download with payloads matching the Java order: `UPDATE_PLAYLIST_DOWNLOADED_SONGS`, `UPDATE_PLAYLIST_SONGS_DETAILS`, `DOWNLOADINGPROCESS` (songs) and `UPDATE_Ads_DETAILS` (advertisements).

## 4. Media Playback and Advertisement Scheduling

1. Prepare a playlist containing at least three songs of varying media types (video, audio, image and web/URL).  Ensure each record includes `song_url`, `is_downloaded`, `song_path`, `mediatype` and `timeinterval` or `time` where appropriate.
2. Instantiate a `Player` with a pre‑fetched `AdsManager` and optional `DownloadManager`.
3. Call `loadPlaylist()` with the prepared songs.  Observe that the correct HTML element is used for each media type (`<video>`, `<audio>`, `<img>` or `<iframe>`), that images/web pages are displayed for the specified interval and that playback cycles through the list.
4. Inject minute, song and fixed‑time ads as described in Section 2.  Verify that the player inserts advertisements at the correct intervals and resumes the playlist after each ad.
5. Confirm that song and advertisement playbacks are logged via `PlayerStatusDataSource` with fields `artist_id_song`, `played_date_time_song`, `title_id_song`, `advertisement_id_status`, `advertisement_played_date` and `advertisement_played_time`.

## 5. Heartbeat and Watchdog

1. Allow the player to run for at least two minutes.  Inspect the `player_status` store and ensure that heartbeat entries (`is_player_status_type = 'heartbeat'`) are created every 60 seconds.
2. Simulate a stall by pausing video/audio programmatically and blocking time updates.  Confirm that the watchdog triggers after 30 seconds by automatically restarting the current media.

## 6. SignalR Remote Control

1. Use a WebSocket client (e.g. browser console or test server) to connect to `wss://api.applicationaddons.com/pushNotification` and send control messages to the player.
2. Test `type="Next"` to skip to the next song immediately.
3. Test `type="Playlist"` with a valid playlist ID.  Verify that the player fetches, downloads (if a `DownloadManager` was supplied) and starts the specified playlist.
4. Test `type="Ads"` with a valid advertisement ID.  Ensure that the specified ad plays immediately and the playlist resumes afterwards.
5. Test `datatype="Publish"` and `type="UpdateNow"` to trigger a token publish update.  Confirm that playlists and advertisements are refreshed and that any newly available media is added to the download queue.
6. Send a message with `playerrestart="1"` and verify that the player restarts from the beginning of the current playlist.

## 7. Volume, Rotation and Offline Behaviour

1. Set rotation preferences via `prefs.setString('rotation', '90')` and reload the app.  Check that the entire UI rotates accordingly.
2. Modify volume preferences (`playlistvol` where applicable) and observe that audio/video elements adjust their volume.  (Note: this may require additional code hooks depending on implementation.)
3. Disable network connectivity.  Ensure that the player continues to play downloaded content without attempting to fetch remote URLs.  Re‑enable the network and confirm that downloads resume and SignalR reconnects automatically.

## 8. Crash Log and Status Streams (Optional)

1. Trigger an unhandled error in the player code and verify that it is captured and reported via the `UPDATE_CRASH_LOG` endpoint if implemented.
2. Review outgoing status arrays such as `PlayerLoginStatusJsonArray`, `PlayerLogoutStatusJsonArray`, `PlayedSongsStatusJsonArray` and `PlayerHeartBeatStatusJsonArray` to ensure parity with the Android implementation.

---

Performing the above steps will help validate the functional parity of the webOS signage player relative to its Android counterpart.  Adjust the test data and environment as needed to simulate real‑world conditions such as varying network speeds, time zones and advertisement schedules.