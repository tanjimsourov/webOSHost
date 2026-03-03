/**
 * Runtime compatibility profile for LG webOS devices.
 *
 * Goal:
 * - Keep one package usable across model years, with safe defaults.
 * - Apply conservative flags before Player/Home controllers initialize.
 * - Prefer stability for signage deployments on 2020+ models.
 */
(function () {
  var TAG = '[COMPAT]';

  var state = {
    profileId: 'safe-default',
    platformVersionRaw: '',
    platformMajor: null,
    releaseYear: null,
    modelName: '',
    deviceName: '',
    updatedAt: 0,
  };

  function normalizeText(value) {
    return String(value == null ? '' : value).trim();
  }

  function parseMajor(versionText) {
    var raw = normalizeText(versionText);
    if (!raw) return null;
    var match = raw.match(/(\d{1,4})/);
    if (!match) return null;
    var major = parseInt(match[1], 10);
    return isNaN(major) ? null : major;
  }

  function majorToReleaseYear(major) {
    if (major == null) return null;

    // Some runtimes report year-style majors (22/23/24 => 2022/2023/2024).
    if (major >= 22 && major <= 99) return 2000 + major;
    if (major >= 2000 && major <= 2100) return major;

    // Other runtimes report platform majors (5/6/7/8/9/10...).
    if (major === 12) return 2027;
    if (major === 11) return 2026;
    if (major === 10) return 2025;
    if (major === 9) return 2024;
    if (major === 8) return 2023;
    if (major === 7) return 2022;
    if (major === 6) return 2021;
    if (major === 5) return 2020;
    if (major === 4) return 2019;
    return null;
  }

  function detectPlatformVersionNow() {
    var candidates = [];

    try {
      if (window.webOSSystem) {
        candidates.push(window.webOSSystem.platformVersion);
        candidates.push(window.webOSSystem.version);
      }
    } catch (err) {
      // ignore
    }

    try {
      if (window.PalmSystem) {
        candidates.push(window.PalmSystem.platformVersion);
        if (window.PalmSystem.deviceInfo) {
          candidates.push(window.PalmSystem.deviceInfo.platformVersion);
          candidates.push(window.PalmSystem.deviceInfo.version);
        }
      }
    } catch (err) {
      // ignore
    }

    for (var i = 0; i < candidates.length; i++) {
      var candidate = normalizeText(candidates[i]);
      if (candidate) return candidate;
    }
    return '';
  }

  function detectModelNow() {
    var model = '';
    var device = '';
    try {
      if (window.PalmSystem && window.PalmSystem.deviceInfo) {
        var info = window.PalmSystem.deviceInfo;
        model = normalizeText(info.modelName || info.model_name || info.model || '');
        device = normalizeText(info.deviceName || info.device_name || '');
      }
    } catch (err) {
      // ignore
    }

    if (!model) {
      try {
        if (window.webOSSystem && window.webOSSystem.deviceInfo) {
          var info2 = window.webOSSystem.deviceInfo;
          model = normalizeText(info2.modelName || info2.model_name || info2.model || '');
          if (!device) device = normalizeText(info2.deviceName || info2.device_name || '');
        }
      } catch (err) {
        // ignore
      }
    }

    return { model: model, device: device };
  }

  function setFlagIfUndefined(flagName, value) {
    if (typeof window[flagName] === 'undefined') {
      window[flagName] = value;
    }
  }

  function resolveProfileId() {
    if (state.releaseYear != null && state.releaseYear >= 2020) {
      return 'lg-' + state.releaseYear;
    }
    return 'legacy-safe';
  }

  function applyProfile() {
    state.profileId = resolveProfileId();
    state.updatedAt = Date.now();

    // Keep playback stable across diverse firmware/model combinations.
    setFlagIfUndefined('ENABLE_LEGACY_HOME_FLOW', false);
    setFlagIfUndefined('ENABLE_WATCHDOG_SERVICE', false);
    setFlagIfUndefined('ENABLE_PLAYER_RAW_SIGNALR', false);
    setFlagIfUndefined('ENABLE_BLOB_CACHE', true);
    setFlagIfUndefined('ENABLE_AV_BLOB_CACHE', false);

    window.__smcCompat = Object.assign({}, state);

    console.log(
      TAG,
      'profile=' + state.profileId,
      'platform=' + (state.platformVersionRaw || 'unknown'),
      'year=' + (state.releaseYear == null ? 'unknown' : state.releaseYear),
      'model=' + (state.modelName || 'unknown')
    );
  }

  function hydrateFromRuntime() {
    state.platformVersionRaw = detectPlatformVersionNow();
    state.platformMajor = parseMajor(state.platformVersionRaw);
    state.releaseYear = majorToReleaseYear(state.platformMajor);

    var modelInfo = detectModelNow();
    state.modelName = modelInfo.model;
    state.deviceName = modelInfo.device;

    applyProfile();
  }

  function hydrateFromSystemService() {
    if (!window.webosBridge || typeof window.webosBridge.call !== 'function') {
      return;
    }

    try {
      window.webosBridge.call(
        'luna://com.webos.service.tv.systemproperty',
        'getSystemInfo',
        {
          keys: ['platform_version', 'model_name', 'device_name'],
        },
        function onSuccess(resp) {
          try {
            var reportedVersion = normalizeText(resp && (resp.platform_version || resp.platformVersion || ''));
            if (reportedVersion) {
              state.platformVersionRaw = reportedVersion;
              state.platformMajor = parseMajor(reportedVersion);
              state.releaseYear = majorToReleaseYear(state.platformMajor);
            }

            var reportedModel = normalizeText(resp && (resp.model_name || resp.modelName || ''));
            if (reportedModel) {
              state.modelName = reportedModel;
            }

            var reportedDevice = normalizeText(resp && (resp.device_name || resp.deviceName || ''));
            if (reportedDevice) {
              state.deviceName = reportedDevice;
            }

            applyProfile();
          } catch (err) {
            console.warn(TAG, 'Failed to apply service response:', err);
          }
        },
        function onFailure(_err) {
          // Keep runtime-detected profile; service can be unavailable on emulator/browser.
        }
      );
    } catch (_err) {
      // best effort
    }
  }

  hydrateFromRuntime();
  hydrateFromSystemService();

  window.compatProfile = {
    getProfile: function () {
      return Object.assign({}, window.__smcCompat || state);
    },
    is2020Plus: function () {
      var p = window.__smcCompat || state;
      return p.releaseYear != null && p.releaseYear >= 2020;
    },
  };
})();
