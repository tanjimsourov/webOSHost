(function() {
  /**
   * AdsManager handles retrieval, persistence and selection of advertisements.
   * It mirrors the Android AdvertisementsManager/HomeActivity logic in a
   * simplified manner suitable for webOS.  Advertisements are fetched from
   * the backend using the OkHttpUtil.getAdvertisements helper and stored
   * into the IndexedDB `advertisement` store via AdvertisementDataSource.
   * This module also exposes helpers to pick the next advertisement to play
   * based on minute, song or time based insertion rules and to track play
   * counters.
   *
   * Usage:
   *   const adsManager = new AdsManager();
   *   await adsManager.fetchAdvertisements({ Cityid, CountryId, CurrentDate, DfClientId, StateId, TokenId, WeekNo });
   *   const nextMinuteAd = await adsManager.pickNextAd('minute', { playlistId, playType, soundType, flavour });
   *
   * Callers are responsible for invoking the returned ad using their
   * preferred playback method.
   */
  class AdsManager {
    constructor() {
      this.advertisementDataSource = new AdvertisementDataSource();
      // Indices tracking the last played advertisement for each category.
      this.currentlyPlayingAdAtIndexMin = -1;
      this.currentlyPlayingAdAtIndexSong = -1;
      this.currentlyPlayingAdAtIndexTime = -1;
      // Counters used for minute and song based insertion rules.
      this.songCounter = 0;
      this.minuteCounterMs = 0;
    }

    _toInt(value, fallback) {
      var parsed = parseInt(value, 10);
      return isNaN(parsed) ? (fallback || 0) : parsed;
    }

    _parseDataArray(raw) {
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

    _parseServerArrayPayload(responseText) {
      var parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (err) {
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

      return this._parseDataArray(parsed.data != null ? parsed.data : parsed.Data);
    }

    /**
     * Fetch advertisements from the server and persist them into
     * IndexedDB.  Any advertisements not present in the response are
     * removed from the local store.  The expected payload fields
     * mirror the Java implementation in Constants.ADVERTISEMENTS.
     *
     * @param {Object} params Object containing Cityid, CountryId,
     *   CurrentDate (YYYY-MM-DD), DfClientId, StateId, TokenId and WeekNo.
     */
    async fetchAdvertisements(params) {
      return new Promise((resolve) => {
        OkHttpUtil.getAdvertisements(params, {
          onResponse: async (responseText, tag) => {
            try {
              await this._handleAdsResponse(responseText);
            } catch (err) {
              console.error('Error processing advertisements:', err);
            } finally {
              resolve();
            }
          },
          onError: (err, tag) => {
            console.error('Advertisements request failed:', err);
            resolve();
          },
        });
      });
    }

    /**
     * Parse the advertisements response and upsert records into
     * IndexedDB.  Removes any stale advertisements not present in the
     * latest response.
     *
     * @param {string} responseText JSON encoded string returned from
     *   the server.
     */
    async _handleAdsResponse(responseText) {
      var dataArray = this._parseServerArrayPayload(responseText);
      const advIds = [];
      for (const item of dataArray) {
        const adv = {};
        adv.adv_file_url = item.AdvtFilePath || item.AdvtFileUrl || item.AdvFileUrl || item.adv_file_url || item.file_url || '';
        adv.adv_id = String(item.AdvtId || item.adv_id || item.AdvertisementId || '');
        adv.adv_name = item.AdvtName || item.adv_name || item.AdvertisementName || '';
        adv.flavour = item.scheduleType || item.flavour || item.Flavour || '';
        adv.playlistid = item.splplaylistid || item.Playlistid || item.playlistid || item.PlaylistId || '';
        adv.endtimechk = item.bETime || item.endtimechk || item.EndTimeRef || '';
        adv.adv_minute = this._toInt(item.IsMinute || item.adv_minute || item.isMinute || item.adv_is_min, 0);
        adv.adv_song = this._toInt(item.IsSong || item.adv_song || item.isSong || item.adv_is_song, 0);
        adv.adv_time = this._toInt(item.IsTime || item.adv_time || item.isTime || item.adv_is_time, 0);
        adv.adv_play_type = item.PlayingType || item.adv_play_type || item.AdvtPlayType || item.playType || '';
        adv.adv_sound_type = item.SoundType || item.adv_sound_type || item.AdvtSoundType || item.soundType || '';
        adv.adv_serial_no = this._toInt(item.SrNo || item.serial_no || item.AdvertisementSrNo || item.srno, 0);
        adv.adv_total_min = this._toInt(item.TotalMinutes || item.adv_total_min || item.TotalMin || item.total_min, 0);
        adv.adv_total_song = this._toInt(item.TotalSongs || item.adv_total_song || item.TotalSong || item.total_song, 0);
        adv.timeinterval = this._toInt(item.imagetime || item.timeinterval || item.TimeInterval || item.timeInterval, 0);
        adv.adv_end_date = item.eDate || item.adv_end_date || item.EndDate || item.advtEdate || '';
        adv.adv_start_date = item.sDate || item.adv_start_date || item.StartDate || item.advtSdate || '';
        adv.adv_start_time = item.sTime || item.adv_start_time || item.StartTime || item.advtStime || '';
        adv.adv_path = item.adv_path || '';
        adv.download_status = this._toInt(item.download_status, 0);
        adv.start_time_in_millis_adv = this._parseDateTime(adv.adv_start_date + ' ' + adv.adv_start_time);
        adv.end_time_in_millis_adv = this._parseDateTime(adv.adv_end_date + ' ' + adv.adv_start_time);
        adv.btStart_time_in_millis_adv = null;
        if (adv.adv_id) {
          advIds.push(adv.adv_id);
        }
        await this.advertisementDataSource.checkifExistAdv(adv);
      }
      if (advIds.length > 0) {
        const stale = await this.advertisementDataSource.getListNotAvailableinWebResponse(advIds);
        for (const ad of stale) {
          await this.advertisementDataSource.deleteAds(ad, false);
        }
      }
    }

    /**
     * Convert a human readable date/time string into milliseconds since epoch.
     * Returns NaN on invalid input.  This helper mirrors the behaviour
     * of parseDateTime in playlist_manager.js.
     *
     * @param {string} str Date string in "d/M/yyyy hh:mm aa" or similar.
     */
    _parseDateTime(str) {
      if (!str || typeof str !== 'string') return NaN;
      const d = new Date(str);
      const ms = d.getTime();
      return isNaN(ms) ? Date.parse(str) : ms;
    }

    /**
     * Retrieve all advertisements currently stored and filter by type.
     *
     * @param {string} type 'minute', 'song' or 'time'.
     * @returns {Promise<Array>} Array of advertisement records.
     */
    async _getAdsByType(type) {
      const allAds = await this.advertisementDataSource.getAllAdv();
      if (!Array.isArray(allAds)) {
        return [];
      }
      return allAds.filter((ad) => {
        if (type === 'minute') return Number(ad.adv_minute) === 1;
        if (type === 'song') return Number(ad.adv_song) === 1;
        if (type === 'time') return Number(ad.adv_time) === 1;
        return false;
      });
    }

    /**
     * Pick the next advertisement to play for the given category.  The
     * optional filter object allows matching on playlist ID, play type,
     * sound type and flavour.  Indices are advanced cyclically.
     *
     * @param {string} type One of 'minute', 'song' or 'time'.
     * @param {Object} filter Optional filter criteria:
     *   - playlistId: Only ads targeting this playlist are returned.
     *   - playType: Only ads whose adv_play_type matches or is empty/0.
     *   - soundType: Only ads whose adv_sound_type matches or is empty/0.
     *   - flavour: Only ads whose flavour matches or is empty.
     * @returns {Promise<Object|null>} An advertisement object or null.
     */
    async pickNextAd(type, filter = {}) {
      const ads = await this._getAdsByType(type);
      if (!ads.length) {
        return null;
      }
      // Filter based on provided criteria.
      const eligible = ads.filter((ad) => {
        // Download status must be 1.
        if (Number(ad.download_status) !== 1) {
          return false;
        }
        if (filter.playlistId && ad.playlistid && ad.playlistid !== filter.playlistId) {
          return false;
        }
        if (filter.playType && ad.adv_play_type && ad.adv_play_type !== filter.playType && ad.adv_play_type !== '0') {
          return false;
        }
        if (filter.soundType && ad.adv_sound_type && ad.adv_sound_type !== filter.soundType && ad.adv_sound_type !== '0') {
          return false;
        }
        if (filter.flavour && ad.flavour && ad.flavour !== filter.flavour) {
          return false;
        }
        // For time based ads ensure the current time falls within the window.
        if (type === 'time') {
          const now = Date.now();
          const start = Number(ad.start_time_in_millis_adv) || 0;
          const end = Number(ad.end_time_in_millis_adv) || 0;
          if (start && end && !(now >= start && now <= end)) {
            return false;
          }
        }
        return true;
      });
      if (!eligible.length) {
        return null;
      }
      // Determine which index to update based on type.
      let idxProp;
      if (type === 'minute') {
        idxProp = 'currentlyPlayingAdAtIndexMin';
      } else if (type === 'song') {
        idxProp = 'currentlyPlayingAdAtIndexSong';
      } else {
        idxProp = 'currentlyPlayingAdAtIndexTime';
      }
      // Advance index cyclically.
      this[idxProp] = (this[idxProp] + 1) % eligible.length;
      return eligible[this[idxProp]];
    }

    /**
     * Increment the song counter and determine whether a song‑based
     * advertisement should be played.  When the counter reaches the
     * configured threshold (adv_total_song) of the first eligible ad
     * the counter is reset and that ad is returned.  If no ad is
     * eligible or the threshold is zero this method returns null.
     *
     * @param {Object} filter Optional filter object passed to pickNextAd.
     * @returns {Promise<Object|null>} Advertisement or null.
     */
    async checkSongAd(filter = {}) {
      // Only increment if at least one downloaded song based ad exists.
      const songAds = await this._getAdsByType('song');
      if (!songAds.length) {
        return null;
      }
      // Assume the first ad defines the insertion interval.
      const threshold = Number(songAds[0].adv_total_song) || 0;
      if (threshold <= 0) {
        return null;
      }
      this.songCounter += 1;
      if (this.songCounter >= threshold) {
        this.songCounter = 0;
        return this.pickNextAd('song', filter);
      }
      return null;
    }

    /**
     * Increment the minute counter by the specified number of
     * milliseconds and determine whether a minute‑based advertisement
     * should be played.  The counter resets once the configured
     * threshold is reached.  If no ads or threshold is zero returns
     * null.
     *
     * @param {number} elapsedMs Number of milliseconds elapsed since
     *   last check (e.g. time spent playing a song).
     * @param {Object} filter Optional filter passed to pickNextAd.
     * @returns {Promise<Object|null>} Advertisement or null.
     */
    async checkMinuteAd(elapsedMs, filter = {}) {
      const minuteAds = await this._getAdsByType('minute');
      if (!minuteAds.length) {
        return null;
      }
      const thresholdMin = Number(minuteAds[0].adv_total_min) || 0;
      if (thresholdMin <= 0) {
        return null;
      }
      // accumulate milliseconds and compare against threshold in minutes
      this.minuteCounterMs += elapsedMs;
      if (this.minuteCounterMs >= thresholdMin * 60 * 1000) {
        this.minuteCounterMs = 0;
        return this.pickNextAd('minute', filter);
      }
      return null;
    }

    async getAdvertisementsToBeDownloaded() {
      return this.advertisementDataSource.getAdvThoseAreNotDownloaded();
    }

    async getAdvertisementsThatAreDownloaded() {
      return this.advertisementDataSource.getAllAdv();
    }
  }

  // Expose AdsManager globally so that other modules (e.g. Player) can
  // instantiate and use it without an import system.
  window.AdsManager = AdsManager;
})();
