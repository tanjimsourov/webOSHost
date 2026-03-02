/**
 * PlaylistWatcher - Mirrors PlaylistWatcher.java functionality
 * Complete playlist monitoring and management system for webOS Signage
 */

class PlaylistWatcher {
    constructor(databaseManager, apiClient) {
        this.dbManager = databaseManager;
        this.apiClient = apiClient;
        this.TAG = 'PlaylistWatcher';
        
        // Watcher state
        this.isRunning = false;
        this.watchInterval = null;
        this.lastCheckTime = null;
        
        // Timing constants
        this.WATCH_INTERVAL = 60 * 1000; // 1 minute
        this.PLAYLIST_SWITCH_THRESHOLD = 5 * 1000; // 5 seconds before switch
        
        // Playlist state
        this.currentPlaylist = null;
        this.nextPlaylist = null;
        this.playlistHistory = [];
        this.switchCount = 0;
        
        // Event listeners
        this.eventListeners = {
            'playlistChanged': [],
            'playlistSwitched': [],
            'playlistExpired': [],
            'error': []
        };
    }

    /**
     * Start playlist watcher
     * Mirrors: PlaylistWatcher startup logic
     */
    async start() {
        try {
            console.log(`[${this.TAG}] Starting playlist watcher`);
            
            if (this.isRunning) {
                console.log(`[${this.TAG}] Playlist watcher already running`);
                return true;
            }
            
            // Initialize playlist state
            await this.initializePlaylistState();
            
            // Start watching interval
            this.startWatchingInterval();
            
            // Set running state
            this.isRunning = true;
            this.lastCheckTime = new Date();
            
            console.log(`[${this.TAG}] Playlist watcher started successfully`);
            return true;
        } catch (error) {
            this.handleError(error, 'start');
            throw error;
        }
    }

    /**
     * Stop playlist watcher
     */
    async stop() {
        try {
            console.log(`[${this.TAG}] Stopping playlist watcher`);
            
            if (!this.isRunning) {
                console.log(`[${this.TAG}] Playlist watcher not running`);
                return true;
            }
            
            // Clear interval
            this.clearWatchingInterval();
            
            // Set running state
            this.isRunning = false;
            
            console.log(`[${this.TAG}] Playlist watcher stopped`);
            return true;
        } catch (error) {
            this.handleError(error, 'stop');
            throw error;
        }
    }

    /**
     * Initialize playlist state
     */
    async initializePlaylistState() {
        try {
            console.log(`[${this.TAG}] Initializing playlist state`);
            
            // Get current active playlist
            this.currentPlaylist = await this.getCurrentActivePlaylist();
            
            // Get next playlist
            this.nextPlaylist = await this.getNextPlaylist();
            
            // Load playlist history
            await this.loadPlaylistHistory();
            
            console.log(`[${this.TAG}] Playlist state initialized`);
            console.log(`[${this.TAG}] Current playlist: ${this.currentPlaylist ? this.currentPlaylist.sp_name : 'None'}`);
            console.log(`[${this.TAG}] Next playlist: ${this.nextPlaylist ? this.nextPlaylist.sp_name : 'None'}`);
        } catch (error) {
            this.handleError(error, 'initializePlaylistState');
            throw error;
        }
    }

    /**
     * Start watching interval
     */
    startWatchingInterval() {
        try {
            console.log(`[${this.TAG}] Starting playlist watching interval`);
            
            this.watchInterval = setInterval(async () => {
                await this.checkPlaylistStatus();
            }, this.WATCH_INTERVAL);
            
            console.log(`[${this.TAG}] Playlist watching interval started`);
        } catch (error) {
            this.handleError(error, 'startWatchingInterval');
            throw error;
        }
    }

    /**
     * Clear watching interval
     */
    clearWatchingInterval() {
        try {
            console.log(`[${this.TAG}] Clearing playlist watching interval`);
            
            if (this.watchInterval) {
                clearInterval(this.watchInterval);
                this.watchInterval = null;
            }
            
            console.log(`[${this.TAG}] Playlist watching interval cleared`);
        } catch (error) {
            this.handleError(error, 'clearWatchingInterval');
            throw error;
        }
    }

    /**
     * Check playlist status
     * Mirrors: PlaylistWatcher main checking logic
     */
    async checkPlaylistStatus() {
        try {
            console.log(`[${this.TAG}] Checking playlist status`);
            
            const checkStartTime = new Date();
            
            // Get current active playlist
            const activePlaylist = await this.getCurrentActivePlaylist();
            
            // Check if playlist has changed
            if (this.hasPlaylistChanged(activePlaylist)) {
                await this.handlePlaylistChange(activePlaylist);
            }
            
            // Check for upcoming playlist switch
            await this.checkUpcomingSwitch();
            
            // Check for expired playlists
            await this.checkExpiredPlaylists();
            
            // Update last check time
            this.lastCheckTime = checkStartTime;
            
            console.log(`[${this.TAG}] Playlist status check completed`);
        } catch (error) {
            this.handleError(error, 'checkPlaylistStatus');
            throw error;
        }
    }

    /**
     * Get current active playlist
     */
    async getCurrentActivePlaylist() {
        try {
            const playlistDAO = this.dbManager.getDAO('playlistDAO');
            if (!playlistDAO) {
                console.warn(`[${this.TAG}] Playlist DAO not available`);
                return null;
            }
            
            const activePlaylist = await playlistDAO.getCurrentActivePlaylist();
            return activePlaylist;
        } catch (error) {
            console.error(`[${this.TAG}] Error getting current active playlist:`, error);
            return null;
        }
    }

    /**
     * Get next playlist
     */
    async getNextPlaylist() {
        try {
            const playlistDAO = this.dbManager.getDAO('playlistDAO');
            if (!playlistDAO) {
                console.warn(`[${this.TAG}] Playlist DAO not available`);
                return null;
            }
            
            const nextPlaylist = await playlistDAO.getNextPlaylist();
            return nextPlaylist;
        } catch (error) {
            console.error(`[${this.TAG}] Error getting next playlist:`, error);
            return null;
        }
    }

    /**
     * Check if playlist has changed
     */
    hasPlaylistChanged(newPlaylist) {
        if (!this.currentPlaylist && !newPlaylist) {
            return false; // Both null, no change
        }
        
        if (!this.currentPlaylist || !newPlaylist) {
            return true; // One is null, changed
        }
        
        // Compare playlist IDs
        return this.currentPlaylist.sp_playlist_id !== newPlaylist.sp_playlist_id;
    }

    /**
     * Handle playlist change
     */
    async handlePlaylistChange(newPlaylist) {
        try {
            console.log(`[${this.TAG}] Handling playlist change`);
            
            const oldPlaylist = this.currentPlaylist;
            this.currentPlaylist = newPlaylist;
            
            // Update playlist history
            if (oldPlaylist) {
                this.playlistHistory.push({
                    playlist: oldPlaylist,
                    switchTime: new Date(),
                    reason: 'expired'
                });
                
                // Keep only last 10 entries
                if (this.playlistHistory.length > 10) {
                    this.playlistHistory.shift();
                }
            }
            
            // Update next playlist
            this.nextPlaylist = await this.getNextPlaylist();
            
            // Increment switch count
            this.switchCount++;
            
            // Emit playlist changed event
            this.emitEvent('playlistChanged', {
                oldPlaylist: oldPlaylist,
                newPlaylist: newPlaylist,
                switchTime: new Date(),
                switchCount: this.switchCount
            });
            
            console.log(`[${this.TAG}] Playlist changed to: ${newPlaylist ? newPlaylist.sp_name : 'None'}`);
        } catch (error) {
            this.handleError(error, 'handlePlaylistChange');
            throw error;
        }
    }

    /**
     * Check for upcoming playlist switch
     */
    async checkUpcomingSwitch() {
        try {
            if (!this.nextPlaylist) {
                return;
            }
            
            const now = new Date();
            const nextStartTime = new Date(this.nextPlaylist.startTimeInMilli);
            const timeUntilSwitch = nextStartTime - now;
            
            // Check if we're within the switch threshold
            if (timeUntilSwitch > 0 && timeUntilSwitch <= this.PLAYLIST_SWITCH_THRESHOLD) {
                console.log(`[${this.TAG}] Upcoming playlist switch detected in ${timeUntilSwitch}ms`);
                
                // Emit upcoming switch event
                this.emitEvent('playlistSwitched', {
                    currentPlaylist: this.currentPlaylist,
                    nextPlaylist: this.nextPlaylist,
                    switchTime: nextStartTime,
                    timeUntilSwitch: timeUntilSwitch
                });
            }
        } catch (error) {
            this.handleError(error, 'checkUpcomingSwitch');
            throw error;
        }
    }

    /**
     * Check for expired playlists
     */
    async checkExpiredPlaylists() {
        try {
            const playlistDAO = this.dbManager.getDAO('playlistDAO');
            if (!playlistDAO) {
                return;
            }
            
            const expiredPlaylists = await playlistDAO.getPlaylistGoneTime();
            
            if (expiredPlaylists.length > 0) {
                console.log(`[${this.TAG}] Found ${expiredPlaylists.length} expired playlists`);
                
                // Emit playlist expired event
                this.emitEvent('playlistExpired', {
                    expiredPlaylists: expiredPlaylists,
                    checkTime: new Date()
                });
                
                // Clean up expired playlists if needed
                await this.cleanupExpiredPlaylists(expiredPlaylists);
            }
        } catch (error) {
            this.handleError(error, 'checkExpiredPlaylists');
            throw error;
        }
    }

    /**
     * Clean up expired playlists
     */
    async cleanupExpiredPlaylists(expiredPlaylists) {
        try {
            console.log(`[${this.TAG}] Cleaning up expired playlists`);
            
            const playlistDAO = this.dbManager.getDAO('playlistDAO');
            if (!playlistDAO) {
                return;
            }
            
            for (const playlist of expiredPlaylists) {
                // Check if playlist is very old (more than 24 hours)
                const now = new Date();
                const endTime = new Date(playlist.endTimeInMilli);
                const hoursSinceExpiry = (now - endTime) / (1000 * 60 * 60);
                
                if (hoursSinceExpiry > 24) {
                    console.log(`[${this.TAG}] Deleting very old playlist: ${playlist.sp_name}`);
                    await playlistDAO.deletePlaylist(playlist.sp_playlist_id);
                }
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error cleaning up expired playlists:`, error);
        }
    }

    /**
     * Load playlist history
     */
    async loadPlaylistHistory() {
        try {
            // Load playlist history from localStorage
            const savedHistory = localStorage.getItem('smc_playlist_history');
            if (savedHistory) {
                try {
                    this.playlistHistory = JSON.parse(savedHistory);
                    console.log(`[${this.TAG}] Loaded ${this.playlistHistory.length} playlist history entries`);
                } catch (parseError) {
                    console.warn(`[${this.TAG}] Could not parse playlist history:`, parseError);
                    this.playlistHistory = [];
                }
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error loading playlist history:`, error);
            this.playlistHistory = [];
        }
    }

    /**
     * Save playlist history
     */
    savePlaylistHistory() {
        try {
            localStorage.setItem('smc_playlist_history', JSON.stringify(this.playlistHistory));
        } catch (error) {
            console.warn(`[${this.TAG}] Could not save playlist history:`, error);
        }
    }

    /**
     * Force playlist refresh
     */
    async forcePlaylistRefresh() {
        try {
            console.log(`[${this.TAG}] Forcing playlist refresh`);
            
            // Refresh playlists from server
            if (this.apiClient) {
                const token = await this.getCurrentToken();
                if (token) {
                    const serverPlaylists = await this.apiClient.getPlaylists(token);
                    
                    const playlistDAO = this.dbManager.getDAO('playlistDAO');
                    if (playlistDAO) {
                        for (const playlist of serverPlaylists) {
                            await playlistDAO.createOrUpdatePlaylist(playlist);
                        }
                    }
                }
            }
            
            // Reinitialize playlist state
            await this.initializePlaylistState();
            
            console.log(`[${this.TAG}] Playlist refresh completed`);
        } catch (error) {
            this.handleError(error, 'forcePlaylistRefresh');
            throw error;
        }
    }

    /**
     * Get current token
     */
    async getCurrentToken() {
        try {
            return localStorage.getItem('token_id') || localStorage.getItem('login') || null;
        } catch (error) {
            console.warn(`[${this.TAG}] Could not get current token:`, error);
            return null;
        }
    }

    /**
     * Get playlist statistics
     */
    async getPlaylistStatistics() {
        try {
            const playlistDAO = this.dbManager.getDAO('playlistDAO');
            if (!playlistDAO) {
                return null;
            }
            
            const allPlaylists = await playlistDAO.getAllPlaylistsInPlayingOrder();
            const activePlaylists = allPlaylists.filter(playlist => {
                const now = new Date();
                const startTime = new Date(playlist.startTimeInMilli);
                const endTime = new Date(playlist.endTimeInMilli);
                return now >= startTime && now <= endTime;
            });
            
            const expiredPlaylists = await playlistDAO.getPlaylistGoneTime();
            const futurePlaylists = await playlistDAO.getRemainingAllPlaylists();
            
            return {
                totalPlaylists: allPlaylists.length,
                activePlaylists: activePlaylists.length,
                expiredPlaylists: expiredPlaylists.length,
                futurePlaylists: futurePlaylists.length,
                currentPlaylist: this.currentPlaylist,
                nextPlaylist: this.nextPlaylist,
                switchCount: this.switchCount,
                lastCheckTime: this.lastCheckTime
            };
        } catch (error) {
            this.handleError(error, 'getPlaylistStatistics');
            throw error;
        }
    }

    /**
     * Get watcher status
     */
    getWatcherStatus() {
        return {
            isRunning: this.isRunning,
            lastCheckTime: this.lastCheckTime,
            watchInterval: this.WATCH_INTERVAL,
            currentPlaylist: this.currentPlaylist,
            nextPlaylist: this.nextPlaylist,
            switchCount: this.switchCount,
            playlistHistoryLength: this.playlistHistory.length
        };
    }

    /**
     * Get playlist history
     */
    getPlaylistHistory() {
        return [...this.playlistHistory];
    }

    /**
     * Clear playlist history
     */
    clearPlaylistHistory() {
        this.playlistHistory = [];
        this.savePlaylistHistory();
        console.log(`[${this.TAG}] Playlist history cleared`);
    }

    /**
     * Add event listener
     */
    addEventListener(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        }
    }

    /**
     * Remove event listener
     */
    removeEventListener(event, callback) {
        if (this.eventListeners[event]) {
            const index = this.eventListeners[event].indexOf(callback);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     */
    emitEvent(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[${this.TAG}] Error in event listener:`, error);
                }
            });
        }
    }

    /**
     * Handle errors
     */
    handleError(error, operation) {
        console.error(`[${this.TAG}] Error in ${operation}:`, error);
        this.emitEvent('error', { operation, error: error.message });
        throw new Error(`${operation} failed: ${error.message}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaylistWatcher;
} else if (typeof window !== 'undefined') {
    window.PlaylistWatcher = PlaylistWatcher;
}
