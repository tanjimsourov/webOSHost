/**
 * OfflineManager - Offline caching + sync queue.
 *
 * Mirrors the Java app behaviour:
 * - Graceful degradation when offline
 * - Queue write operations and flush when online
 *
 * This module does NOT change existing API structures. It only provides
 * helper utilities that controllers can opt into.
 */
(function () {
  'use strict';

  const TAG = '[OFFLINE_MANAGER]';
  const CACHE_PREFIX = 'offline_';
  const SYNC_QUEUE_KEY = 'sync_queue';
  let online = navigator.onLine;
  /** @type {Array<{url:string, options:any, ts:number}>} */
  let queue = [];

  function loadQueue() {
    try {
      const saved = localStorage.getItem(SYNC_QUEUE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) queue = parsed;
      }
    } catch (err) {
      console.warn(TAG, 'loadQueue failed', err);
      queue = [];
    }
  }

  function persistQueue() {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
      // ignore
    }
  }

  function cacheOfflineData(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
    } catch (err) {
      console.warn(TAG, 'cacheOfflineData failed', err);
    }
  }

  function getOfflineData(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed.data : null;
    } catch (err) {
      return null;
    }
  }

  function addToSyncQueue(url, options) {
    if (!url) return;
    queue.push({ url: String(url), options: options || {}, ts: Date.now() });
    persistQueue();
    if (online) processSyncQueue();
  }

  function processSyncQueue() {
    if (!online || queue.length === 0) return;
    const op = queue.shift();
    persistQueue();

    const doRequest = (window.DialogManager && window.DialogManager.secureRequest)
      ? window.DialogManager.secureRequest
      : function (u, o) { return fetch(u, o).then(r => r.json()); };

    doRequest(op.url, op.options)
      .then(function () {
        if (queue.length > 0) setTimeout(processSyncQueue, 500);
      })
      .catch(function (err) {
        console.warn(TAG, 'sync failed; will retry later', err);
        // Put back at the front for later retry
        queue.unshift(op);
        persistQueue();
      });
  }

  window.addEventListener('online', function () {
    online = true;
    processSyncQueue();
  });

  window.addEventListener('offline', function () {
    online = false;
  });

  loadQueue();

  window.OfflineManager = {
    cacheOfflineData,
    getOfflineData,
    addToSyncQueue,
    processSyncQueue,
    isOnline: function () { return online; }
  };
})();
