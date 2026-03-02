/**
 * PrayerManager handles fetching prayer times from the server and
 * integrating them into the playback scheduling. This mirrors the
 * Java implementation that fetches prayer times and pauses/resumes
 * playback during prayer windows.
 *
 * Features:
 * - Fetches prayer times from ENDPOINTS.PRAYER_TIME
 * - Stores prayer data in IndexedDB via PrayerDataSource
 * - Monitors prayer windows and pauses/resumes playback
 * - Periodic refresh of prayer times (daily)
 *
 * Usage:
 *   PrayerManager.init({ player: playerInstance });
 *   PrayerManager.fetchPrayerTimes();
 *   PrayerManager.start();
 */
(function () {
  var TAG = '[PRAYER]';

  var PrayerManager = {
    _player: null,
    _prayerDataSource: null,
    _checkInterval: null,
    _refreshInterval: null,
    _isRunning: false,
    _isPrayerActive: false,
    _wasPlayingBeforePrayer: false,
    _networkErrorCount: 0,
    _nextFetchAllowedAt: 0,
    _lastFetchWarnAt: 0,

    // Configuration - matches Java defaults
    CHECK_INTERVAL_MS: 10000,         // Check every 10 seconds
    REFRESH_INTERVAL_MS: 3600000,     // Refresh from server every hour

    /**
     * Initialize the prayer manager with required dependencies.
     *
     * @param {Object} options Configuration options
     * @param {Object} options.player Player instance for pause/resume
     */
    init: function (options) {
      options = options || {};
      this._player = options.player || null;
      this._prayerDataSource = new PrayerDataSource();
      console.log(TAG, 'init SUCCESS');
    },

    /**
     * Start the prayer manager monitoring and refresh loops.
     */
    start: function () {
      if (this._isRunning) {
        console.log(TAG, 'start SKIP already running');
        return;
      }
      this._isRunning = true;
      this._networkErrorCount = 0;
      this._nextFetchAllowedAt = 0;
      this._lastFetchWarnAt = 0;
      console.log(TAG, 'start SUCCESS');

      // Initial fetch
      this.fetchPrayerTimes();

      // Set up periodic check for prayer times
      var self = this;
      this._checkInterval = setInterval(function () {
        self._checkPrayerTime();
      }, this.CHECK_INTERVAL_MS);

      // Set up periodic refresh from server
      this._refreshInterval = setInterval(function () {
        self.fetchPrayerTimes();
      }, this.REFRESH_INTERVAL_MS);
    },

    /**
     * Stop the prayer manager monitoring.
     */
    stop: function () {
      if (!this._isRunning) {
        console.log(TAG, 'stop SKIP not running');
        return;
      }
      this._isRunning = false;

      if (this._checkInterval) {
        clearInterval(this._checkInterval);
        this._checkInterval = null;
      }
      if (this._refreshInterval) {
        clearInterval(this._refreshInterval);
        this._refreshInterval = null;
      }

      // Resume playback if stopped during prayer
      if (this._isPrayerActive && this._wasPlayingBeforePrayer) {
        this._resumePlayback();
      }
      this._isPrayerActive = false;

      console.log(TAG, 'stop SUCCESS');
    },

    /**
     * Fetch prayer times from the server and store in local DB.
     * Mirrors Java HomeActivity prayer time fetching.
     */
    fetchPrayerTimes: function () {
      var self = this;
      var tokenId = prefs.getString('token_no', '') || prefs.getString('TokenId', '');
      var dfClientId = prefs.getString('dfclientid', '') || prefs.getString('DfClientId', '');

      if (!tokenId || !dfClientId) {
        return Promise.resolve([]);
      }

      var now = Date.now();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!self._lastFetchWarnAt || (now - self._lastFetchWarnAt) > 60000) {
          console.warn(TAG, 'fetchPrayerTimes SKIP offline');
          self._lastFetchWarnAt = now;
        }
        return Promise.resolve([]);
      }

      if (self._nextFetchAllowedAt && now < self._nextFetchAllowedAt) {
        return Promise.resolve([]);
      }

      var currentDate = new Date().toISOString().slice(0, 10);
      var payload = {
        TokenId: tokenId,
        DfClientId: dfClientId,
        CurrentDate: currentDate
      };

      return new Promise(function (resolve) {
        if (typeof OkHttpUtil === 'undefined' || !OkHttpUtil.callRequest) {
          if (!self._lastFetchWarnAt || (now - self._lastFetchWarnAt) > 60000) {
            console.warn(TAG, 'fetchPrayerTimes SKIP network client unavailable');
            self._lastFetchWarnAt = now;
          }
          resolve([]);
          return;
        }

        OkHttpUtil.callRequest(
          ENDPOINTS.PRAYER_TIME,
          JSON.stringify(payload),
          {
            onResponse: function (response) {
              self._networkErrorCount = 0;
              self._nextFetchAllowedAt = 0;
              self._handlePrayerResponse(response);
              resolve(response);
            },
            onError: function () {
              self._networkErrorCount = (self._networkErrorCount || 0) + 1;
              var waitMs = Math.min(15 * 60 * 1000, Math.pow(2, Math.min(self._networkErrorCount, 10)) * 1000);
              self._nextFetchAllowedAt = Date.now() + waitMs;
              if (!self._lastFetchWarnAt || (Date.now() - self._lastFetchWarnAt) > 60000) {
                console.warn(TAG, 'fetchPrayerTimes retry deferred for', Math.round(waitMs / 1000), 'seconds');
                self._lastFetchWarnAt = Date.now();
              }
              resolve([]);
            }
          },
          TAGS.PRAYER_TIME_TAG || 19
        );
      });
    },

    /**
     * Handle the prayer times response from server.
     * Parse and store prayer records in IndexedDB.
     *
     * @param {string|Object} response Server response
     */
    _handlePrayerResponse: function (response) {
      var self = this;
      try {
        var data = typeof response === 'string' ? JSON.parse(response) : response;

        if (!data || !Array.isArray(data)) {
          console.log(TAG, '_handlePrayerResponse no prayer data');
          return;
        }

        console.log(TAG, '_handlePrayerResponse received', data.length, 'prayers');

        // Clear old prayers and insert new ones
        this._prayerDataSource.deleteAllPrayers().then(function () {
          var promises = data.map(function (item) {
            var prayer = self._parsePrayerItem(item);
            if (prayer) {
              return self._prayerDataSource.createPrayer(prayer);
            }
            return Promise.resolve();
          });
          return Promise.all(promises);
        }).then(function () {
          console.log(TAG, '_handlePrayerResponse stored prayers SUCCESS');
        }).catch(function (err) {
          console.error(TAG, '_handlePrayerResponse store FAIL', err);
        });

      } catch (err) {
        console.error(TAG, '_handlePrayerResponse parse FAIL', err);
      }
    },

    /**
     * Parse a prayer item from server response into DB record format.
     *
     * @param {Object} item Raw prayer item from server
     * @returns {Object|null} Parsed prayer record or null
     */
    _parsePrayerItem: function (item) {
      if (!item) return null;

      try {
        var prayer = {
          response: item.Response || item.response || '',
          end_prayer_date: item.End_Prayer_Date || item.EndPrayerDate || item.end_prayer_date || '',
          end_prayer_time: item.End_Prayer_Time || item.EndPrayerTime || item.end_prayer_time || '',
          start_prayer_date: item.Start_Prayer_Date || item.StartPrayerDate || item.start_prayer_date || '',
          start_prayer_time: item.Start_Prayer_Time || item.StartPrayerTime || item.start_prayer_time || ''
        };

        // Calculate milliseconds for start and end times
        prayer.start_time_in_milli_prayer = this._parseTimeToMilli(
          prayer.start_prayer_date,
          prayer.start_prayer_time
        );
        prayer.end_time_in_milli_prayer = this._parseTimeToMilli(
          prayer.end_prayer_date,
          prayer.end_prayer_time
        );

        // Also accept pre-calculated millis from server
        if (item.start_time_in_milli_prayer) {
          prayer.start_time_in_milli_prayer = item.start_time_in_milli_prayer;
        }
        if (item.end_time_in_milli_prayer) {
          prayer.end_time_in_milli_prayer = item.end_time_in_milli_prayer;
        }

        return prayer;
      } catch (err) {
        console.error(TAG, '_parsePrayerItem FAIL', err);
        return null;
      }
    },

    /**
     * Parse date and time strings into milliseconds timestamp.
     *
     * @param {string} dateStr Date string (various formats supported)
     * @param {string} timeStr Time string (various formats supported)
     * @returns {number} Timestamp in milliseconds
     */
    _parseTimeToMilli: function (dateStr, timeStr) {
      try {
        if (!dateStr || !timeStr) return 0;

        // Try various date/time parsing approaches
        var combined = dateStr + ' ' + timeStr;
        var date = new Date(combined);

        if (isNaN(date.getTime())) {
          // Try alternate formats
          // Format: DD/MM/YYYY HH:MM:SS AM/PM
          var parts = dateStr.split(/[\/\-]/);
          var timeParts = timeStr.split(/[:\s]/);
          
          if (parts.length >= 3 && timeParts.length >= 2) {
            var day = parseInt(parts[0], 10);
            var month = parseInt(parts[1], 10) - 1;
            var year = parseInt(parts[2], 10);
            var hour = parseInt(timeParts[0], 10);
            var minute = parseInt(timeParts[1], 10);
            var second = timeParts[2] ? parseInt(timeParts[2], 10) : 0;

            // Handle AM/PM
            var isPM = timeStr.toLowerCase().includes('pm');
            var isAM = timeStr.toLowerCase().includes('am');
            if (isPM && hour < 12) hour += 12;
            if (isAM && hour === 12) hour = 0;

            date = new Date(year, month, day, hour, minute, second);
          }
        }

        return isNaN(date.getTime()) ? 0 : date.getTime();
      } catch (err) {
        console.error(TAG, '_parseTimeToMilli FAIL', err);
        return 0;
      }
    },

    /**
     * Check if current time is within a prayer window.
     * If so, pause playback. If prayer ends, resume playback.
     */
    _checkPrayerTime: function () {
      var self = this;
      this._prayerDataSource.isPrayerTimeActive().then(function (isActive) {
        if (isActive && !self._isPrayerActive) {
          // Prayer time started
          console.log(TAG, '_checkPrayerTime PRAYER STARTED');
          self._isPrayerActive = true;
          self._pauseForPrayer();
        } else if (!isActive && self._isPrayerActive) {
          // Prayer time ended
          console.log(TAG, '_checkPrayerTime PRAYER ENDED');
          self._isPrayerActive = false;
          self._resumeAfterPrayer();
        }
      }).catch(function (err) {
        console.error(TAG, '_checkPrayerTime FAIL', err);
      });
    },

    /**
     * Pause playback for prayer time.
     */
    _pauseForPrayer: function () {
      if (!this._player) return;

      try {
        // Check if currently playing
        var isPlaying = false;
        if (this._player.video && !this._player.video.paused) {
          isPlaying = true;
        }
        if (this._player.audio && !this._player.audio.paused) {
          isPlaying = true;
        }

        this._wasPlayingBeforePrayer = isPlaying;

        if (isPlaying) {
          console.log(TAG, '_pauseForPrayer pausing playback');
          if (this._player.video) this._player.video.pause();
          if (this._player.audio) this._player.audio.pause();
        }
      } catch (err) {
        console.error(TAG, '_pauseForPrayer FAIL', err);
      }
    },

    /**
     * Resume playback after prayer time ends.
     */
    _resumeAfterPrayer: function () {
      if (!this._player || !this._wasPlayingBeforePrayer) return;

      try {
        console.log(TAG, '_resumeAfterPrayer resuming playback');
        if (this._player.video && this._player.video.paused) {
          this._player.video.play().catch(function (e) {
            console.error(TAG, '_resumeAfterPrayer video play FAIL', e);
          });
        }
        if (this._player.audio && this._player.audio.paused) {
          this._player.audio.play().catch(function (e) {
            console.error(TAG, '_resumeAfterPrayer audio play FAIL', e);
          });
        }
        this._wasPlayingBeforePrayer = false;
      } catch (err) {
        console.error(TAG, '_resumeAfterPrayer FAIL', err);
      }
    },

    /**
     * Resume playback (utility method).
     */
    _resumePlayback: function () {
      this._resumeAfterPrayer();
    },

    /**
     * Check if prayer is currently active (synchronous check of cached state).
     *
     * @returns {boolean} True if prayer time is active
     */
    isPrayerActive: function () {
      return this._isPrayerActive;
    },

    /**
     * Get next prayer time info for UI display.
     *
     * @returns {Promise<Object|null>} Next prayer record or null
     */
    getNextPrayer: function () {
      return this._prayerDataSource.getNextPrayer();
    },

    /**
     * Get today's prayer times for UI display.
     *
     * @returns {Promise<Array>} Array of today's prayer records
     */
    getTodaysPrayers: function () {
      return this._prayerDataSource.getTodaysPrayers();
    }
  };

  // Expose globally
  window.PrayerManager = PrayerManager;
})();

