/**
 * ApplicationChecker - Mirrors ApplicationChecker.java functionality
 * Complete application monitoring and checking system for webOS Signage
 */

class ApplicationChecker {
    constructor(databaseManager) {
        this.dbManager = databaseManager;
        this.TAG = 'ApplicationChecker';
        
        // Checker state
        this.isRunning = false;
        this.checkInterval = null;
        this.lastCheckTime = null;
        
        // Timing constants from Java implementation
        this.CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes (300000ms from Java)
        this.PLAYBACK_CHECK_INTERVAL = 15 * 1000; // 15 seconds for playback
        this.APP_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes for app check
        
        // Application state
        this.appState = {
            isRunning: true,
            playbackActive: false,
            lastPlaybackTime: null,
            stallCount: 0,
            maxRetries: 10,
            retryCount: 0,
            lastRestartTime: null
        };
        
        // Event listeners
        this.eventListeners = {
            'appCheckStarted': [],
            'appCheckCompleted': [],
            'playbackStalled': [],
            'appRestarted': [],
            'error': []
        };
    }

    /**
     * Start application checker
     * Mirrors: ApplicationChecker startup logic
     */
    async start() {
        try {
            console.log(`[${this.TAG}] Starting application checker`);
            
            if (this.isRunning) {
                console.log(`[${this.TAG}] Application checker already running`);
                return true;
            }
            
            // Initialize application state
            await this.initializeAppState();
            
            // Start checking intervals
            this.startCheckingIntervals();
            
            // Set running state
            this.isRunning = true;
            this.lastCheckTime = new Date();
            
            // Emit app check started event
            this.emitEvent('appCheckStarted', { startTime: this.lastCheckTime });
            
            console.log(`[${this.TAG}] Application checker started successfully`);
            return true;
        } catch (error) {
            this.handleError(error, 'start');
            throw error;
        }
    }

    /**
     * Stop application checker
     */
    async stop() {
        try {
            console.log(`[${this.TAG}] Stopping application checker`);
            
            if (!this.isRunning) {
                console.log(`[${this.TAG}] Application checker not running`);
                return true;
            }
            
            // Clear intervals
            this.clearCheckingIntervals();
            
            // Set running state
            this.isRunning = false;
            
            console.log(`[${this.TAG}] Application checker stopped`);
            return true;
        } catch (error) {
            this.handleError(error, 'stop');
            throw error;
        }
    }

    /**
     * Initialize application state
     */
    async initializeAppState() {
        try {
            console.log(`[${this.TAG}] Initializing application state`);
            
            // Load state from storage
            const savedState = localStorage.getItem('smc_app_checker_state');
            if (savedState) {
                try {
                    const parsedState = JSON.parse(savedState);
                    this.appState = { ...this.appState, ...parsedState };
                    console.log(`[${this.TAG}] Loaded saved application state`);
                } catch (parseError) {
                    console.warn(`[${this.TAG}] Could not parse saved state:`, parseError);
                }
            }
            
            // Reset retry count if it's been more than an hour
            const now = new Date();
            if (this.appState.lastRestartTime) {
                const timeSinceRestart = now - new Date(this.appState.lastRestartTime);
                if (timeSinceRestart > 60 * 60 * 1000) { // 1 hour
                    this.appState.retryCount = 0;
                    this.saveAppState();
                }
            }
            
            console.log(`[${this.TAG}] Application state initialized`);
        } catch (error) {
            this.handleError(error, 'initializeAppState');
            throw error;
        }
    }

    /**
     * Start checking intervals
     */
    startCheckingIntervals() {
        try {
            console.log(`[${this.TAG}] Starting checking intervals`);
            
            // Main application check interval
            this.checkInterval = setInterval(async () => {
                await this.performAppCheck();
            }, this.APP_CHECK_INTERVAL);
            
            // Playback check interval
            this.playbackCheckInterval = setInterval(async () => {
                await this.performPlaybackCheck();
            }, this.PLAYBACK_CHECK_INTERVAL);
            
            console.log(`[${this.TAG}] Checking intervals started`);
        } catch (error) {
            this.handleError(error, 'startCheckingIntervals');
            throw error;
        }
    }

    /**
     * Clear checking intervals
     */
    clearCheckingIntervals() {
        try {
            console.log(`[${this.TAG}] Clearing checking intervals`);
            
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }
            
            if (this.playbackCheckInterval) {
                clearInterval(this.playbackCheckInterval);
                this.playbackCheckInterval = null;
            }
            
            console.log(`[${this.TAG}] Checking intervals cleared`);
        } catch (error) {
            this.handleError(error, 'clearCheckingIntervals');
            throw error;
        }
    }

    /**
     * Perform quick check
     * Mirrors: ApplicationChecker quick check logic
     */
    async performQuickCheck() {
        try {
            console.log(`[${this.TAG}] Performing quick check`);
            
            // Check if app is responsive
            const isResponsive = await this.checkAppResponsiveness();
            
            if (!isResponsive) {
                console.warn(`[${this.TAG}] App is not responsive`);
                await this.handleAppUnresponsive();
            }
            
            // Check basic functionality
            const basicCheck = await this.performBasicFunctionalityCheck();
            
            console.log(`[${this.TAG}] Quick check completed: ${basicCheck ? 'PASSED' : 'FAILED'}`);
            return basicCheck;
        } catch (error) {
            this.handleError(error, 'performQuickCheck');
            throw error;
        }
    }

    /**
     * Perform application check
     * Mirrors: ApplicationChecker main check logic
     */
    async performAppCheck() {
        try {
            console.log(`[${this.TAG}] Performing application check`);
            
            const checkStartTime = new Date();
            let checkPassed = true;
            const checkResults = {
                appResponsive: false,
                databaseAccessible: false,
                memoryUsage: false,
                networkStatus: false,
                playbackStatus: false
            };
            
            try {
                // Check app responsiveness
                checkResults.appResponsive = await this.checkAppResponsiveness();
                
                // Check database accessibility
                checkResults.databaseAccessible = await this.checkDatabaseAccessibility();
                
                // Check memory usage
                checkResults.memoryUsage = await this.checkMemoryUsage();
                
                // Check network status
                checkResults.networkStatus = await this.checkNetworkStatus();
                
                // Check playback status
                checkResults.playbackStatus = await this.checkPlaybackStatus();
                
                // Overall check result
                checkPassed = Object.values(checkResults).every(result => result === true);
                
            } catch (checkError) {
                console.error(`[${this.TAG}] Application check error:`, checkError);
                checkPassed = false;
            }
            
            // Update last check time
            this.lastCheckTime = checkStartTime;
            
            // Handle check failure
            if (!checkPassed) {
                await this.handleAppCheckFailure(checkResults);
            }
            
            // Save application state
            this.saveAppState();
            
            // Emit app check completed event
            this.emitEvent('appCheckCompleted', { 
                checkTime: checkStartTime,
                passed: checkPassed,
                results: checkResults
            });
            
            console.log(`[${this.TAG}] Application check completed: ${checkPassed ? 'PASSED' : 'FAILED'}`);
            return checkPassed;
        } catch (error) {
            this.handleError(error, 'performAppCheck');
            throw error;
        }
    }

    /**
     * Perform playback check
     * Mirrors: ApplicationChecker playback monitoring
     */
    async performPlaybackCheck() {
        try {
            console.log(`[${this.TAG}] Performing playback check`);
            
            const playbackStartTime = new Date();
            let isPlaybackStalled = false;
            
            // Check if playback is active
            const isPlaybackActive = await this.checkPlaybackActive();
            
            if (isPlaybackActive) {
                // Check for playback stall
                isPlaybackStalled = await this.checkPlaybackStall();
                
                if (isPlaybackStalled) {
                    console.warn(`[${this.TAG}] Playback stall detected`);
                    await this.handlePlaybackStall();
                } else {
                    // Reset stall count if playback is normal
                    this.appState.stallCount = 0;
                    this.appState.lastPlaybackTime = playbackStartTime;
                }
            }
            
            // Update playback state
            this.appState.playbackActive = isPlaybackActive;
            
            console.log(`[${this.TAG}] Playback check completed: ${isPlaybackActive ? 'ACTIVE' : 'INACTIVE'}`);
            return !isPlaybackStalled;
        } catch (error) {
            this.handleError(error, 'performPlaybackCheck');
            throw error;
        }
    }

    /**
     * Check app responsiveness
     */
    async checkAppResponsiveness() {
        try {
            // Check if main app loop is responding
            const startTime = Date.now();
            
            // Simple responsiveness check - can we access the DOM
            const appElement = document.getElementById('app');
            const isResponsive = !!appElement;
            
            const responseTime = Date.now() - startTime;
            
            console.log(`[${this.TAG}] App responsiveness check: ${isResponsive ? 'RESPONSIVE' : 'UNRESPONSIVE'} (${responseTime}ms)`);
            return isResponsive && responseTime < 1000; // Less than 1 second response time
        } catch (error) {
            console.error(`[${this.TAG}] App responsiveness check failed:`, error);
            return false;
        }
    }

    /**
     * Check database accessibility
     */
    async checkDatabaseAccessibility() {
        try {
            if (!this.dbManager || !this.dbManager.isReady()) {
                console.warn(`[${this.TAG}] Database not ready`);
                return false;
            }
            
            // Try to perform a simple database operation
            const dbInfo = await this.dbManager.getDatabaseInfo();
            const isAccessible = dbInfo && dbInfo.name === this.dbManager.dbName;
            
            console.log(`[${this.TAG}] Database accessibility check: ${isAccessible ? 'ACCESSIBLE' : 'INACCESSIBLE'}`);
            return isAccessible;
        } catch (error) {
            console.error(`[${this.TAG}] Database accessibility check failed:`, error);
            return false;
        }
    }

    /**
     * Check memory usage
     */
    async checkMemoryUsage() {
        try {
            // Check memory usage if available
            if (performance && performance.memory) {
                const memoryInfo = performance.memory;
                const usedMemory = memoryInfo.usedJSHeapSize;
                const totalMemory = memoryInfo.totalJSHeapSize;
                const memoryUsage = (usedMemory / totalMemory) * 100;
                
                // Check if memory usage is below 90%
                const isMemoryOK = memoryUsage < 90;
                
                console.log(`[${this.TAG}] Memory usage check: ${memoryUsage.toFixed(2)}% (${isMemoryOK ? 'OK' : 'HIGH'})`);
                return isMemoryOK;
            }
            
            // Fallback - assume memory is OK if we can't check
            console.log(`[${this.TAG}] Memory usage check: OK (unable to check)`);
            return true;
        } catch (error) {
            console.error(`[${this.TAG}] Memory usage check failed:`, error);
            return false;
        }
    }

    /**
     * Check network status
     */
    async checkNetworkStatus() {
        try {
            // Check if we're online
            const isOnline = navigator.onLine;
            
            if (isOnline) {
                // Try a simple network request
                try {
                    const response = await fetch('https://www.google.com', { 
                        method: 'HEAD',
                        mode: 'no-cors',
                        cache: 'no-cache'
                    });
                    console.log(`[${this.TAG}] Network status check: ONLINE`);
                    return true;
                } catch (networkError) {
                    console.warn(`[${this.TAG}] Network status check: LIMITED (online but request failed)`);
                    return true; // Still consider online if navigator.onLine is true
                }
            } else {
                console.log(`[${this.TAG}] Network status check: OFFLINE`);
                return false;
            }
        } catch (error) {
            console.error(`[${this.TAG}] Network status check failed:`, error);
            return false;
        }
    }

    /**
     * Check playback status
     */
    async checkPlaybackStatus() {
        try {
            // Check if there's an active media element
            const mediaElements = document.querySelectorAll('video, audio');
            const hasMediaElements = mediaElements.length > 0;
            
            if (hasMediaElements) {
                // Check if any media element is playing
                const isPlaying = Array.from(mediaElements).some(element => 
                    !element.paused && !element.ended && element.readyState > 2
                );
                
                console.log(`[${this.TAG}] Playback status check: ${isPlaying ? 'PLAYING' : 'STOPPED'}`);
                return isPlaying;
            } else {
                console.log(`[${this.TAG}] Playback status check: NO MEDIA`);
                return true; // No media is not an error
            }
        } catch (error) {
            console.error(`[${this.TAG}] Playback status check failed:`, error);
            return false;
        }
    }

    /**
     * Check if playback is active
     */
    async checkPlaybackActive() {
        try {
            // More detailed playback check
            const mediaElements = document.querySelectorAll('video, audio');
            
            for (const element of mediaElements) {
                if (!element.paused && !element.ended && element.readyState > 2) {
                    // Check if media is actually progressing
                    const currentTime = element.currentTime;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const newCurrentTime = element.currentTime;
                    
                    if (newCurrentTime > currentTime) {
                        return true; // Media is progressing
                    }
                }
            }
            
            return false;
        } catch (error) {
            console.error(`[${this.TAG}] Playback active check failed:`, error);
            return false;
        }
    }

    /**
     * Check for playback stall
     */
    async checkPlaybackStall() {
        try {
            // Check if playback has been stalled for more than 30 seconds
            if (!this.appState.lastPlaybackTime) {
                return false;
            }
            
            const timeSinceLastPlayback = Date.now() - new Date(this.appState.lastPlaybackTime).getTime();
            const isStalled = timeSinceLastPlayback > 30 * 1000; // 30 seconds
            
            if (isStalled) {
                this.appState.stallCount++;
                console.warn(`[${this.TAG}] Playback stall detected (${this.appState.stallCount} consecutive stalls)`);
            }
            
            return isStalled;
        } catch (error) {
            console.error(`[${this.TAG}] Playback stall check failed:`, error);
            return false;
        }
    }

    /**
     * Perform basic functionality check
     */
    async performBasicFunctionalityCheck() {
        try {
            // Check basic app functionality
            const checks = [
                this.checkAppResponsiveness(),
                this.checkDatabaseAccessibility()
            ];
            
            const results = await Promise.allSettled(checks);
            const passed = results.every(result => result.status === 'fulfilled' && result.value === true);
            
            console.log(`[${this.TAG}] Basic functionality check: ${passed ? 'PASSED' : 'FAILED'}`);
            return passed;
        } catch (error) {
            console.error(`[${this.TAG}] Basic functionality check failed:`, error);
            return false;
        }
    }

    /**
     * Handle app unresponsive
     */
    async handleAppUnresponsive() {
        try {
            console.warn(`[${this.TAG}] Handling unresponsive app`);
            
            // Try to restart the app
            if (this.appState.retryCount < this.appState.maxRetries) {
                await this.restartApplication();
            } else {
                console.error(`[${this.TAG}] Max retries reached, cannot restart app`);
            }
        } catch (error) {
            this.handleError(error, 'handleAppUnresponsive');
            throw error;
        }
    }

    /**
     * Handle app check failure
     */
    async handleAppCheckFailure(checkResults) {
        try {
            console.warn(`[${this.TAG}] Handling app check failure:`, checkResults);
            
            // Determine what failed and take appropriate action
            if (!checkResults.databaseAccessible) {
                console.warn(`[${this.TAG}] Database not accessible, attempting to reconnect`);
                await this.reconnectDatabase();
            }
            
            if (!checkResults.appResponsive) {
                console.warn(`[${this.TAG}] App not responsive, attempting recovery`);
                await this.handleAppUnresponsive();
            }
            
            if (!checkResults.memoryUsage) {
                console.warn(`[${this.TAG}] High memory usage, attempting cleanup`);
                await this.performMemoryCleanup();
            }
        } catch (error) {
            this.handleError(error, 'handleAppCheckFailure');
            throw error;
        }
    }

    /**
     * Handle playback stall
     */
    async handlePlaybackStall() {
        try {
            console.warn(`[${this.TAG}] Handling playback stall (count: ${this.appState.stallCount})`);
            
            // Emit playback stalled event
            this.emitEvent('playbackStalled', { 
                stallCount: this.appState.stallCount,
                lastPlaybackTime: this.appState.lastPlaybackTime
            });
            
            // Try to restart current media
            await this.restartCurrentMedia();
            
            // If stall count is high, restart app
            if (this.appState.stallCount >= 3) {
                console.warn(`[${this.TAG}] High stall count, restarting application`);
                await this.restartApplication();
            }
        } catch (error) {
            this.handleError(error, 'handlePlaybackStall');
            throw error;
        }
    }

    /**
     * Restart current media
     */
    async restartCurrentMedia() {
        try {
            console.log(`[${this.TAG}] Restarting current media`);
            
            const mediaElements = document.querySelectorAll('video, audio');
            
            for (const element of mediaElements) {
                if (!element.paused && !element.ended) {
                    const currentTime = element.currentTime;
                    element.pause();
                    await new Promise(resolve => setTimeout(resolve, 100));
                    element.currentTime = currentTime;
                    element.play().catch(error => {
                        console.warn(`[${this.TAG}] Could not restart media:`, error);
                    });
                }
            }
            
            console.log(`[${this.TAG}] Current media restart attempted`);
        } catch (error) {
            console.error(`[${this.TAG}] Media restart failed:`, error);
        }
    }

    /**
     * Restart application
     */
    async restartApplication() {
        try {
            console.warn(`[${this.TAG}] Restarting application (retry ${this.appState.retryCount + 1}/${this.appState.maxRetries})`);
            
            // Update retry count
            this.appState.retryCount++;
            this.appState.lastRestartTime = new Date().toISOString();
            
            // Save state before restart
            this.saveAppState();
            
            // Emit app restarted event
            this.emitEvent('appRestarted', { 
                retryCount: this.appState.retryCount,
                restartTime: this.appState.lastRestartTime
            });
            
            // Perform soft reload (location.reload)
            if (this.appState.retryCount < 3) {
                console.log(`[${this.TAG}] Performing soft reload`);
                location.reload();
            } else {
                console.log(`[${this.TAG}] Performing hard reload`);
                location.href = location.href; // Hard reload
            }
        } catch (error) {
            this.handleError(error, 'restartApplication');
            throw error;
        }
    }

    /**
     * Reconnect database
     */
    async reconnectDatabase() {
        try {
            console.log(`[${this.TAG}] Reconnecting database`);
            
            if (this.dbManager) {
                // Close and reopen database
                this.dbManager.close();
                await this.dbManager.initialize();
                console.log(`[${this.TAG}] Database reconnected`);
            }
        } catch (error) {
            console.error(`[${this.TAG}] Database reconnection failed:`, error);
        }
    }

    /**
     * Perform memory cleanup
     */
    async performMemoryCleanup() {
        try {
            console.log(`[${this.TAG}] Performing memory cleanup`);
            
            // Clear caches
            if (caches) {
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    await caches.delete(cacheName);
                }
            }
            
            // Trigger garbage collection if available
            if (window.gc) {
                window.gc();
            }
            
            console.log(`[${this.TAG}] Memory cleanup completed`);
        } catch (error) {
            console.error(`[${this.TAG}] Memory cleanup failed:`, error);
        }
    }

    /**
     * Save application state
     */
    saveAppState() {
        try {
            const stateToSave = {
                ...this.appState,
                lastSaved: new Date().toISOString()
            };
            
            localStorage.setItem('smc_app_checker_state', JSON.stringify(stateToSave));
        } catch (error) {
            console.warn(`[${this.TAG}] Could not save application state:`, error);
        }
    }

    /**
     * Get application status
     */
    getApplicationStatus() {
        return {
            isRunning: this.isRunning,
            lastCheckTime: this.lastCheckTime,
            appState: { ...this.appState },
            checkInterval: this.APP_CHECK_INTERVAL,
            playbackCheckInterval: this.PLAYBACK_CHECK_INTERVAL
        };
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
    module.exports = ApplicationChecker;
} else if (typeof window !== 'undefined') {
    window.ApplicationChecker = ApplicationChecker;
}
