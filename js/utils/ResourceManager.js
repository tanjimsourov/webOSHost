/**
 * ResourceManager - Performance utilities.
 *
 * Implements:
 * - Lightweight LRU cache for JSON resources
 * - Optional preloading of upcoming playlist items
 * - Cache trimming on age and approximate size
 *
 * Based on Java analysis: LRU cache for media, memory management and
 * background-friendly operations.
 */
(function () {
  'use strict';

  const TAG = '[RESOURCE_MANAGER]';
  const CACHE_SIZE_LIMIT = 50; // max items
  const MAX_BYTES = 50 * 1024 * 1024; // 50MB approx
  const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
  const MEMORY_CHECK_INTERVAL = 30 * 1000;

  /** @type {Map<string, {resource:any, ts:number, size:number}>} */
  const cache = new Map();
  let totalBytes = 0;

  function estimateSize(value) {
    try {
      return JSON.stringify(value).length;
    } catch (e) {
      return 1024;
    }
  }

  function touch(key, entry) {
    // Move entry to back of map to represent recent use
    cache.delete(key);
    entry.ts = Date.now();
    cache.set(key, entry);
  }

  function trimOld() {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now - entry.ts > MAX_AGE_MS) {
        cache.delete(key);
        totalBytes -= entry.size;
      }
    }
  }

  function trimLRU() {
    while (cache.size > CACHE_SIZE_LIMIT) {
      const oldestKey = cache.keys().next().value;
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      if (oldest) totalBytes -= oldest.size;
    }
  }

  function trimForMemory() {
    // Trim on age first, then LRU
    trimOld();
    while (totalBytes > MAX_BYTES && cache.size > 0) {
      const oldestKey = cache.keys().next().value;
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      if (oldest) totalBytes -= oldest.size;
    }
    trimLRU();
  }

  function cacheResource(key, resource) {
    try {
      const size = estimateSize(resource);
      if (cache.has(key)) {
        const prev = cache.get(key);
        if (prev) totalBytes -= prev.size;
        cache.delete(key);
      }
      cache.set(key, { resource, ts: Date.now(), size });
      totalBytes += size;
      trimForMemory();
    } catch (err) {
      console.warn(TAG, 'cacheResource failed', err);
    }
  }

  function getCachedResource(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    touch(key, entry);
    return entry.resource;
  }

  function clear() {
    cache.clear();
    totalBytes = 0;
  }

  /**
   * Preload basic JSON resources.
   * If playlist items include `id` and `url`, this will attempt to fetch
   * and cache their payload.
   */
  function preloadNextItems(currentIndex, playlist, count = 3) {
    try {
      if (!Array.isArray(playlist)) return;
      const slice = playlist.slice(currentIndex + 1, currentIndex + 1 + count);
      slice.forEach((item) => {
        if (!item) return;
        const key = item.id || item.url;
        if (!key || getCachedResource(key)) return;
        if (!item.url || typeof item.url !== 'string') return;
        fetch(item.url)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data) cacheResource(key, data);
          })
          .catch(() => {
            // silent
          });
      });
    } catch (err) {
      console.warn(TAG, 'preloadNextItems failed', err);
    }
  }

  // Periodic monitoring
  setInterval(function () {
    try {
      trimForMemory();
    } catch (e) {
      // ignore
    }
  }, MEMORY_CHECK_INTERVAL);

  window.ResourceManager = {
    cacheResource,
    getCachedResource,
    preloadNextItems,
    clear
  };
})();
