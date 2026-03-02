/**
 * WorkerManager - Mirrors MyWorker.java functionality
 * Complete work management system for webOS Signage
 */

class WorkerManager {
    constructor(databaseManager, apiClient) {
        this.dbManager = databaseManager;
        this.apiClient = apiClient;
        this.TAG = 'WorkerManager';
        
        // Worker state
        this.isRunning = false;
        this.workers = new Map();
        this.workQueue = [];
        this.activeWorkers = new Set();
        
        // Worker configuration
        this.MAX_CONCURRENT_WORKERS = 3;
        this.WORKER_TIMEOUT = 5 * 60 * 1000; // 5 minutes
        this.RETRY_LIMIT = 3;
        
        // Work types (mirroring Android WorkManager)
        this.WORK_TYPES = {
            CONTENT_REFRESH: 'content_refresh',
            DOWNLOAD_QUEUE: 'download_queue',
            STATUS_REPORT: 'status_report',
            PLAYLIST_CHECK: 'playlist_check',
            ADVERTISEMENT_CHECK: 'advertisement_check',
            PRAYER_UPDATE: 'prayer_update',
            CLEANUP: 'cleanup'
        };
        
        // Event listeners
        this.eventListeners = {
            'workStarted': [],
            'workCompleted': [],
            'workFailed': [],
            'workerStarted': [],
            'workerStopped': []
        };
    }

    /**
     * Initialize worker manager
     * Mirrors: MyWorker constructor and initialization
     */
    async initialize() {
        try {
            console.log(`[${this.TAG}] Initializing worker manager`);
            
            // Create worker pool
            await this.createWorkerPool();
            
            // Load any pending work from database
            await this.loadPendingWork();
            
            // Start work processing
            this.startWorkProcessing();
            
            this.isRunning = true;
            console.log(`[${this.TAG}] Worker manager initialized successfully`);
        } catch (error) {
            this.handleError(error, 'initialize');
            throw error;
        }
    }

    /**
     * Stop worker manager
     */
    async stop() {
        try {
            console.log(`[${this.TAG}] Stopping worker manager`);
            
            this.isRunning = false;
            
            // Stop all active workers
            await this.stopAllWorkers();
            
            // Save pending work to database
            await this.savePendingWork();
            
            console.log(`[${this.TAG}] Worker manager stopped`);
        } catch (error) {
            this.handleError(error, 'stop');
            throw error;
        }
    }

    /**
     * Create worker pool
     */
    async createWorkerPool() {
        try {
            console.log(`[${this.TAG}] Creating worker pool`);
            
            for (let i = 0; i < this.MAX_CONCURRENT_WORKERS; i++) {
                const worker = await this.createWorker(i);
                this.workers.set(i, worker);
            }
            
            console.log(`[${this.TAG}] Created ${this.MAX_CONCURRENT_WORKERS} workers`);
        } catch (error) {
            this.handleError(error, 'createWorkerPool');
            throw error;
        }
    }

    /**
     * Create individual worker
     */
    async createWorker(workerId) {
        try {
            console.log(`[${this.TAG}] Creating worker ${workerId}`);
            
            const worker = {
                id: workerId,
                isBusy: false,
                currentWork: null,
                startTime: null,
                worker: null,
                timeout: null
            };
            
            // Create Web Worker for background processing
            if (typeof Worker !== 'undefined') {
                worker.worker = new Worker(this.getWorkerScriptUrl());
                worker.worker.onmessage = this.handleWorkerMessage.bind(this, workerId);
                worker.worker.onerror = this.handleWorkerError.bind(this, workerId);
            }
            
            return worker;
        } catch (error) {
            this.handleError(error, 'createWorker');
            throw error;
        }
    }

    /**
     * Get worker script URL
     */
    getWorkerScriptUrl() {
        // Return the URL to the worker script
        return 'js/workers/backgroundWorker.js';
    }

    /**
     * Load pending work from database
     */
    async loadPendingWork() {
        try {
            console.log(`[${this.TAG}] Loading pending work from database`);
            
            // In a real implementation, this would load from a work queue table
            // For now, we'll start with an empty queue
            this.workQueue = [];
            
            console.log(`[${this.TAG}] Loaded ${this.workQueue.length} pending work items`);
        } catch (error) {
            this.handleError(error, 'loadPendingWork');
            throw error;
        }
    }

    /**
     * Save pending work to database
     */
    async savePendingWork() {
        try {
            console.log(`[${this.TAG}] Saving pending work to database`);
            
            // In a real implementation, this would save to a work queue table
            // For now, we'll just log the pending work
            console.log(`[${this.TAG}] Saved ${this.workQueue.length} pending work items`);
        } catch (error) {
            this.handleError(error, 'savePendingWork');
            throw error;
        }
    }

    /**
     * Start work processing
     */
    startWorkProcessing() {
        try {
            console.log(`[${this.TAG}] Starting work processing`);
            
            // Process work queue continuously
            setInterval(() => {
                if (this.isRunning) {
                    this.processWorkQueue();
                }
            }, 1000); // Check every second
            
            console.log(`[${this.TAG}] Work processing started`);
        } catch (error) {
            this.handleError(error, 'startWorkProcessing');
            throw error;
        }
    }

    /**
     * Process work queue
     */
    async processWorkQueue() {
        try {
            // Find available workers
            const availableWorkers = Array.from(this.workers.values())
                .filter(worker => !worker.isBusy);
            
            if (availableWorkers.length === 0 || this.workQueue.length === 0) {
                return;
            }
            
            // Assign work to available workers
            const workersToUse = Math.min(availableWorkers.length, this.workQueue.length);
            
            for (let i = 0; i < workersToUse; i++) {
                const worker = availableWorkers[i];
                const work = this.workQueue.shift();
                
                await this.assignWorkToWorker(worker, work);
            }
        } catch (error) {
            this.handleError(error, 'processWorkQueue');
            throw error;
        }
    }

    /**
     * Assign work to worker
     */
    async assignWorkToWorker(worker, work) {
        try {
            console.log(`[${this.TAG}] Assigning work ${work.type} to worker ${worker.id}`);
            
            worker.isBusy = true;
            worker.currentWork = work;
            worker.startTime = new Date();
            
            // Set timeout for work completion
            worker.timeout = setTimeout(() => {
                this.handleWorkerTimeout(worker.id);
            }, this.WORKER_TIMEOUT);
            
            // Send work to worker
            if (worker.worker) {
                worker.worker.postMessage({
                    action: 'execute',
                    work: work
                });
            } else {
                // Fallback to direct execution
                await this.executeWorkDirectly(worker, work);
            }
            
            this.activeWorkers.add(worker.id);
            this.emitEvent('workStarted', { workerId: worker.id, work: work });
            
        } catch (error) {
            this.handleError(error, 'assignWorkToWorker');
            throw error;
        }
    }

    /**
     * Execute work directly (fallback)
     */
    async executeWorkDirectly(worker, work) {
        try {
            console.log(`[${this.TAG}] Executing work ${work.type} directly`);
            
            let result;
            
            switch (work.type) {
                case this.WORK_TYPES.CONTENT_REFRESH:
                    result = await this.executeContentRefresh(work.data);
                    break;
                case this.WORK_TYPES.DOWNLOAD_QUEUE:
                    result = await this.executeDownloadQueue(work.data);
                    break;
                case this.WORK_TYPES.STATUS_REPORT:
                    result = await this.executeStatusReport(work.data);
                    break;
                case this.WORK_TYPES.PLAYLIST_CHECK:
                    result = await this.executePlaylistCheck(work.data);
                    break;
                case this.WORK_TYPES.ADVERTISEMENT_CHECK:
                    result = await this.executeAdvertisementCheck(work.data);
                    break;
                case this.WORK_TYPES.PRAYER_UPDATE:
                    result = await this.executePrayerUpdate(work.data);
                    break;
                case this.WORK_TYPES.CLEANUP:
                    result = await this.executeCleanup(work.data);
                    break;
                default:
                    throw new Error(`Unknown work type: ${work.type}`);
            }
            
            this.handleWorkCompletion(worker.id, result);
        } catch (error) {
            this.handleWorkError(worker.id, error);
        }
    }

    /**
     * Execute content refresh work
     */
    async executeContentRefresh(data) {
        try {
            console.log(`[${this.TAG}] Executing content refresh`);
            
            // Refresh playlists
            if (this.apiClient) {
                const token = await this.getCurrentToken();
                if (token) {
                    const playlists = await this.apiClient.getPlaylists(token);
                    const playlistDAO = this.dbManager.getDAO('playlistDAO');
                    
                    if (playlistDAO) {
                        for (const playlist of playlists) {
                            await playlistDAO.createOrUpdatePlaylist(playlist);
                        }
                    }
                }
            }
            
            return { success: true, message: 'Content refreshed successfully' };
        } catch (error) {
            throw new Error(`Content refresh failed: ${error.message}`);
        }
    }

    /**
     * Execute download queue work
     */
    async executeDownloadQueue(data) {
        try {
            console.log(`[${this.TAG}] Executing download queue`);
            
            // Get songs that need downloading
            const songsDAO = this.dbManager.getDAO('songsDAO');
            if (songsDAO) {
                const nonDownloadedSongs = await songsDAO.getUnschdSongsThoseAreNotDownloaded();
                
                // Queue downloads (actual download logic would be in DownloadManager)
                console.log(`[${this.TAG}] Found ${nonDownloadedSongs.length} songs to download`);
            }
            
            return { success: true, message: 'Download queue processed' };
        } catch (error) {
            throw new Error(`Download queue failed: ${error.message}`);
        }
    }

    /**
     * Execute status report work
     */
    async executeStatusReport(data) {
        try {
            console.log(`[${this.TAG}] Executing status report`);
            
            // Report any pending statuses
            const playerStatusDAO = this.dbManager.getDAO('playerStatusDAO');
            if (playerStatusDAO) {
                const recentStatuses = await playerStatusDAO.getRecentStatuses(10);
                
                // Send statuses to server (via API client)
                console.log(`[${this.TAG}] Found ${recentStatuses.length} statuses to report`);
            }
            
            return { success: true, message: 'Status report completed' };
        } catch (error) {
            throw new Error(`Status report failed: ${error.message}`);
        }
    }

    /**
     * Execute playlist check work
     */
    async executePlaylistCheck(data) {
        try {
            console.log(`[${this.TAG}] Executing playlist check`);
            
            const playlistDAO = this.dbManager.getDAO('playlistDAO');
            if (playlistDAO) {
                const currentPlaylist = await playlistDAO.getCurrentActivePlaylist();
                console.log(`[${this.TAG}] Current active playlist: ${currentPlaylist ? currentPlaylist.sp_name : 'None'}`);
            }
            
            return { success: true, message: 'Playlist check completed' };
        } catch (error) {
            throw new Error(`Playlist check failed: ${error.message}`);
        }
    }

    /**
     * Execute advertisement check work
     */
    async executeAdvertisementCheck(data) {
        try {
            console.log(`[${this.TAG}] Executing advertisement check`);
            
            const advertisementDAO = this.dbManager.getDAO('advertisementDAO');
            if (advertisementDAO) {
                const activeAds = await advertisementDAO.getActiveAdvertisements();
                console.log(`[${this.TAG}] Found ${activeAds.length} active advertisements`);
            }
            
            return { success: true, message: 'Advertisement check completed' };
        } catch (error) {
            throw new Error(`Advertisement check failed: ${error.message}`);
        }
    }

    /**
     * Execute prayer update work
     */
    async executePrayerUpdate(data) {
        try {
            console.log(`[${this.TAG}] Executing prayer update`);
            
            const prayerDAO = this.dbManager.getDAO('prayerDAO');
            if (prayerDAO) {
                const currentPrayer = await prayerDAO.getCurrentActivePrayerWindow();
                console.log(`[${this.TAG}] Current prayer window: ${currentPrayer ? currentPrayer.prayer_name : 'None'}`);
            }
            
            return { success: true, message: 'Prayer update completed' };
        } catch (error) {
            throw new Error(`Prayer update failed: ${error.message}`);
        }
    }

    /**
     * Execute cleanup work
     */
    async executeCleanup(data) {
        try {
            console.log(`[${this.TAG}] Executing cleanup`);
            
            // Clean up old statuses
            const playerStatusDAO = this.dbManager.getDAO('playerStatusDAO');
            if (playerStatusDAO) {
                await playerStatusDAO.deleteOldStatuses(30); // Keep 30 days
            }
            
            // Clean up old prayers
            const prayerDAO = this.dbManager.getDAO('prayerDAO');
            if (prayerDAO) {
                await prayerDAO.deleteOldPrayers(7); // Keep 7 days
            }
            
            return { success: true, message: 'Cleanup completed' };
        } catch (error) {
            throw new Error(`Cleanup failed: ${error.message}`);
        }
    }

    /**
     * Handle worker message
     */
    handleWorkerMessage(workerId, event) {
        try {
            const worker = this.workers.get(workerId);
            if (!worker) return;
            
            const { action, data } = event.data;
            
            switch (action) {
                case 'completed':
                    this.handleWorkCompletion(workerId, data);
                    break;
                case 'error':
                    this.handleWorkError(workerId, new Error(data.message));
                    break;
                case 'progress':
                    this.handleWorkProgress(workerId, data);
                    break;
                default:
                    console.log(`[${this.TAG}] Unknown worker message action: ${action}`);
            }
        } catch (error) {
            this.handleError(error, 'handleWorkerMessage');
        }
    }

    /**
     * Handle worker error
     */
    handleWorkerError(workerId, error) {
        try {
            const worker = this.workers.get(workerId);
            if (!worker) return;
            
            console.error(`[${this.TAG}] Worker ${workerId} error:`, error);
            
            // Clear timeout
            if (worker.timeout) {
                clearTimeout(worker.timeout);
                worker.timeout = null;
            }
            
            // Reset worker state
            worker.isBusy = false;
            worker.currentWork = null;
            worker.startTime = null;
            
            this.activeWorkers.delete(workerId);
            
            // Retry work if retry limit not reached
            if (worker.currentWork && worker.currentWork.retryCount < this.RETRY_LIMIT) {
                worker.currentWork.retryCount = (worker.currentWork.retryCount || 0) + 1;
                this.workQueue.unshift(worker.currentWork);
                console.log(`[${this.TAG}] Retrying work ${worker.currentWork.type} (attempt ${worker.currentWork.retryCount})`);
            }
            
            this.emitEvent('workFailed', { workerId, error: error.message, work: worker.currentWork });
        } catch (e) {
            console.error(`[${this.TAG}] Error handling worker error:`, e);
        }
    }

    /**
     * Handle worker timeout
     */
    handleWorkerTimeout(workerId) {
        try {
            const worker = this.workers.get(workerId);
            if (!worker) return;
            
            console.error(`[${this.TAG}] Worker ${workerId} timeout`);
            
            // Terminate worker
            if (worker.worker) {
                worker.worker.terminate();
            }
            
            // Handle as error
            this.handleWorkerError(workerId, new Error('Worker timeout'));
        } catch (error) {
            this.handleError(error, 'handleWorkerTimeout');
        }
    }

    /**
     * Handle work completion
     */
    handleWorkCompletion(workerId, result) {
        try {
            const worker = this.workers.get(workerId);
            if (!worker) return;
            
            console.log(`[${this.TAG}] Worker ${workerId} completed work ${worker.currentWork?.type}`);
            
            // Clear timeout
            if (worker.timeout) {
                clearTimeout(worker.timeout);
                worker.timeout = null;
            }
            
            // Reset worker state
            worker.isBusy = false;
            const completedWork = worker.currentWork;
            worker.currentWork = null;
            worker.startTime = null;
            
            this.activeWorkers.delete(workerId);
            
            this.emitEvent('workCompleted', { workerId, work: completedWork, result });
        } catch (error) {
            this.handleError(error, 'handleWorkCompletion');
        }
    }

    /**
     * Handle work progress
     */
    handleWorkProgress(workerId, progressData) {
        try {
            console.log(`[${this.TAG}] Worker ${workerId} progress:`, progressData);
            // Emit progress event if needed
        } catch (error) {
            this.handleError(error, 'handleWorkProgress');
        }
    }

    /**
     * Queue work
     */
    queueWork(workType, data, priority = 0) {
        try {
            const work = {
                id: this.generateWorkId(),
                type: workType,
                data: data,
                priority: priority,
                queuedAt: new Date(),
                retryCount: 0
            };
            
            // Insert into queue based on priority
            const insertIndex = this.workQueue.findIndex(w => w.priority < priority);
            if (insertIndex === -1) {
                this.workQueue.push(work);
            } else {
                this.workQueue.splice(insertIndex, 0, work);
            }
            
            console.log(`[${this.TAG}] Queued work ${workType} with priority ${priority}`);
            return work.id;
        } catch (error) {
            this.handleError(error, 'queueWork');
            throw error;
        }
    }

    /**
     * Generate work ID
     */
    generateWorkId() {
        return `work_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get current token
     */
    async getCurrentToken() {
        try {
            // Get token from preferences or storage
            return localStorage.getItem('token_id') || localStorage.getItem('login') || null;
        } catch (error) {
            console.warn(`[${this.TAG}] Could not get current token:`, error);
            return null;
        }
    }

    /**
     * Stop all workers
     */
    async stopAllWorkers() {
        try {
            console.log(`[${this.TAG}] Stopping all workers`);
            
            for (const [workerId, worker] of this.workers) {
                if (worker.timeout) {
                    clearTimeout(worker.timeout);
                    worker.timeout = null;
                }
                
                if (worker.worker) {
                    worker.worker.terminate();
                }
            }
            
            this.activeWorkers.clear();
            console.log(`[${this.TAG}] All workers stopped`);
        } catch (error) {
            this.handleError(error, 'stopAllWorkers');
            throw error;
        }
    }

    /**
     * Get worker status
     */
    getWorkerStatus() {
        return {
            isRunning: this.isRunning,
            totalWorkers: this.workers.size,
            activeWorkers: this.activeWorkers.size,
            queuedWork: this.workQueue.length,
            workers: Array.from(this.workers.values()).map(worker => ({
                id: worker.id,
                isBusy: worker.isBusy,
                currentWork: worker.currentWork?.type,
                startTime: worker.startTime
            }))
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
        throw new Error(`${operation} failed: ${error.message}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkerManager;
} else if (typeof window !== 'undefined') {
    window.WorkerManager = WorkerManager;
}
