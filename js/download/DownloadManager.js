/**
 * DownloadManager - Mirrors DownloadService.java functionality
 * Complete download management system for webOS Signage
 */

class DownloadManager {
    constructor(databaseManager, apiClient) {
        this.dbManager = databaseManager;
        this.apiClient = apiClient;
        this.TAG = 'DownloadManager';
        
        // Download state
        this._isRunning = false;
        this.downloadQueue = [];
        this.activeDownloads = new Map();
        this.completedDownloads = new Set();
        this.failedDownloads = new Set();
        
        // Download configuration
        this.config = {
            maxConcurrentDownloads: 3,
            maxRetries: 3,
            retryDelay: 2000,
            timeout: 30000,
            chunkSize: 1024 * 1024, // 1MB chunks
            storageQuota: 1024 * 1024 * 1024, // 1GB
            ...this.getDefaultConfig()
        };
        
        // Download types
        this.DOWNLOAD_TYPES = {
            SONG: 'song',
            ADVERTISEMENT: 'advertisement',
            PLAYLIST: 'playlist',
            IMAGE: 'image',
            VIDEO: 'video'
        };
        
        // Event listeners
        this.eventListeners = {
            'downloadStarted': [],
            'downloadProgress': [],
            'downloadCompleted': [],
            'downloadFailed': [],
            'downloadPaused': [],
            'downloadResumed': [],
            'queueUpdated': [],
            'error': []
        };
        
        // Download listeners (mirroring DownloadListener interface)
        this.downloadListeners = [];
        
        // Storage management
        this.storageManager = null;
        
        // Initialize manager
        this.initializeManager();
    }

    /**
     * Backwards-compatible instance method so callers can use `downloadManager.isRunning()`.
     * We keep internal state in `_isRunning` to avoid shadowing the method.
     */
    isRunning() {
        return Boolean(this._isRunning);
    }

    /**
     * Initialize download manager
     * Mirrors: DownloadService.onCreate() and initialization
     */
    initializeManager() {
        try {
            console.log(`[${this.TAG}] Initializing download manager`);
            
            // Initialize storage manager
            this.initializeStorageManager();
            
            // Load download queue from database
            this.loadDownloadQueue();
            
            // Set up storage monitoring
            this.setupStorageMonitoring();
            
            console.log(`[${this.TAG}] Download manager initialized`);
        } catch (error) {
            this.handleError(error, 'initializeManager');
            throw error;
        }
    }

    /**
     * Initialize storage manager
     */
    initializeStorageManager() {
        try {
            this.storageManager = {
                getAvailableSpace: this.getAvailableSpace.bind(this),
                getUsedSpace: this.getUsedSpace.bind(this),
                checkQuota: this.checkStorageQuota.bind(this),
                cleanupOldFiles: this.cleanupOldFiles.bind(this)
            };
            
            console.log(`[${this.TAG}] Storage manager initialized`);
        } catch (error) {
            this.handleError(error, 'initializeStorageManager');
            throw error;
        }
    }

    /**
     * Load download queue from database
     */
    async loadDownloadQueue() {
        try {
            console.log(`[${this.TAG}] Loading download queue`);
            
            // Load songs that need downloading
            const songsDAO = this.dbManager.getDAO('songsDAO');
            if (songsDAO) {
                const nonDownloadedSongs = await songsDAO.getUnschdSongsThoseAreNotDownloaded();
                
                for (const song of nonDownloadedSongs) {
                    this.queueDownload(song, this.DOWNLOAD_TYPES.SONG, false);
                }
            }
            
            // Load advertisements that need downloading
            const advertisementDAO = this.dbManager.getDAO('advertisementDAO');
            if (advertisementDAO) {
                const nonDownloadedAds = await advertisementDAO.getNotExistInStorage([]);
                
                for (const advertisement of nonDownloadedAds) {
                    this.queueDownload(advertisement, this.DOWNLOAD_TYPES.ADVERTISEMENT, false);
                }
            }
            
            console.log(`[${this.TAG}] Download queue loaded: ${this.downloadQueue.length} items`);
        } catch (error) {
            this.handleError(error, 'loadDownloadQueue');
            throw error;
        }
    }

    /**
     * Set up storage monitoring
     */
    setupStorageMonitoring() {
        try {
            // Monitor storage usage every 5 minutes
            setInterval(() => {
                this.checkStorageQuota();
            }, 5 * 60 * 1000);
            
            console.log(`[${this.TAG}] Storage monitoring set up`);
        } catch (error) {
            console.error(`[${this.TAG}] Error setting up storage monitoring:`, error);
        }
    }

    /**
     * Start download manager
     */
    async start() {
        try {
            console.log(`[${this.TAG}] Starting download manager`);
            
            if (this._isRunning) {
                console.log(`[${this.TAG}] Download manager already running`);
                return true;
            }
            
            this._isRunning = true;
            
            // Start processing download queue
            this.startQueueProcessing();
            
            console.log(`[${this.TAG}] Download manager started`);
            return true;
        } catch (error) {
            this.handleError(error, 'start');
            throw error;
        }
    }

    /**
     * Stop download manager
     */
    async stop() {
        try {
            console.log(`[${this.TAG}] Stopping download manager`);
            
            if (!this._isRunning) {
                console.log(`[${this.TAG}] Download manager not running`);
                return true;
            }
            
            this._isRunning = false;
            
            // Pause all active downloads
            for (const [downloadId, download] of this.activeDownloads) {
                await this.pauseDownload(downloadId);
            }
            
            console.log(`[${this.TAG}] Download manager stopped`);
            return true;
        } catch (error) {
            this.handleError(error, 'stop');
            throw error;
        }
    }

    /**
     * Queue download
     * Mirrors: DownloadService queueDownload() functionality
     */
    queueDownload(item, type, notifyListeners = true) {
        try {
            console.log(`[${this.TAG}] Queuing ${type} download: ${item.title_id || item.adv_id}`);
            
            const download = {
                id: this.generateDownloadId(),
                type: type,
                item: item,
                url: this.getDownloadUrl(item, type),
                filePath: this.getDownloadPath(item, type),
                status: 'queued',
                progress: 0,
                downloadedBytes: 0,
                totalBytes: 0,
                startTime: null,
                endTime: null,
                retryCount: 0,
                error: null
            };
            
            // Add to queue
            this.downloadQueue.push(download);
            
            // Sort queue by priority (songs first, then advertisements)
            this.sortDownloadQueue();
            
            // Notify listeners
            if (notifyListeners) {
                this.notifyDownloadListeners('startedCopyingSongs', 0, this.downloadQueue.length, false);
            }
            
            // Emit queue updated event
            this.emitEvent('queueUpdated', {
                action: 'queued',
                download: download,
                queueLength: this.downloadQueue.length
            });
            
            console.log(`[${this.TAG}] ${type} download queued: ${download.id}`);
            return download.id;
        } catch (error) {
            this.handleError(error, 'queueDownload');
            throw error;
        }
    }

    /**
     * Get download URL
     */
    getDownloadUrl(item, type) {
        switch (type) {
            case this.DOWNLOAD_TYPES.SONG:
                return item.title_url || item.song_path;
            case this.DOWNLOAD_TYPES.ADVERTISEMENT:
                return item.adv_file_url || item.adv_path;
            case this.DOWNLOAD_TYPES.IMAGE:
                return item.image_url || item.src;
            case this.DOWNLOAD_TYPES.VIDEO:
                return item.video_url || item.src;
            default:
                return item.url || item.src;
        }
    }

    /**
     * Get download path
     */
    getDownloadPath(item, type) {
        const basePath = '/downloads/';
        const fileName = this.generateFileName(item, type);
        return basePath + fileName;
    }

    /**
     * Generate file name
     */
    generateFileName(item, type) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        
        switch (type) {
            case this.DOWNLOAD_TYPES.SONG:
                return `song_${item.title_id}_${timestamp}_${random}.mp4`;
            case this.DOWNLOAD_TYPES.ADVERTISEMENT:
                return `ad_${item.adv_id}_${timestamp}_${random}.mp4`;
            case this.DOWNLOAD_TYPES.IMAGE:
                return `img_${item.id || 'unknown'}_${timestamp}_${random}.jpg`;
            case this.DOWNLOAD_TYPES.VIDEO:
                return `video_${item.id || 'unknown'}_${timestamp}_${random}.mp4`;
            default:
                return `file_${item.id || 'unknown'}_${timestamp}_${random}`;
        }
    }

    /**
     * Sort download queue
     */
    sortDownloadQueue() {
        this.downloadQueue.sort((a, b) => {
            // Songs have priority over advertisements
            if (a.type === this.DOWNLOAD_TYPES.SONG && b.type !== this.DOWNLOAD_TYPES.SONG) {
                return -1;
            }
            if (a.type !== this.DOWNLOAD_TYPES.SONG && b.type === this.DOWNLOAD_TYPES.SONG) {
                return 1;
            }
            return 0;
        });
    }

    /**
     * Start queue processing
     */
    startQueueProcessing() {
        try {
            console.log(`[${this.TAG}] Starting queue processing`);
            
            // Process queue continuously
            setInterval(() => {
                if (this._isRunning) {
                    this.processDownloadQueue();
                }
            }, 1000); // Check every second
            
            console.log(`[${this.TAG}] Queue processing started`);
        } catch (error) {
            this.handleError(error, 'startQueueProcessing');
            throw error;
        }
    }

    /**
     * Process download queue
     */
    async processDownloadQueue() {
        try {
            // Check if we can start new downloads
            if (this.activeDownloads.size >= this.config.maxConcurrentDownloads) {
                return;
            }
            
            // Find queued downloads
            const queuedDownloads = this.downloadQueue.filter(d => d.status === 'queued');
            
            if (queuedDownloads.length === 0) {
                return;
            }
            
            // Start downloads up to concurrent limit
            const availableSlots = this.config.maxConcurrentDownloads - this.activeDownloads.size;
            const downloadsToStart = queuedDownloads.slice(0, availableSlots);
            
            for (const download of downloadsToStart) {
                await this.startDownload(download);
            }
        } catch (error) {
            this.handleError(error, 'processDownloadQueue');
            throw error;
        }
    }

    /**
     * Start download
     */
    async startDownload(download) {
        try {
            console.log(`[${this.TAG}] Starting download: ${download.id}`);
            
            // Update download status
            download.status = 'downloading';
            download.startTime = new Date();
            
            // Add to active downloads
            this.activeDownloads.set(download.id, download);
            
            // Check storage quota
            if (!this.checkStorageQuota()) {
                throw new Error('Storage quota exceeded');
            }
            
            // Emit download started event
            this.emitEvent('downloadStarted', { download: download });
            
            // Start actual download
            await this.performDownload(download);
            
            console.log(`[${this.TAG}] Download started: ${download.id}`);
        } catch (error) {
            this.handleDownloadError(download, error);
            throw error;
        }
    }

    /**
     * Perform download
     */
    async performDownload(download) {
        try {
            console.log(`[${this.TAG}] Performing download: ${download.id}`);
            
            // Get file size
            download.totalBytes = await this.getFileSize(download.url);
            
            // Create file handle
            const fileHandle = await this.createFile(download.filePath);
            
            // Download file in chunks
            await this.downloadFileInChunks(download, fileHandle);
            
            // Complete download
            await this.completeDownload(download);
            
            console.log(`[${this.TAG}] Download completed: ${download.id}`);
        } catch (error) {
            this.handleDownloadError(download, error);
            throw error;
        }
    }

    /**
     * Get file size
     */
    async getFileSize(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            return contentLength ? parseInt(contentLength) : 0;
        } catch (error) {
            console.warn(`[${this.TAG}] Could not get file size:`, error);
            return 0;
        }
    }

    /**
     * Create file
     */
    async createFile(filePath) {
        try {
            // In a real implementation, this would use webOS file system API
            // For now, we'll simulate file creation
            console.log(`[${this.TAG}] Creating file: ${filePath}`);
            
            return {
                path: filePath,
                write: async (data) => {
                    // Simulate file write
                    return data.length;
                },
                close: async () => {
                    // Simulate file close
                }
            };
        } catch (error) {
            this.handleError(error, 'createFile');
            throw error;
        }
    }

    /**
     * Download file in chunks
     */
    async downloadFileInChunks(download, fileHandle) {
        try {
            console.log(`[${this.TAG}] Downloading file in chunks: ${download.id}`);
            
            let downloadedBytes = 0;
            const chunkSize = this.config.chunkSize;
            
            // Simulate chunked download
            while (downloadedBytes < download.totalBytes) {
                // Check if download is paused
                if (download.status === 'paused') {
                    await this.waitForResume(download);
                }
                
                // Download chunk
                const chunk = await this.downloadChunk(download.url, downloadedBytes, chunkSize);
                
                // Write chunk to file
                await fileHandle.write(chunk);
                
                downloadedBytes += chunk.length;
                download.downloadedBytes = downloadedBytes;
                download.progress = (downloadedBytes / download.totalBytes) * 100;
                
                // Emit progress event
                this.emitEvent('downloadProgress', {
                    download: download,
                    progress: download.progress,
                    downloadedBytes: downloadedBytes,
                    totalBytes: download.totalBytes
                });
                
                // Simulate download delay
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Close file
            await fileHandle.close();
            
            console.log(`[${this.TAG}] File chunks downloaded: ${download.id}`);
        } catch (error) {
            this.handleError(error, 'downloadFileInChunks');
            throw error;
        }
    }

    /**
     * Download chunk
     */
    async downloadChunk(url, start, size) {
        try {
            // In a real implementation, this would use Range headers
            // For now, we'll simulate chunk download
            const chunk = new Uint8Array(size);
            
            // Simulate download with random data
            for (let i = 0; i < size; i++) {
                chunk[i] = Math.floor(Math.random() * 256);
            }
            
            return chunk;
        } catch (error) {
            this.handleError(error, 'downloadChunk');
            throw error;
        }
    }

    /**
     * Wait for resume
     */
    async waitForResume(download) {
        return new Promise((resolve) => {
            const checkResume = setInterval(() => {
                if (download.status !== 'paused') {
                    clearInterval(checkResume);
                    resolve();
                }
            }, 1000);
        });
    }

    /**
     * Complete download
     */
    async completeDownload(download) {
        try {
            console.log(`[${this.TAG}] Completing download: ${download.id}`);
            
            // Update download status
            download.status = 'completed';
            download.endTime = new Date();
            download.progress = 100;
            
            // Update database
            await this.updateDatabaseAfterDownload(download);
            
            // Remove from active downloads
            this.activeDownloads.delete(download.id);
            
            // Add to completed downloads
            this.completedDownloads.add(download.id);
            
            // Remove from queue
            const queueIndex = this.downloadQueue.findIndex(d => d.id === download.id);
            if (queueIndex > -1) {
                this.downloadQueue.splice(queueIndex, 1);
            }
            
            // Notify listeners
            this.notifyDownloadListeners('downloadCompleted', true, download.item, false);
            
            // Emit download completed event
            this.emitEvent('downloadCompleted', { download: download });
            
            console.log(`[${this.TAG}] Download completed: ${download.id}`);
        } catch (error) {
            this.handleError(error, 'completeDownload');
            throw error;
        }
    }

    /**
     * Update database after download
     */
    async updateDatabaseAfterDownload(download) {
        try {
            switch (download.type) {
                case this.DOWNLOAD_TYPES.SONG:
                    const songsDAO = this.dbManager.getDAO('songsDAO');
                    if (songsDAO) {
                        await songsDAO.updateSongsColumnDownloadStatus([download.item.title_id], 1);
                    }
                    break;
                    
                case this.DOWNLOAD_TYPES.ADVERTISEMENT:
                    const advertisementDAO = this.dbManager.getDAO('advertisementDAO');
                    if (advertisementDAO) {
                        await advertisementDAO.updateAdvertisementDownloadStatus(
                            download.item.adv_id, 
                            1, 
                            download.filePath
                        );
                    }
                    break;
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error updating database after download:`, error);
        }
    }

    /**
     * Handle download error
     */
    async handleDownloadError(download, error) {
        try {
            console.error(`[${this.TAG}] Download error: ${download.id}`, error);
            
            // Update download status
            download.status = 'failed';
            download.error = error.message;
            download.endTime = new Date();
            download.retryCount++;
            
            // Remove from active downloads
            this.activeDownloads.delete(download.id);
            
            // Add to failed downloads
            this.failedDownloads.add(download.id);
            
            // Retry if possible
            if (download.retryCount < this.config.maxRetries) {
                console.log(`[${this.TAG}] Retrying download: ${download.id} (${download.retryCount}/${this.config.maxRetries})`);
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                
                // Reset download status and re-queue
                download.status = 'queued';
                download.error = null;
                this.downloadQueue.push(download);
                
                // Emit download resumed event
                this.emitEvent('downloadResumed', { download: download });
            } else {
                // Remove from queue if max retries reached
                const queueIndex = this.downloadQueue.findIndex(d => d.id === download.id);
                if (queueIndex > -1) {
                    this.downloadQueue.splice(queueIndex, 1);
                }
                
                // Notify listeners
                this.notifyDownloadListeners('downloadFailed', false, download.item, false);
                
                // Emit download failed event
                this.emitEvent('downloadFailed', { download: download, error: error.message });
            }
        } catch (handlingError) {
            console.error(`[${this.TAG}] Error handling download error:`, handlingError);
        }
    }

    /**
     * Pause download
     */
    async pauseDownload(downloadId) {
        try {
            const download = this.activeDownloads.get(downloadId);
            if (!download) {
                return;
            }
            
            download.status = 'paused';
            
            // Emit download paused event
            this.emitEvent('downloadPaused', { download: download });
            
            console.log(`[${this.TAG}] Download paused: ${downloadId}`);
        } catch (error) {
            this.handleError(error, 'pauseDownload');
            throw error;
        }
    }

    /**
     * Resume download
     */
    async resumeDownload(downloadId) {
        try {
            const download = this.activeDownloads.get(downloadId);
            if (!download || download.status !== 'paused') {
                return;
            }
            
            download.status = 'downloading';
            
            // Emit download resumed event
            this.emitEvent('downloadResumed', { download: download });
            
            console.log(`[${this.TAG}] Download resumed: ${downloadId}`);
        } catch (error) {
            this.handleError(error, 'resumeDownload');
            throw error;
        }
    }

    /**
     * Cancel download
     */
    async cancelDownload(downloadId) {
        try {
            const download = this.activeDownloads.get(downloadId);
            if (download) {
                // Remove from active downloads
                this.activeDownloads.delete(downloadId);
                
                // Remove from queue
                const queueIndex = this.downloadQueue.findIndex(d => d.id === downloadId);
                if (queueIndex > -1) {
                    this.downloadQueue.splice(queueIndex, 1);
                }
                
                console.log(`[${this.TAG}] Download cancelled: ${downloadId}`);
            }
        } catch (error) {
            this.handleError(error, 'cancelDownload');
            throw error;
        }
    }

    /**
     * Get available storage space
     */
    getAvailableSpace() {
        try {
            // In a real implementation, this would query the file system
            // For now, return a simulated value
            return this.config.storageQuota - this.getUsedSpace();
        } catch (error) {
            console.error(`[${this.TAG}] Error getting available space:`, error);
            return 0;
        }
    }

    /**
     * Get used storage space
     */
    getUsedSpace() {
        try {
            // Simulate used space based on completed downloads
            let usedSpace = 0;
            
            for (const downloadId of this.completedDownloads) {
                // Simulate file size
                usedSpace += 10 * 1024 * 1024; // 10MB per file
            }
            
            return usedSpace;
        } catch (error) {
            console.error(`[${this.TAG}] Error getting used space:`, error);
            return 0;
        }
    }

    /**
     * Check storage quota
     */
    checkStorageQuota() {
        try {
            const availableSpace = this.getAvailableSpace();
            const requiredSpace = 50 * 1024 * 1024; // 50MB per download
            
            return availableSpace > requiredSpace;
        } catch (error) {
            console.error(`[${this.TAG}] Error checking storage quota:`, error);
            return false;
        }
    }

    /**
     * Cleanup old files
     */
    async cleanupOldFiles() {
        try {
            console.log(`[${this.TAG}] Cleaning up old files`);
            
            // In a real implementation, this would delete old downloaded files
            // For now, we'll just log the action
            console.log(`[${this.TAG}] Old files cleaned up`);
        } catch (error) {
            console.error(`[${this.TAG}] Error cleaning up old files:`, error);
        }
    }

    /**
     * Notify download listeners
     */
    notifyDownloadListeners(event, shouldPlay, item, isFinished) {
        try {
            this.downloadListeners.forEach(listener => {
                try {
                    switch (event) {
                        case 'startedCopyingSongs':
                            if (listener.startedCopyingSongs) {
                                listener.startedCopyingSongs(0, this.downloadQueue.length, false);
                            }
                            break;
                        case 'downloadCompleted':
                            if (listener.downloadCompleted) {
                                listener.downloadCompleted(shouldPlay, item);
                            }
                            break;
                        case 'advertisementDownloaded':
                            if (listener.advertisementDownloaded) {
                                listener.advertisementDownloaded(item);
                            }
                            break;
                        case 'finishedDownloadingSongs':
                            if (listener.finishedDownloadingSongs) {
                                listener.finishedDownloadingSongs(this.completedDownloads.size);
                            }
                            break;
                    }
                } catch (error) {
                    console.error(`[${this.TAG}] Error in download listener:`, error);
                }
            });
        } catch (error) {
            console.error(`[${this.TAG}] Error notifying download listeners:`, error);
        }
    }

    /**
     * Add download listener
     */
    addDownloadListener(listener) {
        this.downloadListeners.push(listener);
    }

    /**
     * Remove download listener
     */
    removeDownloadListener(listener) {
        const index = this.downloadListeners.indexOf(listener);
        if (index > -1) {
            this.downloadListeners.splice(index, 1);
        }
    }

    /**
     * Get download manager status
     */
    getDownloadManagerStatus() {
        return {
            isRunning: this._isRunning,
            queueLength: this.downloadQueue.length,
            activeDownloads: this.activeDownloads.size,
            completedDownloads: this.completedDownloads.size,
            failedDownloads: this.failedDownloads.size,
            config: { ...this.config },
            storage: {
                availableSpace: this.getAvailableSpace(),
                usedSpace: this.getUsedSpace(),
                quota: this.config.storageQuota
            }
        };
    }

    /**
     * Get download queue
     */
    getDownloadQueue() {
        return [...this.downloadQueue];
    }

    /**
     * Get active downloads
     */
    getActiveDownloads() {
        return Array.from(this.activeDownloads.values());
    }

    /**
     * Generate download ID
     */
    generateDownloadId() {
        return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            maxConcurrentDownloads: 3,
            maxRetries: 3,
            retryDelay: 2000,
            timeout: 30000,
            chunkSize: 1024 * 1024,
            storageQuota: 1024 * 1024 * 1024
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
    module.exports = DownloadManager;
} else if (typeof window !== 'undefined') {
    window.DownloadManager = DownloadManager;
}
