/**
 * Security Manager - Data encryption and protection
 * Based on Java security patterns from JAVA_ANALYSIS_DOCUMENT.md.
 *
 * Notes:
 * - This uses a lightweight base64 wrapper for obfuscation.
 * - Replace with a stronger crypto strategy when you can manage keys.
 * - Designed to be backward compatible with existing prefs/localStorage.
 */
(function () {
  'use strict';

  const TAG = '[SECURITY]';
  const ENCRYPTION_PREFIX = 'smc_secure_';
  const KEY_PREFIX = 'secure_';

  function safeJsonParse(maybeJson) {
    try {
      return JSON.parse(maybeJson);
    } catch (e) {
      return null;
    }
  }

  function encrypt(data) {
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      // Prefix helps validate payload format after decoding
      return btoa(ENCRYPTION_PREFIX + dataStr);
    } catch (err) {
      console.error(TAG, 'Encryption failed:', err);
      return null;
    }
  }

  function decrypt(encryptedData) {
    try {
      const decoded = atob(encryptedData);
      if (!decoded.startsWith(ENCRYPTION_PREFIX)) {
        throw new Error('Invalid encrypted data format');
      }
      const raw = decoded.substring(ENCRYPTION_PREFIX.length);
      // Try JSON parse; if not JSON return raw string
      const parsed = safeJsonParse(raw);
      return parsed !== null ? parsed : raw;
    } catch (err) {
      console.error(TAG, 'Decryption failed:', err);
      return null;
    }
  }

  function setSecureItem(key, value) {
    try {
      const encrypted = encrypt(value);
      if (encrypted) {
        localStorage.setItem(KEY_PREFIX + key, encrypted);
        return true;
      }
    } catch (err) {
      console.error(TAG, 'Failed to set secure item:', err);
    }
    return false;
  }

  function getSecureItem(key) {
    try {
      const encrypted = localStorage.getItem(KEY_PREFIX + key);
      return encrypted ? decrypt(encrypted) : null;
    } catch (err) {
      console.error(TAG, 'Failed to get secure item:', err);
      return null;
    }
  }

  // Basic validation (mirrors Java flow: token + deviceId checks)
  function validateToken(token) {
    if (!token || typeof token !== 'string') return false;
    const t = token.trim();
    return t.length >= 8 && t.length <= 50;
  }

  function validateDeviceId(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') return false;
    const d = deviceId.trim();
    return d.length >= 8 && d.length <= 120;
  }

  // Public API
  window.SecurityManager = {
    encrypt,
    decrypt,
    setSecureItem,
    getSecureItem,
    validateToken,
    validateDeviceId
  };
})();
