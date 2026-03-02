/**
 * StorageUtils provides file operations for cleanup and download routines.
 * Mirrors Android StorageUtils functionality using browser/webOS APIs.
 *
 * Uses Cache API as primary storage mechanism (same as download_manager.js).
 * Falls back to IndexedDB for file metadata tracking.
 *
 * Key functions:
 *   - ensureDir: Create directory path (no-op for Cache API)
 *   - listFiles: List files in a path
 *   - deleteFile: Delete a file
 *   - exists: Check if file exists
 *   - getMediaRoot: Get base media directory path
 */
(function () {
  var TAG = '[StorageUtils]';

  // Cache name used by download_manager.js
  var CACHE_NAME = 'downloads';

  // Media root path (virtual path for organization)
  var MEDIA_ROOT = '/media/smc';
  var SONGS_DIR = MEDIA_ROOT + '/songs';
  var ADS_DIR = MEDIA_ROOT + '/ads';

  // File metadata store name for IndexedDB
  var FILE_METADATA_STORE = 'file_metadata';

  /**
   * Get the media root directory path.
   * @returns {string} Media root path
   */
  function getMediaRoot() {
    return MEDIA_ROOT;
  }

  /**
   * Get the songs directory path.
   * @returns {string} Songs directory path
   */
  function getSongsDir() {
    return SONGS_DIR;
  }

  /**
   * Get the ads directory path.
   * @returns {string} Ads directory path
   */
  function getAdsDir() {
    return ADS_DIR;
  }

  /**
   * Ensure a directory exists. No-op for Cache API as it doesn't use directories.
   * @param {string} path Directory path to ensure
   * @returns {Promise<boolean>} Always resolves to true
   */
  async function ensureDir(path) {
    console.log(TAG, 'ensureDir:', path);
    // Cache API doesn't use directory structure, so this is a no-op
    return true;
  }

  /**
   * List all files in cache. Since Cache API doesn't have directories,
   * this returns all cached files optionally filtered by URL prefix.
   * @param {string} pathPrefix Optional URL prefix to filter by
   * @returns {Promise<Object[]>} Array of file info objects
   */
  async function listFiles(pathPrefix) {
    console.log(TAG, 'listFiles:', pathPrefix || '(all)');

    var files = [];

    try {
      var cache = await caches.open(CACHE_NAME);
      var requests = await cache.keys();

      for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        var url = request.url;

        // Apply prefix filter if provided
        if (pathPrefix && !url.includes(pathPrefix)) {
          continue;
        }

        // Get response to extract metadata
        var response = await cache.match(request);
        var size = 0;
        var modifiedAt = Date.now();

        if (response) {
          // Try to get size from headers or blob
          var contentLength = response.headers.get('Content-Length');
          if (contentLength) {
            size = parseInt(contentLength, 10);
          } else {
            try {
              var blob = await response.clone().blob();
              size = blob.size;
            } catch (e) {
              // Ignore blob errors
            }
          }

          // Try to get modification date
          var lastModified = response.headers.get('Last-Modified');
          if (lastModified) {
            modifiedAt = new Date(lastModified).getTime();
          }
        }

        // Extract filename from URL
        var name = extractFilename(url);

        files.push({
          name: name,
          fullPath: url,
          url: url,
          size: size,
          modifiedAt: modifiedAt
        });
      }

      console.log(TAG, 'listFiles found:', files.length, 'files');
    } catch (err) {
      console.error(TAG, 'listFiles error:', err);
    }

    return files;
  }

  /**
   * Delete a file from cache.
   * @param {string} fullPath Full URL/path of the file
   * @returns {Promise<boolean>} True if deleted, false otherwise
   */
  async function deleteFile(fullPath) {
    console.log(TAG, 'deleteFile:', fullPath);

    // Safety check: don't delete outside media context
    if (!isPathSafe(fullPath)) {
      console.error(TAG, 'Refusing to delete unsafe path:', fullPath);
      return false;
    }

    try {
      var cache = await caches.open(CACHE_NAME);
      var deleted = await cache.delete(fullPath);
      console.log(TAG, 'deleteFile', deleted ? 'SUCCESS' : 'NOT_FOUND', fullPath);
      return deleted;
    } catch (err) {
      console.error(TAG, 'deleteFile error:', err);
      return false;
    }
  }

  /**
   * Delete multiple files.
   * @param {string[]} paths Array of file paths to delete
   * @returns {Promise<Object>} Result with deleted and failed counts
   */
  async function deleteFiles(paths) {
    console.log(TAG, 'deleteFiles:', paths.length, 'files');

    var result = {
      deleted: 0,
      failed: 0,
      paths: []
    };

    for (var i = 0; i < paths.length; i++) {
      var deleted = await deleteFile(paths[i]);
      if (deleted) {
        result.deleted++;
        result.paths.push(paths[i]);
      } else {
        result.failed++;
      }
    }

    console.log(TAG, 'deleteFiles complete. Deleted:', result.deleted, 'Failed:', result.failed);
    return result;
  }

  /**
   * Delete a directory (all files with matching prefix).
   * @param {string} path Directory path/prefix
   * @param {Object} options Options (recursive is always true for Cache API)
   * @returns {Promise<number>} Number of files deleted
   */
  async function deleteDir(path, options) {
    console.log(TAG, 'deleteDir:', path);

    // Safety check
    if (!isPathSafe(path)) {
      console.error(TAG, 'Refusing to delete unsafe path:', path);
      return 0;
    }

    var files = await listFiles(path);
    var count = 0;

    for (var i = 0; i < files.length; i++) {
      var deleted = await deleteFile(files[i].fullPath);
      if (deleted) count++;
    }

    console.log(TAG, 'deleteDir deleted:', count, 'files');
    return count;
  }

  /**
   * Check if a file exists in cache.
   * @param {string} path File path/URL
   * @returns {Promise<boolean>} True if exists
   */
  async function exists(path) {
    try {
      var cache = await caches.open(CACHE_NAME);
      var response = await cache.match(path);
      return !!response;
    } catch (err) {
      console.error(TAG, 'exists error:', err);
      return false;
    }
  }

  /**
   * Get storage usage estimate.
   * @returns {Promise<Object>} Storage estimate with usage and quota
   */
  async function getStorageEstimate() {
    var estimate = {
      usage: 0,
      quota: 0,
      usageMB: 0,
      quotaMB: 0,
      freeSpace: 0,
      freeSpaceMB: 0
    };

    try {
      if (navigator.storage && navigator.storage.estimate) {
        var storageEstimate = await navigator.storage.estimate();
        estimate.usage = storageEstimate.usage || 0;
        estimate.quota = storageEstimate.quota || 0;
        estimate.usageMB = Math.round(estimate.usage / (1024 * 1024));
        estimate.quotaMB = Math.round(estimate.quota / (1024 * 1024));
        estimate.freeSpace = estimate.quota - estimate.usage;
        estimate.freeSpaceMB = Math.round(estimate.freeSpace / (1024 * 1024));
      }
    } catch (err) {
      console.error(TAG, 'getStorageEstimate error:', err);
    }

    return estimate;
  }

  /**
   * Extract filename from URL.
   * @param {string} url Full URL
   * @returns {string} Filename
   */
  function extractFilename(url) {
    try {
      var urlObj = new URL(url);
      var pathname = urlObj.pathname;
      var parts = pathname.split('/');
      return parts[parts.length - 1] || url;
    } catch (e) {
      // Fallback for non-URL paths
      var parts = url.split('/');
      return parts[parts.length - 1] || url;
    }
  }

  /**
   * Check if a path is safe to delete.
   * Prevents accidental deletion of system files.
   * @param {string} path Path to check
   * @returns {boolean} True if safe
   */
  function isPathSafe(path) {
    if (!path) return false;

    // Allow HTTP/HTTPS URLs (cached media)
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return true;
    }

    // Allow virtual media paths
    if (path.startsWith(MEDIA_ROOT)) {
      return true;
    }

    // Disallow everything else for safety
    return false;
  }

  /**
   * Normalize a filename by removing special characters.
   * Mirrors Android Utilities.removeSpecialCharacterFromFileName.
   * @param {string} name Filename to normalize
   * @returns {string} Normalized filename
   */
  function normalizeFileName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .replace(/ /g, '_')
      .replace(/\*/g, '')
      .replace(/'/g, '')
      .replace(/&/g, '')
      .replace(/-/g, '')
      .replace(/!/g, '')
      .replace(/\$/g, '')
      .replace(/#/g, '')
      .replace(/\^/g, '')
      .replace(/@/g, '');
  }

  /**
   * Clear all cached files.
   * @returns {Promise<boolean>} True if successful
   */
  async function clearAllCache() {
    console.log(TAG, 'clearAllCache');
    try {
      var deleted = await caches.delete(CACHE_NAME);
      console.log(TAG, 'clearAllCache', deleted ? 'SUCCESS' : 'NOT_FOUND');
      return deleted;
    } catch (err) {
      console.error(TAG, 'clearAllCache error:', err);
      return false;
    }
  }

  /**
   * Get cache statistics.
   * @returns {Promise<Object>} Cache stats
   */
  async function getCacheStats() {
    var files = await listFiles();
    var totalSize = 0;

    files.forEach(function (f) {
      totalSize += f.size || 0;
    });

    var estimate = await getStorageEstimate();

    return {
      fileCount: files.length,
      totalSize: totalSize,
      totalSizeMB: Math.round(totalSize / (1024 * 1024)),
      storageUsage: estimate.usage,
      storageQuota: estimate.quota,
      freeSpace: estimate.freeSpace
    };
  }

  // Expose globally
  window.StorageUtils = {
    getMediaRoot: getMediaRoot,
    getSongsDir: getSongsDir,
    getAdsDir: getAdsDir,
    ensureDir: ensureDir,
    listFiles: listFiles,
    deleteFile: deleteFile,
    deleteFiles: deleteFiles,
    deleteDir: deleteDir,
    exists: exists,
    getStorageEstimate: getStorageEstimate,
    extractFilename: extractFilename,
    normalizeFileName: normalizeFileName,
    clearAllCache: clearAllCache,
    getCacheStats: getCacheStats,
    isPathSafe: isPathSafe
  };
})();
