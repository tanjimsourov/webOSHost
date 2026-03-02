/**
 * Preferences abstraction mirroring Android's SharedPreferenceUtil.
 * Values are persisted in `localStorage` under a stable namespace to
 * prevent collisions with other applications. This module exposes
 * getString/setString and getBool/setBool helpers with default values.
 *
 * Added parity keys for Android settings:
 *   - cityId, countryId, stateId
 *   - isSongAdvEnabled, isMinuteAdvEnabled, isTimeAdvEnabled
 *   - lastDownloadedPlaylistIndex
 *   - dfClientId, tokenId
 */
(function () {
  const NAMESPACE = 'smc_prefs_';

  function key(k) {
    return NAMESPACE + k;
  }

  window.prefs = {
    /** Retrieve a string preference. */
    getString(prefKey, defaultValue = '') {
      const v = localStorage.getItem(key(prefKey));
      return v !== null ? v : defaultValue;
    },
    /** Save a string preference. */
    setString(prefKey, value) {
      localStorage.setItem(key(prefKey), String(value));
    },
    /** Retrieve a boolean preference. */
    getBool(prefKey, defaultValue = false) {
      const v = localStorage.getItem(key(prefKey));
      if (v === null) return defaultValue;
      return v === 'true';
    },
    /** Save a boolean preference. */
    setBool(prefKey, value) {
      localStorage.setItem(key(prefKey), value ? 'true' : 'false');
    },
    /** Retrieve an integer preference. */
    getInt(prefKey, defaultValue = 0) {
      const v = localStorage.getItem(key(prefKey));
      if (v === null) return defaultValue;
      const parsed = parseInt(v, 10);
      return isNaN(parsed) ? defaultValue : parsed;
    },
    /** Save an integer preference. */
    setInt(prefKey, value) {
      localStorage.setItem(key(prefKey), String(Math.floor(value)));
    },
    /** Remove a preference. */
    remove(prefKey) {
      localStorage.removeItem(key(prefKey));
    },
    /** Clear all preferences. */
    clear() {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NAMESPACE)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    },

    // ==================== City/Country/State IDs ====================
    /** Get City ID */
    getCityId() {
      return this.getString('cityid', '') || this.getString('Cityid', '');
    },
    /** Set City ID */
    setCityId(value) {
      this.setString('cityid', value);
      this.setString('Cityid', value);
    },
    /** Get Country ID */
    getCountryId() {
      return this.getString('countryid', '') || this.getString('CountryId', '');
    },
    /** Set Country ID */
    setCountryId(value) {
      this.setString('countryid', value);
      this.setString('CountryId', value);
    },
    /** Get State ID */
    getStateId() {
      return this.getString('stateid', '') || this.getString('StateId', '');
    },
    /** Set State ID */
    setStateId(value) {
      this.setString('stateid', value);
      this.setString('StateId', value);
    },

    // ==================== Client/Token IDs ====================
    /** Get DfClientId */
    getDfClientId() {
      return this.getString('dfclientid', '') || this.getString('DfClientId', '');
    },
    /** Set DfClientId */
    setDfClientId(value) {
      this.setString('dfclientid', value);
      this.setString('DfClientId', value);
    },
    /** Get TokenId */
    getTokenId() {
      return this.getString('token_no', '') || this.getString('TokenId', '');
    },
    /** Set TokenId */
    setTokenId(value) {
      this.setString('token_no', value);
      this.setString('TokenId', value);
    },

    // ==================== Advertisement Toggles ====================
    /** Get Song Advertisement Enabled flag */
    getIsSongAdvEnabled() {
      const v1 = this.getBool('isSongAdvEnabled', true);
      const legacy = this.getString('is_song_adv', '');
      if (legacy === '') return v1;
      return legacy === '1' || legacy === 'true';
    },
    /** Set Song Advertisement Enabled flag */
    setIsSongAdvEnabled(value) {
      this.setBool('isSongAdvEnabled', value);
      this.setString('is_song_adv', value ? '1' : '0');
    },
    /** Get Minute Advertisement Enabled flag */
    getIsMinuteAdvEnabled() {
      const v1 = this.getBool('isMinuteAdvEnabled', true);
      const legacy = this.getString('is_minute_adv', '');
      if (legacy === '') return v1;
      return legacy === '1' || legacy === 'true';
    },
    /** Set Minute Advertisement Enabled flag */
    setIsMinuteAdvEnabled(value) {
      this.setBool('isMinuteAdvEnabled', value);
      this.setString('is_minute_adv', value ? '1' : '0');
    },
    /** Get Time Advertisement Enabled flag */
    getIsTimeAdvEnabled() {
      const v1 = this.getBool('isTimeAdvEnabled', true);
      const legacy = this.getString('is_time_adv', '');
      if (legacy === '') return v1;
      return legacy === '1' || legacy === 'true';
    },
    /** Set Time Advertisement Enabled flag */
    setIsTimeAdvEnabled(value) {
      this.setBool('isTimeAdvEnabled', value);
      this.setString('is_time_adv', value ? '1' : '0');
    },

    // ==================== Startup ====================
    getStartup() {
      return this.getString('startup', 'auto');
    },
    setStartup(value) {
      this.setString('startup', value);
    },

    // ==================== First-Time Setup ====================
    isSetupComplete() {
      return this.getBool('setup_complete', false);
    },
    setSetupComplete(value) {
      this.setBool('setup_complete', !!value);
    },
    hasRequiredSetup() {
      return this.isSetupComplete();
    },

    // ==================== Playlist Index ====================
    /** Get last downloaded playlist index */
    getLastDownloadedPlaylistIndex() {
      return this.getInt('lastDownloadedPlaylistIndex', 0);
    },
    /** Set last downloaded playlist index */
    setLastDownloadedPlaylistIndex(value) {
      this.setInt('lastDownloadedPlaylistIndex', value);
    },

    // ==================== Rotation ====================
    /** Get rotation angle */
    getRotation() {
      return this.getString('rotation', '0');
    },
    /** Set rotation angle */
    setRotation(value) {
      this.setString('rotation', value);
    },

    // ==================== Login Status ====================
    /** Get login status */
    getLoginStatus() {
      return this.getString('login', '');
    },
    /** Set login status */
    setLoginStatus(value) {
      this.setString('login', value);
    },
    /** Check if logged in */
    isLoggedIn() {
      return this.getLoginStatus() === 'Permit';
    },

    // ==================== Device Info ====================
    /** Get device ID */
    getDeviceId() {
      return this.getString('device_id', '');
    },
    /** Set device ID */
    setDeviceId(value) {
      this.setString('device_id', value);
    },
  };
})();