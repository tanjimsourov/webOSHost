# API Payload Examples

This document collects the known request bodies used by the Smc Signage
application when talking to its backend.  The examples below have been
inferred by auditing the Java source code (notably usages of
`OkHttpUtil` and the constants defined in `Constants.java`).  They
illustrate the shape of the JSON payloads sent to each endpoint.  For
clarity only the relevant fields are shown; additional properties
present in the Java models are omitted.  All requests are sent as
JSON with the `Content‑Type: application/json` header.

> **Note:** The property names must match exactly those shown in the
> examples—capitalisation matters.  When porting code to webOS be
> careful not to rename or alter the keys.

## CheckUserRightsLive_bulk (`ENDPOINTS.CHECK_USER_RIGHTS`, tag 1)

Used during device activation to validate multiple hardware identifiers
against the server.  The body is a JSON array where each element
contains a `DeviceId` string.  In the Android implementation the
array contains the device ID, two MAC addresses and the serial number.

```
[
  { "DeviceId": "<device id>" },
  { "DeviceId": "<wifi MAC address>" },
  { "DeviceId": "<ethernet MAC address>" },
  { "DeviceId": "<serial number>" }
]
```

## AppLogin (`ENDPOINTS.CHECK_USER_LOGIN`, tag 2)

Authenticates a user against the server.  The payload carries the
device identifier, a token number and the username along with static
fields indicating the database and player type.  In the Android app
`DBType` is set to `"Nusign"` and `PlayerType` is `"Android"`.  For
webOS the `PlayerType` may be changed to reflect the new platform.

```
{
  "DeviceId": "<device id>",
  "TokenNo": "<token number>",
  "UserName": "<username>",
  "DBType": "Nusign",
  "PlayerType": "Android"
}
```

## GetPlaylistsSchedule (`ENDPOINTS.GET_SPL_PLAYLIST_SCHEDULE`, tag 3)

Retrieves the schedule of playlists for a particular week.  The
`DfClientId` and `TokenId` values are persisted in preferences and the
week number is calculated from the current day.  The server returns a
JSON object with a `response` flag and a nested `data` array.

```
{
  "DfClientId": "<client id>",
  "TokenId": "<token id>",
  "WeekNo": "<week number>"
}
```

### Response structure

On success the server responds with JSON similar to the following:

```
{
  "response": "1",
  "data": [
    {
      "StartTime": "1/1/1900 10:00 AM",
      "EndTime": "1/1/1900 11:00 AM",
      "FormatId": "<format>",
      "dfclientid": "<client id>",
      "IsMute": "0",
      "pScid": "<schedule id>",
      "splPlaylistId": "<playlist id>",
      "splPlaylistName": "<playlist name>",
      "VolumeLevel": "100",
      "IsSeprationActive_New": "0"
    },
    { "…" }
  ]
}
```

Each entry in the `data` array corresponds to a playlist window.  The
client converts the `StartTime` and `EndTime` strings into
milliseconds for comparison against the current time.

## GetPlaylistsContent (`ENDPOINTS.GET_SPL_PLAYLIST_CONTENT`, tag 4)

Requests the list of media items (songs) belonging to a particular
playlist.  The only parameter required is the playlist identifier
returned from the schedule call.

```
{
  "splPlaylistId": "<playlist id>"
}
```

### Response structure

The server responds with a JSON array.  Each object describes a media
item and includes identifiers, descriptive metadata and playback
information.  Key fields include `title_id`, `titles`, `album_id`,
`artist_id`, `time`, `artist_name`, `album_name`, `splPlaylistId`,
`song_url`, `serial_no`, `filesize`, `timeinterval`, `mediatype` and
`reftime`.  The Android client maps these fields directly into the
SQLite `songs` table.

## Advertisements (`ENDPOINTS.ADVERTISEMENTS`, tag 8)

Retrieves advertisement schedules based on a location and time window.
The payload contains several identifiers plus the current date and
week number.  The exact fields are:

```
{
  "Cityid": "<city id>",
  "CountryId": "<country id>",
  "CurrentDate": "<YYYY-MM-DD>",
  "DfClientId": "<client id>",
  "StateId": "<state id>",
  "TokenId": "<token id>",
  "WeekNo": "<week number>"
}
```

The response contains an array of advertisement objects describing the
advert file URL, name, play conditions (isMinute, isSong, isTime),
serial number, total minutes, total songs, start/end dates and times,
paths and download status.  These properties map directly onto the
fields defined in `MySQLiteHelper` for the `advertisement` table.

## Player Status Streams

Several endpoints send arrays of player status entries back to the
server.  Each uses the same general pattern: assemble an array of
objects collected from the local `table_player_status` store and POST
it to the appropriate endpoint.  Examples include:

### PlayerLoginStatusJsonArray (`ENDPOINTS.PLAYER_LOGIN_STATUS_STREAM`, tag 5)

```
[
  {
    "LoginDate": "<DD/MMM/YYYY>",
    "LoginTime": "<hh:mm:ss AA>",
    "TokenId": "<token id>"
  },
  { "…" }
]
```

### PlayerLogoutStatusJsonArray (`ENDPOINTS.PLAYER_LOGOUT_STATUS_STREAM`, tag 9)

```
[
  {
    "LogoutDate": "<DD/MMM/YYYY>",
    "LogoutTime": "<hh:mm:ss AA>",
    "TokenId": "<token id>"
  }
]
```

### PlayedSongsStatusJsonArray (`ENDPOINTS.PLAYED_SONG_STATUS_STREAM`, tag 6)

```
[
  {
    "ArtistId": "<artist id>",
    "PlayedDateTime": "<DD/MMM/YYYY hh:mm:ss AA>",
    "splPlaylistId": "<playlist id>",
    "TokenId": "<token id>",
    "TitleId": "<title id>"
  },
  { "…" }
]
```

### PlayerHeartBeatStatusJsonArray (`ENDPOINTS.PLAYER_HEARTBEAT_STATUS_STREAM`, tag 7)

```
[
  {
    "HeatBeatDateTime": "<DD/MMM/YYYY hh:mm:ss AA>",
    "TokenId": "<token id>"
  }
]
```

### PlayedAdvertisementStatusJsonArray (`ENDPOINTS.PLAYED_ADVERTISEMENT_STATUS_STREAM`, tag 8)

```
[
  {
    "AdvertisementId": "<adv id>",
    "PlayedDate": "<DD/MMM/YYYY>",
    "PlayedTime": "<hh:mm:ss AA>",
    "TokenId": "<token id>"
  },
  { "…" }
]
```

## Token Publish Checks and Updates

Two endpoints deal with token publishing.  `CheckTokenPublish` (tag 11)
expects an array with a single empty object; the server responds with
a flag `IsPublishUpdate`.  If this flag is `"1"` the client initiates
a refresh of schedules and media.  `UpdateTokenPublish` (tag 12)
takes an array containing a single object with `TokenId`.  A value of
`"0"` for `IsPublishUpdate` in the server response indicates that the
update succeeded.

### CheckTokenPublish (`ENDPOINTS.CHECK_TOKEN_PUBLISH`)

```
[
  {}
]
```

### UpdateTokenPublish (`ENDPOINTS.UPDATE_TOKEN_PUBLISH`)

```
[
  {
    "TokenId": "<token id>"
  }
]
```

## Crash Log Upload (`ENDPOINTS.UPDATE_CRASH_LOG`, tag 15)

Uploads a crash log associated with the current token.  The payload
contains two fields: `TokenId` referencing the current device token
and `crash_message` containing a human readable error string.  The
Android app collects this information when an uncaught exception
occurs.

```
{
  "TokenId": "<token id>",
  "crash_message": "<stack trace or error message>"
}
```

---

These examples are meant as a starting point for building a robust
API layer in the webOS port.  When adding new endpoints please audit
the corresponding Java code to capture all required fields and update
this document accordingly.