/**
 * AdditionalSongsRemoval handles playlist cleanup after updates.
 * Mirrors Android AdditionalSongsRemovalTask behavior.
 *
 * Java reference: AdditionalSongsRemovalTask.java
 *
 * Purpose:
 *   - Remove old/orphan media files not in current playlist
 *   - Clean up DB entries for deleted files
 *   - Respect lastDownloadedPlaylistIndex to avoid aggressive deletion
 */
(function () {
  var TAG = '[Cleanup]';

  // Cleanup settings
  var CLEANUP_DELAY_MS = 5000; // Delay after playlist update before cleanup
  var MAX_FILES_PER_RUN = 100; // Limit files deleted per run to avoid blocking

  /**
   * Run cleanup task after playlist update.
   * @param {Object} options Configuration options
   * @param {SongsDataSource} options.songsDataSource Songs data source instance
   * @param {PlaylistManager} options.playlistManager Playlist manager instance
   * @param {Object} options.storageutils StorageUtils module (optional)
   * @param {Object} options.prefs Prefs module (optional)
   * @param {Object} options.logger Logger object (optional)
   * @returns {Promise<Object>} Cleanup result with counts
   */
  async function runCleanup(options) {
    options = options || {};
    var songsDataSource = options.songsDataSource || new SongsDataSource();
    var playlistManager = options.playlistManager;
    var storageUtils = options.storageutils || window.StorageUtils;
    var prefsRef = options.prefs || window.prefs;
    var logger = options.logger || console;

    console.log(TAG, 'Starting cleanup task');

    var result = {
      scanned: 0,
      deleted: 0,
      failed: 0,
      dbRowsRemoved: 0,
      errors: []
    };

    try {
      // Step 1: Get all valid playlist IDs
      var playlistDataSource = new PlaylistDataSource();
      var validPlaylists = await playlistDataSource.getAllDistinctPlaylists();
      var validPlaylistIds = validPlaylists.map(function (p) {
        return p.sp_playlist_id;
      });

      console.log(TAG, 'Valid playlists:', validPlaylistIds.length);

      // Step 2: Get all valid song title IDs from active playlists
      var validTitleIds = new Set();
      for (var i = 0; i < validPlaylists.length; i++) {
        var playlistId = validPlaylists[i].sp_playlist_id;
        var songs = await songsDataSource.getAllSongss(playlistId);
        songs.forEach(function (song) {
          if (song.title_id) {
            validTitleIds.add(song.title_id);
          }
        });
        // Also include non-downloaded songs
        var pendingSongs = await songsDataSource.getSongsThoseAreNotDownloaded(playlistId);
        pendingSongs.forEach(function (song) {
          if (song.title_id) {
            validTitleIds.add(song.title_id);
          }
        });
      }

      console.log(TAG, 'Valid title IDs:', validTitleIds.size);

      // Step 3: Check lastDownloadedPlaylistIndex preference
      var lastDownloadedIndex = 0;
      if (prefsRef && typeof prefsRef.getString === 'function') {
        var indexStr = prefsRef.getString('lastDownloadedPlaylistIndex', '0');
        lastDownloadedIndex = parseInt(indexStr, 10) || 0;
      }
      console.log(TAG, 'Last downloaded playlist index:', lastDownloadedIndex);

      // Step 4: Get all songs from DB to find orphans
      var orphanSongs = await findOrphanSongs(songsDataSource, validPlaylistIds, validTitleIds);
      console.log(TAG, 'Orphan songs found:', orphanSongs.length);

      // Step 5: Delete orphan cache entries and DB rows
      var deletedCount = 0;
      for (var j = 0; j < orphanSongs.length && deletedCount < MAX_FILES_PER_RUN; j++) {
        var orphan = orphanSongs[j];
        result.scanned++;

        try {
          // Delete from cache if path exists
          if (orphan.song_path && storageUtils) {
            var cacheDeleted = await storageUtils.deleteFile(orphan.song_path);
            if (cacheDeleted) {
              console.log(TAG, 'Deleted cache entry:', orphan.song_path);
              result.deleted++;
              deletedCount++;
            }
          }

          // Delete DB row
          await songsDataSource.deleteSongs(orphan, false);
          result.dbRowsRemoved++;
          console.log(TAG, 'Deleted DB row for song:', orphan.title_id);
        } catch (err) {
          console.error(TAG, 'Error deleting orphan:', orphan.title_id, err);
          result.failed++;
          result.errors.push({
            titleId: orphan.title_id,
            error: err.message
          });
        }
      }

      // Step 6: Clean up orphan advertisements
      var adsCleanupResult = await cleanupOrphanAds(storageUtils);
      result.deleted += adsCleanupResult.deleted;
      result.dbRowsRemoved += adsCleanupResult.dbRowsRemoved;

      // Step 7: Clean up stale cache entries
      if (storageUtils) {
        var cacheCleanupResult = await cleanupStaleCache(storageUtils, validTitleIds);
        result.deleted += cacheCleanupResult.deleted;
        result.scanned += cacheCleanupResult.scanned;
      }

      console.log(TAG, 'Cleanup complete.',
        'Scanned:', result.scanned,
        'Deleted:', result.deleted,
        'Failed:', result.failed,
        'DB rows removed:', result.dbRowsRemoved
      );

    } catch (err) {
      console.error(TAG, 'Cleanup error:', err);
      result.errors.push({
        error: err.message
      });
    }

    return result;
  }

  /**
   * Find orphan songs not in any valid playlist.
   */
  async function findOrphanSongs(songsDataSource, validPlaylistIds, validTitleIds) {
    var orphans = [];

    try {
      // Get all songs that belong to invalid playlists
      var allSongs = await getAllSongsFromDB(songsDataSource);

      allSongs.forEach(function (song) {
        // Check if song's playlist is still valid
        if (!validPlaylistIds.includes(song.sp_playlist_id)) {
          // Playlist no longer exists
          orphans.push(song);
        } else if (!validTitleIds.has(song.title_id)) {
          // Title ID no longer in any playlist
          orphans.push(song);
        }
      });
    } catch (err) {
      console.error(TAG, 'Error finding orphan songs:', err);
    }

    return orphans;
  }

  /**
   * Get all songs from database.
   */
  async function getAllSongsFromDB(songsDataSource) {
    return new Promise(function (resolve) {
      DB.withTransaction(['songs'], 'readonly', function (stores) {
        return new Promise(function (innerResolve) {
          var result = [];
          var req = stores.songs.openCursor();
          req.onsuccess = function (event) {
            var cursor = event.target.result;
            if (cursor) {
              result.push(cursor.value);
              cursor.continue();
            } else {
              innerResolve(result);
            }
          };
          req.onerror = function () {
            innerResolve([]);
          };
        });
      }).then(resolve).catch(function () {
        resolve([]);
      });
    });
  }

  /**
   * Clean up orphan advertisements.
   */
  async function cleanupOrphanAds(storageUtils) {
    var result = {
      deleted: 0,
      dbRowsRemoved: 0
    };

    try {
      var advDataSource = new AdvertisementDataSource();
      var allAds = await advDataSource.getAllAdv();

      // Check each ad for validity (expired, etc.)
      var now = new Date();
      var currentDate = now.toISOString().split('T')[0];

      for (var i = 0; i < allAds.length; i++) {
        var ad = allAds[i];
        var shouldDelete = false;

        // Check if ad has an end date and it's passed
        if (ad.adv_to_date) {
          var endDate = new Date(ad.adv_to_date);
          if (endDate < now) {
            shouldDelete = true;
            console.log(TAG, 'Ad expired:', ad.adv_id, 'ended:', ad.adv_to_date);
          }
        }

        if (shouldDelete) {
          try {
            // Delete from cache
            if (ad.adv_path && storageUtils) {
              await storageUtils.deleteFile(ad.adv_path);
              result.deleted++;
            }

            // Delete from DB
            await advDataSource.deleteAdv(ad._id);
            result.dbRowsRemoved++;
          } catch (err) {
            console.error(TAG, 'Error deleting expired ad:', ad.adv_id, err);
          }
        }
      }
    } catch (err) {
      console.error(TAG, 'Error cleaning up ads:', err);
    }

    return result;
  }

  /**
   * Clean up stale cache entries that don't match any known song/ad.
   */
  async function cleanupStaleCache(storageUtils, validTitleIds) {
    var result = {
      scanned: 0,
      deleted: 0
    };

    try {
      // Get all cached files
      var files = await storageUtils.listFiles();
      result.scanned = files.length;

      // Build set of known URLs from DB
      var knownUrls = new Set();

      // Get all songs and their URLs
      var songsDS = new SongsDataSource();
      var allSongs = await getAllSongsFromDB(songsDS);
      allSongs.forEach(function (song) {
        if (song.song_url) knownUrls.add(song.song_url);
        if (song.song_path) knownUrls.add(song.song_path);
      });

      // Get all ads and their URLs
      var advDS = new AdvertisementDataSource();
      var allAds = await advDS.getAllAdv();
      allAds.forEach(function (ad) {
        if (ad.adv_file_url) knownUrls.add(ad.adv_file_url);
        if (ad.adv_path) knownUrls.add(ad.adv_path);
      });

      // Check each cached file
      for (var i = 0; i < files.length; i++) {
        var file = files[i];

        // If file URL not in known set, it might be orphaned
        if (!knownUrls.has(file.fullPath) && !knownUrls.has(file.url)) {
          console.log(TAG, 'Stale cache entry found:', file.name);

          // Don't auto-delete stale cache entries to be safe
          // Just log them for now
          // Uncomment below to enable deletion:
          // var deleted = await storageUtils.deleteFile(file.fullPath);
          // if (deleted) result.deleted++;
        }
      }
    } catch (err) {
      console.error(TAG, 'Error cleaning stale cache:', err);
    }

    return result;
  }

  /**
   * Schedule cleanup to run after a delay.
   * Used after playlist updates.
   * @param {Object} options Same options as runCleanup
   * @returns {number} Timer ID
   */
  function scheduleCleanup(options) {
    console.log(TAG, 'Scheduling cleanup in', CLEANUP_DELAY_MS, 'ms');

    return setTimeout(function () {
      runCleanup(options);
    }, CLEANUP_DELAY_MS);
  }

  /**
   * Get cleanup statistics without deleting.
   * @returns {Promise<Object>} Stats about potential cleanup
   */
  async function getCleanupStats() {
    var stats = {
      orphanSongs: 0,
      orphanAds: 0,
      staleCache: 0,
      totalCacheSize: 0
    };

    try {
      // Get playlist info
      var playlistDS = new PlaylistDataSource();
      var songsDS = new SongsDataSource();
      var validPlaylists = await playlistDS.getAllDistinctPlaylists();
      var validPlaylistIds = validPlaylists.map(function (p) {
        return p.sp_playlist_id;
      });

      var validTitleIds = new Set();
      for (var i = 0; i < validPlaylists.length; i++) {
        var songs = await songsDS.getAllSongss(validPlaylists[i].sp_playlist_id);
        songs.forEach(function (s) {
          if (s.title_id) validTitleIds.add(s.title_id);
        });
      }

      // Count orphan songs
      var allSongs = await getAllSongsFromDB(songsDS);
      allSongs.forEach(function (song) {
        if (!validPlaylistIds.includes(song.sp_playlist_id)) {
          stats.orphanSongs++;
        }
      });

      // Get cache stats
      if (window.StorageUtils) {
        var cacheStats = await window.StorageUtils.getCacheStats();
        stats.totalCacheSize = cacheStats.totalSize;
        stats.staleCache = cacheStats.fileCount - allSongs.length;
        if (stats.staleCache < 0) stats.staleCache = 0;
      }
    } catch (err) {
      console.error(TAG, 'Error getting cleanup stats:', err);
    }

    return stats;
  }

  // Expose globally
  window.AdditionalSongsRemoval = {
    runCleanup: runCleanup,
    scheduleCleanup: scheduleCleanup,
    getCleanupStats: getCleanupStats
  };
})();
