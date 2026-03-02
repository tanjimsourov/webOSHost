/**
 * PlaylistManager fetches schedules + playlist content, persists them into
 * IndexedDB, and exposes convenience helpers used by controllers.
 */
(function () {
  function toInt(value, fallback) {
    var parsed = parseInt(value, 10);
    return isNaN(parsed) ? (fallback || 0) : parsed;
  }

  function parsePortalDateTime(input) {
    if (!input || typeof input !== 'string') return NaN;
    var trimmed = input.trim();
    if (!trimmed) return NaN;

    // Fast path for browser-native parsing support.
    var nativeDate = new Date(trimmed);
    if (!isNaN(nativeDate.getTime())) {
      return nativeDate.getTime();
    }

    // Expected variants:
    // - "1/1/1900 12:00:00 AM"
    // - "25/01/2026 00:00:00 AM"
    var parts = trimmed.split(/\s+/);
    if (parts.length < 2) return NaN;

    var dateParts = parts[0].split('/');
    var timeParts = parts[1].split(':');
    var ampm = (parts[2] || '').toUpperCase();

    if (dateParts.length !== 3 || timeParts.length < 2) return NaN;

    var d0 = toInt(dateParts[0], 0);
    var d1 = toInt(dateParts[1], 0);
    var year = toInt(dateParts[2], 0);
    var day = 0;
    var month = 0;

    if (year > 0) {
      if (d0 > 12) {
        day = d0;
        month = d1;
      } else {
        month = d0;
        day = d1;
      }
    }

    if (day <= 0 || month <= 0 || month > 12 || year <= 0) return NaN;

    var hour = toInt(timeParts[0], 0);
    var minute = toInt(timeParts[1], 0);
    var second = toInt(timeParts[2], 0);

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    var parsedDate = new Date(year, month - 1, day, hour, minute, second);
    return parsedDate.getTime();
  }

  function parseDataArray(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function parseServerArrayPayload(responseText) {
    var parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      return [];
    }

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    var flag = parsed.response != null ? parsed.response : parsed.Response;
    if (flag != null && String(flag) !== '1') {
      return [];
    }

    return parseDataArray(parsed.data != null ? parsed.data : parsed.Data);
  }

  function currentWeekNo() {
    var day = new Date().getDay(); // Sunday=0
    return String(day === 0 ? 1 : day + 1);
  }

  class PlaylistManager {
    constructor(listener) {
      this.listener = listener || null;
      this.playlistDataSource = new PlaylistDataSource();
      this.songsDataSource = new SongsDataSource();
      this.advertisementDataSource = new AdvertisementDataSource();

      this._cachedPlaylists = [];
      this._cachedSongsByPlaylist = new Map();
    }

    _notifyStarted() {
      if (this.listener && typeof this.listener.startedGettingPlaylist === 'function') {
        this.listener.startedGettingPlaylist();
      }
    }

    _notifyFinished() {
      if (this.listener && typeof this.listener.finishedGettingPlaylist === 'function') {
        this.listener.finishedGettingPlaylist();
      }
    }

    _notifyError() {
      if (this.listener && typeof this.listener.errorInGettingPlaylist === 'function') {
        this.listener.errorInGettingPlaylist();
      }
    }

    _resolveIdentifiers(params) {
      params = params || {};
      var resolvedDfClientId = params.dfClientId;
      var resolvedTokenId = params.tokenId;
      var resolvedWeekNo = params.weekNo;

      if (!resolvedDfClientId && window.prefs) {
        resolvedDfClientId = (prefs.getDfClientId && prefs.getDfClientId()) || prefs.getString('dfclientid', '');
      }
      if (!resolvedTokenId && window.prefs) {
        resolvedTokenId = (prefs.getTokenId && prefs.getTokenId()) || prefs.getString('token_no', '');
      }
      if (!resolvedWeekNo) {
        resolvedWeekNo = currentWeekNo();
      }

      return {
        dfClientId: resolvedDfClientId || '',
        tokenId: resolvedTokenId || '',
        weekNo: String(resolvedWeekNo || ''),
      };
    }

    async getPlaylistsFromServer(params) {
      var ids = this._resolveIdentifiers(params);
      if (!ids.dfClientId || !ids.tokenId) {
        console.warn('[PlaylistManager] Missing dfClientId/tokenId; skipping schedule fetch');
        this._notifyError();
        return;
      }

      this._notifyStarted();

      return new Promise((resolve) => {
        OkHttpUtil.getPlaylistsSchedule(
          { dfClientId: ids.dfClientId, tokenId: ids.tokenId, weekNo: ids.weekNo },
          {
            onResponse: async (responseText) => {
              try {
                await this._handleScheduleResponse(responseText);
                await this._fetchSongsForDistinctPlaylists();
                await this._refreshCacheFromDb();
                this._notifyFinished();
              } catch (err) {
                console.error('[PlaylistManager] Error while processing schedule/content', err);
                this._notifyError();
              } finally {
                resolve();
              }
            },
            onError: (err) => {
              console.error('[PlaylistManager] Schedule request failed:', err);
              this._notifyError();
              resolve();
            },
          }
        );
      });
    }

    async _refreshCacheFromDb() {
      try {
        this._cachedPlaylists = await this.playlistDataSource.getAllPlaylistsInPlayingOrder();
      } catch (e) {
        this._cachedPlaylists = [];
      }
    }

    async _handleScheduleResponse(responseText) {
      var dataArray = parseServerArrayPayload(responseText);
      var validSchIds = [];

      for (var i = 0; i < dataArray.length; i++) {
        var item = dataArray[i] || {};
        var scheduleId = String(item.pScid || item.pScId || item.pScID || item.sch_id || '');
        var playlistId = String(item.splPlaylistId || item.splPlaylistID || item.sp_playlist_id || '');
        var startTime = item.StartTime || item.start_time || '';
        var endTime = item.EndTime || item.end_time || '';

        if (!scheduleId || !playlistId) {
          continue;
        }

        var record = {
          sch_id: scheduleId,
          sp_playlist_id: playlistId,
          start_time: startTime,
          end_time: endTime,
          sp_name: item.splPlaylistName || item.sp_name || '',
          startTimeInMilli: parsePortalDateTime(startTime),
          endTimeInMilli: parsePortalDateTime(endTime),
          isseprationactive: toInt(item.IsSeprationActive_New || item.IsSeprationActive_new || item.isseprationactive, 0),
          playlistcategory: String(item.IsMute || item.playlistcategory || ''),
          playlistvol: String(item.VolumeLevel || item.playlistvol || '0'),
        };

        validSchIds.push(record.sch_id);
        await this.playlistDataSource.checkifPlaylistExist(record);
      }

      await this._deleteExtraPlaylists(validSchIds);
    }

    async _deleteExtraPlaylists(validSchIds) {
      if (!Array.isArray(validSchIds)) return;
      var allPlaylists = await this.playlistDataSource.getAllPlaylistsInPlayingOrder();
      for (var i = 0; i < allPlaylists.length; i++) {
        var playlist = allPlaylists[i];
        if (!validSchIds.includes(playlist.sch_id)) {
          await this.playlistDataSource.deletePlaylistById(playlist._id);
        }
      }
    }

    async _fetchSongsForDistinctPlaylists() {
      var distinctPlaylists = await this.playlistDataSource.getAllDistinctPlaylists();
      for (var i = 0; i < distinctPlaylists.length; i++) {
        var playlistId = distinctPlaylists[i] && distinctPlaylists[i].sp_playlist_id;
        if (!playlistId) continue;
        await this._fetchSongsForPlaylist(playlistId);
      }
    }

    async _fetchSongsForPlaylist(playlistId) {
      if (!playlistId) return;

      return new Promise((resolve) => {
        OkHttpUtil.getPlaylistsContent(
          { splPlaylistId: playlistId },
          {
            onResponse: async (responseText) => {
              try {
                await this._handleSongsResponse(responseText, playlistId);
              } catch (err) {
                console.error('[PlaylistManager] Error processing songs for playlist', playlistId, err);
              } finally {
                resolve();
              }
            },
            onError: (err) => {
              console.error('[PlaylistManager] Songs request failed for playlist', playlistId, err);
              resolve();
            },
          }
        );
      });
    }

    async _handleSongsResponse(responseText, fallbackPlaylistId) {
      var dataArray = parseServerArrayPayload(responseText);
      var seenTitleIds = [];
      var localCacheList = [];
      var seenTitleSet = new Set();

      for (var i = 0; i < dataArray.length; i++) {
        var item = dataArray[i] || {};
        var playlistId = String(item.splPlaylistId || item.sp_playlist_id || fallbackPlaylistId || '');
        var titleId = String(item.titleId || item.title_id || '');
        if (!playlistId || !titleId) continue;
        if (seenTitleSet.has(titleId)) continue;
        seenTitleSet.add(titleId);

        var songRecord = {
          sch_id: playlistId,
          title_id: titleId,
          is_downloaded: 0,
          titles: String(item.Title || item.titles || ''),
          album_id: String(item.AlbumID || item.album_id || ''),
          artist_id: String(item.ArtistID || item.artist_id || ''),
          time: String(item.tTime || item.time || ''),
          artist_name: String(item.arName || item.artist_name || ''),
          album_name: String(item.alName || item.album_name || ''),
          sp_playlist_id: playlistId,
          song_path: '',
          song_url: String(item.TitleUrl || item.song_url || ''),
          serial_no: toInt(item.srno || item.serial_no, 0),
          filesize: String(item.FileSize || item.filesize || ''),
          timeinterval: toInt(item.TimeInterval || item.timeinterval, 0),
          mediatype: String(item.mediatype || item.mediaType || ''),
          reftime: toInt(item.urlRefershTime || item.reftime, 0),
        };

        seenTitleIds.push(songRecord.title_id);
        localCacheList.push(songRecord);
        await this.songsDataSource.checkifSongExist(songRecord);
      }

      if (fallbackPlaylistId) {
        var staleSongs = await this.songsDataSource.getSongListNotAvailableinWebResponse(seenTitleIds, fallbackPlaylistId);
        for (var j = 0; j < staleSongs.length; j++) {
          await this.songsDataSource.deleteSongs(staleSongs[j], false);
        }

        if (typeof this.songsDataSource.removeDuplicateSongsForPlaylist === 'function') {
          await this.songsDataSource.removeDuplicateSongsForPlaylist(fallbackPlaylistId);
        }

        // Rebuild cache from DB to keep runtime state aligned with persisted deduped records.
        var downloaded = await this.songsDataSource.getSongsThoseAreDownloaded(fallbackPlaylistId);
        var missing = await this.songsDataSource.getSongsThoseAreNotDownloaded(fallbackPlaylistId);
        var merged = [];
        var byTitle = new Map();

        for (var k = 0; k < downloaded.length; k++) {
          var d = downloaded[k];
          var dk = String((d && (d.title_id || d._id)) || '');
          if (!dk) continue;
          byTitle.set(dk, d);
        }
        for (var m = 0; m < missing.length; m++) {
          var s = missing[m];
          var sk = String((s && (s.title_id || s._id)) || '');
          if (!sk) continue;
          if (!byTitle.has(sk)) {
            byTitle.set(sk, s);
          }
        }

        merged = Array.from(byTitle.values());
        this._cachedSongsByPlaylist.set(fallbackPlaylistId, merged.length > 0 ? merged : localCacheList);
      }
    }

    // ---- Async DB-backed helpers ----
    async getPlaylistsForCurrentAndComingTime() {
      return this.playlistDataSource.getPlaylistsForCurrentAndComingTime();
    }

    async getAllDistinctPlaylists() {
      return this.playlistDataSource.getAllDistinctPlaylists();
    }

    async refreshAll(params) {
      return this.getPlaylistsFromServer(params);
    }

    async checkUpdatedPlaylistData() {
      return this.getPlaylistsFromServer();
    }

    // ---- Sync-friendly compatibility helpers used by controllers ----
    getPlaylistForCurrentTimeOnly() {
      var nowAbsolute = Date.now();
      var nowDate = new Date();
      var nowReference = new Date(
        1900,
        0,
        1,
        nowDate.getHours(),
        nowDate.getMinutes(),
        nowDate.getSeconds(),
        nowDate.getMilliseconds()
      ).getTime();
      var referenceCutoff = new Date(2000, 0, 1).getTime();

      var active = this._cachedPlaylists.filter(function (pl) {
        var start = Number(pl.startTimeInMilli || 0);
        var end = Number(pl.endTimeInMilli || 0);
        if (!start || !end) return false;

        var useReferenceClock = start < referenceCutoff && end < referenceCutoff;
        var now = useReferenceClock ? nowReference : nowAbsolute;

        // Handle both normal and overnight windows.
        if (end >= start) {
          return now >= start && now < end;
        }
        return now >= start || now < end;
      });

      active.sort(function (a, b) {
        return Number(a.startTimeInMilli || 0) - Number(b.startTimeInMilli || 0);
      });
      return active;
    }

    getPlaylistFromLocallyToBedDownload() {
      return this._cachedPlaylists.slice();
    }

    getAllPlaylistInPlayingOrder() {
      return this._cachedPlaylists
        .slice()
        .sort(function (a, b) {
          return Number(a.startTimeInMilli || 0) - Number(b.startTimeInMilli || 0);
        });
    }

    getAllPlaylistCatSchd() {
      return this.getAllPlaylistInPlayingOrder();
    }

    getSongsForPlaylist(playlistId) {
      var songs = this._cachedSongsByPlaylist.get(String(playlistId || '')) || [];
      return songs.filter(function (song) {
        return Number(song.is_downloaded || 0) === 1;
      });
    }

    getSongsForPlaylistRandom(playlistId) {
      var songs = this.getSongsForPlaylist(playlistId).slice();
      for (var i = songs.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = songs[i];
        songs[i] = songs[j];
        songs[j] = tmp;
      }
      return songs;
    }

    getSongsThatAreNotDownloaded(playlistId) {
      var songs = this._cachedSongsByPlaylist.get(String(playlistId || '')) || [];
      return songs.filter(function (song) {
        return Number(song.is_downloaded || 0) !== 1;
      });
    }

    getUnschdSongs() {
      return [];
    }
  }

  window.PlaylistManager = PlaylistManager;
})();
