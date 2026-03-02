/**
 * PlaylistWatcher monitors the current playlist schedule and emits
 * notifications when the active playlist changes.  It polls the
 * PlaylistManager at a regular interval to determine which
 * playlist (if any) should be playing at the current time.  When
 * the active playlist switches this watcher notifies its listener
 * via `onPlaylistStatusChanged` with one of the constants
 * `NO_PLAYLIST`, `PLAYLIST_PRESENT` or `PLAYLIST_CHANGE`.
 *
 * A simplified port of the Android `PlaylistWatcher` class.  It
 * does not handle advertisements, status updates or reboot logic.
 */
(function () {
  class PlaylistWatcher {
    /**
     * @param {PlaylistManager} manager An instance of PlaylistManager
     *   used to query the local database.
     * @param {Object} listener An optional listener with
     *   `onPlaylistStatusChanged(status, playlist)` callback.
     */
    constructor(manager, listener) {
      this.manager = manager;
      this.listener = listener || null;
      this.intervalId = null;
      this.currentPlaylistId = null;
    }

    /**
     * Determine the active playlist based on the current time and
     * update state accordingly.  If a change is detected the
     * listener's callback is invoked.
     */
    async check() {
      var active = null;

      // Primary source: PlaylistManager compatibility helper (handles 1900-based schedule windows).
      if (this.manager && typeof this.manager.getPlaylistForCurrentTimeOnly === 'function') {
        var activeList = this.manager.getPlaylistForCurrentTimeOnly();
        if (Array.isArray(activeList) && activeList.length > 0) {
          active = activeList[0];
        }
      }

      // Fallback for older manager implementations.
      if (!active && this.manager && typeof this.manager.getPlaylistsForCurrentAndComingTime === 'function') {
        var now = Date.now();
        var playlists = await this.manager.getPlaylistsForCurrentAndComingTime();
        if (Array.isArray(playlists)) {
          for (var i = 0; i < playlists.length; i++) {
            var pl = playlists[i] || {};
            if (Number(pl.startTimeInMilli || 0) <= now && Number(pl.endTimeInMilli || 0) > now) {
              active = pl;
              break;
            }
          }
        }
      }

      var status;
      if (!active) {
        status = PlaylistWatcher.NO_PLAYLIST;
        this.currentPlaylistId = null;
        if (this.listener && typeof this.listener.onPlaylistStatusChanged === 'function') {
          this.listener.onPlaylistStatusChanged(status, null);
        }
        return;
      }

      // There is an active playlist
      if (this.currentPlaylistId === null) {
        status = PlaylistWatcher.PLAYLIST_PRESENT;
        this.currentPlaylistId = active.sp_playlist_id;
        if (this.listener && typeof this.listener.onPlaylistStatusChanged === 'function') {
          this.listener.onPlaylistStatusChanged(status, active);
        }
      } else if (this.currentPlaylistId !== active.sp_playlist_id) {
        status = PlaylistWatcher.PLAYLIST_CHANGE;
        this.currentPlaylistId = active.sp_playlist_id;
        if (this.listener && typeof this.listener.onPlaylistStatusChanged === 'function') {
          this.listener.onPlaylistStatusChanged(status, active);
        }
      } else {
        status = PlaylistWatcher.PLAYLIST_PRESENT;
      }
    }

    /**
     * Start polling the playlist schedule every `intervalMs`
     * milliseconds.  The first check is performed immediately.
     */
    start(intervalMs = 10000) {
      this.stop();
      // Run immediately then schedule
      this.check().catch((err) => console.error(err));
      this.intervalId = setInterval(() => {
        this.check().catch((err) => console.error(err));
      }, intervalMs);
    }

    /**
     * Stop polling.
     */
    stop() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }
  }

  // Status constants mirror those defined in the Android class
  PlaylistWatcher.NO_PLAYLIST = 0;
  PlaylistWatcher.PLAYLIST_PRESENT = 1;
  PlaylistWatcher.PLAYLIST_CHANGE = 2;

  window.PlaylistWatcher = PlaylistWatcher;
})();