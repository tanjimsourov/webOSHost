/**
 * ServiceManager - Mirrors MyService.java functionality
 * Complete background service management for webOS Signage
 */

class ServiceManager {
    constructor(databaseManager, apiClient, downloadManager) {
        this.dbManager = databaseManager;
        this.apiClient = apiClient;
        this.downloadManager = downloadManager;
        this.TAG = 'ServiceManager';
        
        // Service state
        this.isRunning = false;
        this.serviceInterval = null;
        this.quickCheckInterval = null;
        this.lastRefreshTime = null;
        
        // Timing constants from Java implementation
        this.REFRESH_INTERVAL = 16 * 60 * 1000; // 16 minutes (WorkManager)
        this.QUICK_CHECK_INTERVAL = 150 * 1000; // 150 seconds (MyService)
        this.HEARTBEAT_INTERVAL = 60 * 1000; // 60 seconds
        
        // Service components
        this.workerManager = null;
        this.applicationChecker = null;
        this.playlistWatcher = null;
        this.broadcastReceiver = null;
        
        // Event listeners
        this.eventListeners = {
            'serviceStarted': [],
            'serviceStopped': [],
            'contentRefreshed': [],
            'heartbeatSent': [],
            'error': []
        };
    }

    /**
     * Start the background service
     * Mirrors: MyService.onStart()
     */
    async startService() {
        try {
            console.log(`[${this.TAG}] Starting background service`);
            
            if (this.isRunning) {
                console.log(`[${this.TAG}] Service already running`);
                return true;
            }
            
            // Initialize service components
            await this.initializeServiceComponents();
            
            // Start service intervals
            this.startServiceIntervals();
            
            // Set service state
            this.isRunning = true;
            this.lastRefreshTime = new Date();
            
            // Show notification (webOS equivalent)
            this.showServiceNotification('SMC Signage Service Started');
            
            // Emit service started event
            this.emitEvent('serviceStarted', { startTime: this.lastRefreshTime });
            
            console.log(`[${this.TAG}] Background service started successfully`);
            return true;
        } catch (error) {
            this.handleError(error, 'startService');
            throw error;
        }
    }

    /**
     * Stop the background service
     * Mirrors: MyService.onDestroy()
     */
    async stopService() {
        try {
            console.log(`[${this.TAG}] Stopping background service`);
            
            if (!this.isRunning) {
                console.log(`[${this.TAG}] Service not running`);
                return true;
            }
            
            // Clear intervals
            this.clearServiceIntervals();
            
            // Stop service components
            await this.stopServiceComponents();
            
            // Set service state
            this.isRunning = false;
            
            // Hide notification
            this.hideServiceNotification();
            
            // Emit service stopped event
            this.emitEvent('serviceStopped', { stopTime: new Date() });
            
            console.log(`[${this.TAG}] Background service stopped successfully`);
            return true;
        } catch (error) {
            this.handleError(error, 'stopService');
            throw error;
        }
    }

    /**
     * Initialize service components
     */
    async initializeServiceComponents() {
        try {
            console.log(`[${this.TAG}] Initializing service components`);
            
            // Initialize worker manager
            if (!this.workerManager) {
                this.workerManager = new WorkerManager(this.dbManager, this.apiClient);
                await this.workerManager.initialize();
            }
            
            // Initialize application checker
            if (!this.applicationChecker) {
                this.applicationChecker = new ApplicationChecker(this.dbManager);
                await this.applicationChecker.start();
            }
            
            // Initialize playlist watcher
            if (!this.playlistWatcher) {
                this.playlistWatcher = new PlaylistWatcher(this.dbManager, this.apiClient);
                await this.playlistWatcher.start();
            }
            
            // Initialize broadcast receiver
            if (!this.broadcastReceiver) {
                this.broadcastReceiver = new BroadcastReceiver();
                this.broadcastReceiver.addEventListener('broadcastReceived', this.handleBroadcast.bind(this));
            }
            
            console.log(`[${this.TAG}] Service components initialized`);
        } catch (error) {
            this.handleError(error, 'initializeServiceComponents');
            throw error;
        }
    }

    /**
     * Stop service components
     */
    async stopServiceComponents() {
        try {
            console.log(`[${this.TAG}] Stopping service components`);
            
            if (this.workerManager) {
                await this.workerManager.stop();
            }
            
            if (this.applicationChecker) {
                await this.applicationChecker.stop();
            }
            
            if (this.playlistWatcher) {
                await this.playlistWatcher.stop();
            }
            
            if (this.broadcastReceiver) {
                this.broadcastReceiver.removeEventListener('broadcastReceived', this.handleBroadcast);
            }
            
            console.log(`[${this.TAG}] Service components stopped`);
        } catch (error) {
            this.handleError(error, 'stopServiceComponents');
            throw error;
        }
    }

    /**
     * Start service intervals
     */
    startServiceIntervals() {
        try {
            console.log(`[${this.TAG}] Starting service intervals`);
            
            // Main refresh interval (16 minutes)
            this.serviceInterval = setInterval(async () => {
                await this.performContentRefresh();
            }, this.REFRESH_INTERVAL);
            
            // Quick check interval (150 seconds)
            this.quickCheckInterval = setInterval(async () => {
                await this.performQuickCheck();
            }, this.QUICK_CHECK_INTERVAL);
            
            // Heartbeat interval (60 seconds)
            this.heartbeatInterval = setInterval(async () => {
                await this.sendHeartbeat();
            }, this.HEARTBEAT_INTERVAL);
            
            console.log(`[${this.TAG}] Service intervals started`);
        } catch (error) {
            this.handleError(error, 'startServiceIntervals');
            throw error;
        }
    }

    /**
     * Clear service intervals
     */
    clearServiceIntervals() {
        try {
            console.log(`[${this.TAG}] Clearing service intervals`);
            
            if (this.serviceInterval) {
                clearInterval(this.serviceInterval);
                this.serviceInterval = null;
            }
            
            if (this.quickCheckInterval) {
                clearInterval(this.quickCheckInterval);
                this.quickCheckInterval = null;
            }
            
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            
            console.log(`[${this.TAG}] Service intervals cleared`);
        } catch (error) {
            this.handleError(error, 'clearServiceIntervals');
            throw error;
        }
    }

    /**
     * Perform content refresh
     * Mirrors: MyService content refresh logic
     */
    async performContentRefresh() {
        try {
            console.log(`[${this.TAG}] Performing content refresh`);
            
            const refreshStartTime = new Date();
            
            // Refresh playlists
            await this.refreshPlaylists();
            
            // Refresh advertisements
            await this.refreshAdvertisements();
            
            // Queue missing downloads
            await this.queueMissingDownloads();
            
            // Update last refresh time
            this.lastRefreshTime = refreshStartTime;
            
            // Emit content refreshed event
            this.emitEvent('contentRefreshed', { 
                refreshTime: refreshStartTime,
                playlistsRefreshed: true,
                advertisementsRefreshed: true
            });
            
            console.log(`[${this.TAG}] Content refresh completed`);
        } catch (error) {
            this.handleError(error, 'performContentRefresh');
            throw error;
        }
    }

    /**
     * Perform quick check
     * Mirrors: MyService quick check logic
     */
    async performQuickCheck() {
        try {
            console.log(`[${this.TAG}] Running quick check`);
            
            // Check application status
            if (this.applicationChecker) {
                await this.applicationChecker.performQuickCheck();
            }
            
            // Check playlist status
            if (this.playlistWatcher) {
                await this.playlistWatcher.checkPlaylistStatus();
            }
            
            // Check download queue
            if (this.downloadManager) {
                await this.downloadManager.checkDownloadQueue();
            }
            
            console.log(`[${this.TAG}] Quick check completed`);
        } catch (error) {
            this.handleError(error, 'performQuickCheck');
            throw error;
        }
    }

    /**
     * Send heartbeat
     * Mirrors: MyService heartbeat logic
     */
    async sendHeartbeat() {
        try {
            console.log(`[${this.TAG}] Sending heartbeat`);
            
            // Get current token
            const token = await this.getCurrentToken();
            
            if (token) {
                // Create heartbeat status
                const statusData = {
                    token_id: token,
                    heartbeat_datetime: new Date().toISOString()
                };
                
                // Send heartbeat via API
                if (this.apiClient) {
                    await this.apiClient.sendHeartbeat(statusData);
                }
                
                // Store heartbeat in database
                const dao = this.dbManager.getDAO('playerStatusDAO');
                if (dao) {
                    await dao.createHeartbeatStatus(token);
                }
                
                // Emit heartbeat sent event
                this.emitEvent('heartbeatSent', { token, timestamp: new Date() });
            }
            
            console.log(`[${this.TAG}] Heartbeat sent successfully`);
        } catch (error) {
            this.handleError(error, 'sendHeartbeat');
            throw error;
        }
    }

    /**
     * Refresh playlists
     */
    async refreshPlaylists() {
        try {
            console.log(`[${this.TAG}] Refreshing playlists`);
            
            if (!this.apiClient) {
                console.warn(`[${this.TAG}] API client not available for playlist refresh`);
                return;
            }
            
            // Get current token
            const token = await this.getCurrentToken();
            
            if (token) {
                // Fetch playlists from server
                const serverPlaylists = await this.apiClient.getPlaylists(token);
                
                // Update local database
                const playlistDAO = this.dbManager.getDAO('playlistDAO');
                if (playlistDAO) {
                    for (const playlist of serverPlaylists) {
                        await playlistDAO.createOrUpdatePlaylist(playlist);
                    }
                    
                    // Remove playlists not in server response
                    const serverPlaylistIds = serverPlaylists.map(p => p.sp_playlist_id);
                    const localPlaylists = await playlistDAO.getListNotAvailableinWebResponse(serverPlaylistIds);
                    
                    for (const playlist of localPlaylists) {
                        await playlistDAO.deletePlaylist(playlist.sp_playlist_id);
                    }
                }
            }
            
            console.log(`[${this.TAG}] Playlists refreshed successfully`);
        } catch (error) {
            this.handleError(error, 'refreshPlaylists');
            throw error;
        }
    }

    /**
     * Refresh advertisements
     */
    async refreshAdvertisements() {
        try {
            console.log(`[${this.TAG}] Refreshing advertisements`);
            
            if (!this.apiClient) {
                console.warn(`[${this.TAG}] API client not available for advertisement refresh`);
                return;
            }
            
            // Get current token
            const token = await this.getCurrentToken();
            
            if (token) {
                // Fetch advertisements from server
                const serverAdvertisements = await this.apiClient.getAdvertisements(token);
                
                // Update local database
                const advertisementDAO = this.dbManager.getDAO('advertisementDAO');
                if (advertisementDAO) {
                    for (const advertisement of serverAdvertisements) {
                        await advertisementDAO.createOrUpdateAdvertisement(advertisement);
                    }
                    
                    // Remove advertisements not in server response
                    const serverAdvertisementIds = serverAdvertisements.map(a => a.adv_id);
                    await advertisementDAO.deleteAdvIfNotInServer(serverAdvertisementIds);
                }
            }
            
            console.log(`[${this.TAG}] Advertisements refreshed successfully`);
        } catch (error) {
            this.handleError(error, 'refreshAdvertisements');
            throw error;
        }
    }

    /**
     * Queue missing downloads
     */
    async queueMissingDownloads() {
        try {
            console.log(`[${this.TAG}] Queuing missing downloads`);
            
            if (!this.downloadManager) {
                console.warn(`[${this.TAG}] Download manager not available`);
                return;
            }
            
            // Get songs that need downloading
            const songsDAO = this.dbManager.getDAO('songsDAO');
            if (songsDAO) {
                const nonDownloadedSongs = await songsDAO.getUnschdSongsThoseAreNotDownloaded();
                
                for (const song of nonDownloadedSongs) {
                    await this.downloadManager.queueDownload(song, 'song');
                }
            }
            
            // Get advertisements that need downloading
            const advertisementDAO = this.dbManager.getDAO('advertisementDAO');
            if (advertisementDAO) {
                const nonDownloadedAds = await advertisementDAO.getNotExistInStorage([]);
                
                for (const advertisement of nonDownloadedAds) {
                    await this.downloadManager.queueDownload(advertisement, 'advertisement');
                }
            }
            
            console.log(`[${this.TAG}] Missing downloads queued successfully`);
        } catch (error) {
            this.handleError(error, 'queueMissingDownloads');
            throw error;
        }
    }

    /**
     * Get current token
     */
    async getCurrentToken() {
        try {
            // Get token from preferences or storage
            const prefs = this.getPreferences();
            return prefs.getString('login') || prefs.getString('token_id') || null;
        } catch (error) {
            console.warn(`[${this.TAG}] Could not get current token:`, error);
            return null;
        }
    }

    /**
     * Get preferences (mock implementation)
     */
    getPreferences() {
        // Mock preferences - should be replaced with actual preferences implementation
        return {
            getString: (key) => localStorage.getItem(key) || null,
            setString: (key, value) => localStorage.setItem(key, value)
        };
    }

    /**
     * Show service notification
     */
    showServiceNotification(message) {
        try {
            console.log(`[${this.TAG}] Service notification: ${message}`);
            // webOS notification implementation would go here
            // For now, just log the message
        } catch (error) {
            console.warn(`[${this.TAG}] Could not show notification:`, error);
        }
    }

    /**
     * Hide service notification
     */
    hideServiceNotification() {
        try {
            console.log(`[${this.TAG}] Service notification hidden`);
            // webOS notification hiding would go here
        } catch (error) {
            console.warn(`[${this.TAG}] Could not hide notification:`, error);
        }
    }

    /**
     * Handle broadcast events
     */
    async handleBroadcast(event) {
        try {
            console.log(`[${this.TAG}] Handling broadcast:`, event.data);
            
            const { action, data } = event.data;
            
            switch (action) {
                case 'REFRESH_CONTENT':
                    await this.performContentRefresh();
                    break;
                case 'QUICK_CHECK':
                    await this.performQuickCheck();
                    break;
                case 'SERVICE_RESTART':
                    await this.restartService();
                    break;
                default:
                    console.log(`[${this.TAG}] Unknown broadcast action: ${action}`);
            }
        } catch (error) {
            this.handleError(error, 'handleBroadcast');
            throw error;
        }
    }

    /**
     * Restart service
     */
    async restartService() {
        try {
            console.log(`[${this.TAG}] Restarting service`);
            
            await this.stopService();
            await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
            await this.startService();
            
            console.log(`[${this.TAG}] Service restarted successfully`);
        } catch (error) {
            this.handleError(error, 'restartService');
            throw error;
        }
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
     * Get service status
     */
    getServiceStatus() {
        return {
            isRunning: this.isRunning,
            lastRefreshTime: this.lastRefreshTime,
            refreshInterval: this.REFRESH_INTERVAL,
            quickCheckInterval: this.QUICK_CHECK_INTERVAL,
            heartbeatInterval: this.HEARTBEAT_INTERVAL
        };
    }

    /**
     * Handle service errors
     */
    handleError(error, operation) {
        console.error(`[${this.TAG}] Error in ${operation}:`, error);
        this.emitEvent('error', { operation, error: error.message });
        throw new Error(`${operation} failed: ${error.message}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServiceManager;
} else if (typeof window !== 'undefined') {
    window.ServiceManager = ServiceManager;
}
