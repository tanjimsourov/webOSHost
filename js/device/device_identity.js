/**
 * Device identity provider for webOS signage.
 *
 * Strategy:
 * 1) Reuse a previously persisted identity if present.
 * 2) Try platform-provided identifiers (PalmSystem/webOS globals).
 * 3) As a last resort, generate a stable random ID once and persist it.
 *
 * The returned identity is deterministic across restarts unless local
 * storage/preferences are intentionally cleared.
 */
(function () {
  var LEGACY_KEY = 'smc_device_uuid';
  var STORAGE_KEY = 'smc_device_identity_v2';
  var GENERATED_KEY = 'smc_generated_device_id_v2';

  var cachedIdentity = null;
  var initPromise = null;

  function sanitize(value) {
    if (value == null) return '';
    var out = String(value).trim();
    if (!out) return '';
    var lower = out.toLowerCase();
    if (lower === 'unknown' || lower === 'null' || lower === 'undefined') return '';
    if (lower === '00:00:00:00:00:00' || lower === '00-00-00-00-00-00') return '';
    return out;
  }

  function generateRandomSuffix() {
    try {
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(8);
        window.crypto.getRandomValues(bytes);
        var out = '';
        for (var i = 0; i < bytes.length; i++) {
          out += bytes[i].toString(16).padStart(2, '0');
        }
        return out;
      }
    } catch (e) {
      // ignore
    }
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function getOrCreateGeneratedId() {
    var persisted = sanitize(localStorage.getItem(GENERATED_KEY));
    if (persisted) return persisted;

    var legacy = sanitize(localStorage.getItem(LEGACY_KEY));
    var base = legacy || generateRandomSuffix();
    var generated = 'webos-' + base;
    localStorage.setItem(GENERATED_KEY, generated);
    return generated;
  }

  function readPersistedIdentity() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      var deviceId = sanitize(parsed.deviceId);
      if (!deviceId) return null;
      return {
        deviceId: deviceId,
        macAddress: sanitize(parsed.macAddress),
        macAddressAlt: sanitize(parsed.macAddressAlt),
        serialNumber: sanitize(parsed.serialNumber)
      };
    } catch (e) {
      return null;
    }
  }

  function persistIdentity(identity) {
    var deviceId = sanitize(identity && identity.deviceId);
    if (!deviceId) return null;

    var normalized = {
      deviceId: deviceId,
      macAddress: sanitize(identity && identity.macAddress),
      macAddressAlt: sanitize(identity && identity.macAddressAlt),
      serialNumber: sanitize(identity && identity.serialNumber)
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (e) {
      // ignore
    }

    if (window.prefs && typeof prefs.setDeviceId === 'function') {
      try {
        prefs.setDeviceId(deviceId);
      } catch (e2) {
        // ignore
      }
    }

    cachedIdentity = normalized;
    return normalized;
  }

  function collectGlobalCandidates() {
    var candidates = [];

    var prefId = '';
    if (window.prefs && typeof prefs.getDeviceId === 'function') {
      prefId = sanitize(prefs.getDeviceId());
    }
    if (prefId) {
      candidates.push({
        deviceId: prefId,
        serialNumber: prefId
      });
    }

    var persisted = readPersistedIdentity();
    if (persisted) {
      candidates.push(persisted);
    }

    try {
      if (window.PalmSystem && window.PalmSystem.deviceInfo) {
        var info = window.PalmSystem.deviceInfo;
        if (typeof info === 'string') {
          try {
            info = JSON.parse(info);
          } catch (e1) {
            info = {};
          }
        }
        if (info && typeof info === 'object') {
          var serial = sanitize(
            info.serialNumber || info.serial_number || info.ndu_id || info.modelName || info.deviceName
          );
          if (serial) {
            candidates.push({
              deviceId: serial,
              serialNumber: serial,
              macAddress: sanitize(info.wifiMacAddress || info.macAddress || info.wiredMacAddress)
            });
          }
        }
      }
    } catch (e2) {
      // ignore
    }

    try {
      if (window.webOSSystem && window.webOSSystem.deviceInfo) {
        var info2 = window.webOSSystem.deviceInfo;
        var serial2 = sanitize(
          info2.serialNumber || info2.serial_number || info2.modelName || info2.deviceName
        );
        if (serial2) {
          candidates.push({
            deviceId: serial2,
            serialNumber: serial2,
            macAddress: sanitize(info2.macAddress || info2.wifiMacAddress)
          });
        }
      }
    } catch (e3) {
      // ignore
    }

    return candidates;
  }

  function chooseBestIdentity(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i] || {};
      var deviceId = sanitize(c.deviceId || c.serialNumber || c.macAddress || c.macAddressAlt);
      if (!deviceId) continue;
      return {
        deviceId: deviceId,
        macAddress: sanitize(c.macAddress),
        macAddressAlt: sanitize(c.macAddressAlt),
        serialNumber: sanitize(c.serialNumber || deviceId)
      };
    }

    var generated = getOrCreateGeneratedId();
    return {
      deviceId: generated,
      macAddress: '',
      macAddressAlt: '',
      serialNumber: generated
    };
  }

  function queryWebOSSystemInfo() {
    return new Promise(function (resolve) {
      try {
        if (!window.webosBridge || typeof window.webosBridge.call !== 'function') {
          resolve(null);
          return;
        }

        window.webosBridge.call(
          'luna://com.webos.service.tv.systemproperty',
          'getSystemInfo',
          {
            keys: ['serial_number', 'model_name', 'device_name']
          },
          function (resp) {
            resolve(resp || null);
          },
          function () {
            resolve(null);
          }
        );
      } catch (e) {
        resolve(null);
      }
    });
  }

  function normalizeResponseIdentity(resp) {
    if (!resp || typeof resp !== 'object') return null;

    var serial = sanitize(
      resp.serial_number || resp.serialNumber || resp.model_name || resp.modelName || resp.device_name
    );
    if (!serial) return null;

    return {
      deviceId: serial,
      serialNumber: serial,
      macAddress: sanitize(resp.wifi_mac || resp.macAddress || resp.wifiMacAddress),
      macAddressAlt: sanitize(resp.wired_mac || resp.macAddress2 || resp.wiredMacAddress)
    };
  }

  function resolveIdentitySync() {
    if (cachedIdentity) return cachedIdentity;
    var selected = chooseBestIdentity(collectGlobalCandidates());
    return persistIdentity(selected) || selected;
  }

  function init() {
    if (initPromise) return initPromise;

    initPromise = Promise.resolve()
      .then(function () {
        var base = resolveIdentitySync();
        return queryWebOSSystemInfo().then(function (resp) {
          var platformIdentity = normalizeResponseIdentity(resp);
          if (platformIdentity) {
            var merged = {
              deviceId: platformIdentity.deviceId,
              serialNumber: platformIdentity.serialNumber || platformIdentity.deviceId,
              macAddress: platformIdentity.macAddress || base.macAddress,
              macAddressAlt: platformIdentity.macAddressAlt || base.macAddressAlt
            };
            return persistIdentity(merged) || merged;
          }
          return base;
        });
      })
      .catch(function () {
        return resolveIdentitySync();
      });

    return initPromise;
  }

  window.deviceIdentity = {
    init: init,
    getDeviceIdentity: function () {
      return resolveIdentitySync();
    },
    getStableDeviceId: function () {
      var identity = resolveIdentitySync();
      return identity.deviceId;
    }
  };
})();
