/**
 * IndexedDB helper for the Smc Signage webOS port.  This module
 * encapsulates the boilerplate required to open a database, create
 * object stores and perform simple CRUD operations.  The store names
 * and key paths mirror the SQLite tables defined in the original
 * Android project (`MySQLiteHelper`).  All columns are stored as
 * properties on the record objects without renaming—column names are
 * preserved verbatim to ensure parity with the Java code.
 *
 * The database is versioned so that future schema changes (such as
 * adding indices or additional stores) can be managed through the
 * `onupgradeneeded` hook.  Increasing `DB_VERSION` will cause
 * browsers to run the upgrade callback automatically.
 */
(function () {
  const DB_NAME = 'smc_signage_db';
  const DB_VERSION = 2; // Incremented for status_queue store
  const STORE_DEFINITIONS = {
    playlist: { keyPath: '_id', autoIncrement: true },
    songs: { keyPath: '_id', autoIncrement: true },
    prayer: { keyPath: '_id', autoIncrement: true },
    advertisement: { keyPath: '_id', autoIncrement: true },
    table_player_status: { keyPath: '_id', autoIncrement: true },
    status_queue: { keyPath: '_id', autoIncrement: true }, // Offline status queue for S5-R2
  };

  /**
   * Open (or create) the IndexedDB database.  Returns a promise
   * resolving with the database instance.  Store creation is handled
   * during the `onupgradeneeded` event by iterating over
   * `STORE_DEFINITIONS`.  Additional indices can be added here if
   * queries require them (for example on `sch_id` or `spl_playlist_id`).
   */
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Create stores if they do not exist.  Column names are not
        // explicitly declared—the entire record is stored as a value.
        Object.keys(STORE_DEFINITIONS).forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const opts = STORE_DEFINITIONS[storeName];
            const store = db.createObjectStore(storeName, opts);
            // Create generic indices for commonly queried fields
            // Note: indices are not unique unless specified
            if (storeName === 'playlist') {
              store.createIndex('sch_id_idx', 'sch_id', { unique: false });
              store.createIndex('sp_playlist_id_idx', 'sp_playlist_id', { unique: false });
              store.createIndex('startTimeInMilli_idx', 'startTimeInMilli', { unique: false });
              store.createIndex('endTimeInMilli_idx', 'endTimeInMilli', { unique: false });
            }
            if (storeName === 'songs') {
              store.createIndex('splPlaylist_idx', 'sp_playlist_id', { unique: false });
              store.createIndex('is_downloaded_idx', 'is_downloaded', { unique: false });
              store.createIndex('title_id_idx', 'title_id', { unique: false });
            }
            if (storeName === 'table_player_status') {
              store.createIndex('player_status_type_idx', 'is_player_status_type', { unique: false });
            }
            if (storeName === 'status_queue') {
              store.createIndex('status_type_idx', 'type', { unique: false });
              store.createIndex('timestamp_idx', 'timestamp', { unique: false });
            }
          }
        });
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Utility to run a transaction on one or more stores.  Accepts a
   * callback that receives the objectStore instances.  The callback
   * should return a promise or value which resolves when its work is
   * complete.  The surrounding transaction will auto‐commit on
   * successful completion or abort if an exception is thrown.
   *
   * @param {string[]} storeNames Names of stores involved in the transaction.
   * @param {'readonly'|'readwrite'} mode Transaction mode.
   * @param {function(ObjectStoreMap):Promise<any>} callback Function that
   *        performs operations on the object stores.  It receives a map
   *        keyed by store name.
   */
  async function withTransaction(storeNames, mode, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const stores = {};
      storeNames.forEach((name) => {
        stores[name] = tx.objectStore(name);
      });
      let result;
      try {
        result = callback(stores);
      } catch (err) {
        tx.abort();
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  /**
   * Retrieve a count of records in each store.  Useful for debugging
   * and inspecting the state of the local database.  Returns an
   * object whose keys are store names and values are counts.
   */
  async function getRowCounts() {
    const db = await open();
    const counts = {};
    const storeNames = Array.from(db.objectStoreNames);
    await Promise.all(storeNames.map((name) => {
      return new Promise((resolve) => {
        const tx = db.transaction(name, 'readonly');
        const store = tx.objectStore(name);
        const countReq = store.count();
        countReq.onsuccess = () => {
          counts[name] = countReq.result;
          resolve();
        };
        countReq.onerror = () => {
          counts[name] = 0;
          resolve();
        };
      });
    }));
    return counts;
  }

  /**
   * Clear all data from every store.  This should only be used during
   * development or when the user explicitly requests to reset the
   * application state.  Prompts the user for confirmation if run in
   * a browser context.
   */
  async function clearAll() {
    const confirmClear = typeof window !== 'undefined' ? window.confirm : () => true;
    if (!confirmClear('Are you sure you want to clear all cached data?')) {
      return false;
    }
    const db = await open();
    await Promise.all(Array.from(db.objectStoreNames).map((name) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        const store = tx.objectStore(name);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }));
    return true;
  }

  // Expose helpers globally so that DataSource modules can reuse them
  window.DB = {
    open,
    withTransaction,
    getRowCounts,
    clearAll,
    STORE_DEFINITIONS,
  };
})();