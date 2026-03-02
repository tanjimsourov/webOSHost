/**
 * AdvertisementPlayer - Mirrors Lvideoads.java functionality
 * Complete advertisement playback system for webOS Signage
 */

class AdvertisementPlayer {
    constructor(config = {}) {
        this.TAG = 'AdvertisementPlayer';
        
        // Player configuration
        this.config = {
            autoPlay: config.autoPlay || true,
            loop: config.loop || false,
            volume: config.volume || 1.0,
            hardwareAcceleration: config.hardwareAcceleration !== false,
            preload: config.preload || 'metadata',
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };
        
        // Player state
        this.videoElement = null;
        this.currentAdvertisement = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.isEnded = false;
        this.duration = 0;
        this.currentTime = 0;
        this.retryCount = 0;
        
        // Advertisement queue
        this.advertisementQueue = [];
        this.currentQueueIndex = 0;
        
        // Event listeners
        this.eventListeners = {
            'started': [],
            'paused': [],
            'stopped': [],
            'completed': [],
            'error': [],
            'progress': [],
            'timeupdate': [],
            'impression': []
        };
        
        // Playback callbacks
        this.callbacks = {};
        
        // Initialize player
        this.initializePlayer();
    }

    /**
     * Initialize advertisement player
     * Mirrors: Lvideoads constructor and setup
     */
    initializePlayer() {
        try {
            console.log(`[${this.TAG}] Initializing advertisement player`);
            
            // Create video element
            this.createVideoElement();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Apply configuration
            this.applyConfiguration();
            
            console.log(`[${this.TAG}] Advertisement player initialized`);
        } catch (error) {
            this.handleError(error, 'initializePlayer');
            throw error;
        }
    }

    /**
     * Create video element for advertisements
     */
    createVideoElement() {
        try {
            // Create or get existing advertisement video element
            this.videoElement = document.getElementById('advertisementPlayer');
            
            if (!this.videoElement) {
                this.videoElement = document.createElement('video');
                this.videoElement.id = 'advertisementPlayer';
                this.videoElement.style.display = 'none';
                this.videoElement.style.position = 'absolute';
                this.videoElement.style.top = '0';
                this.videoElement.style.left = '0';
                this.videoElement.style.width = '100%';
                this.videoElement.style.height = '100%';
                this.videoElement.style.zIndex = '9999';
                document.body.appendChild(this.videoElement);
            }
            
            // Set video element attributes for advertisements
            this.videoElement.setAttribute('playsinline', 'true');
            this.videoElement.setAttribute('webkit-playsinline', 'true');
            this.videoElement.setAttribute('x-webkit-airplay', 'allow');
            
            // Enable hardware acceleration
            if (this.config.hardwareAcceleration) {
                this.videoElement.style.transform = 'translateZ(0)';
                this.videoElement.style.webkitTransform = 'translateZ(0)';
            }
            
            console.log(`[${this.TAG}] Advertisement video element created`);
        } catch (error) {
            this.handleError(error, 'createVideoElement');
            throw error;
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        try {
            // Load start
            this.videoElement.addEventListener('loadstart', this.handleLoadStart.bind(this));
            
            // Loaded metadata
            this.videoElement.addEventListener('loadedmetadata', this.handleLoadedMetadata.bind(this));
            
            // Loaded data
            this.videoElement.addEventListener('loadeddata', this.handleLoadedData.bind(this));
            
            // Can play
            this.videoElement.addEventListener('canplay', this.handleCanPlay.bind(this));
            
            // Can play through
            this.videoElement.addEventListener('canplaythrough', this.handleCanPlayThrough.bind(this));
            
            // Play
            this.videoElement.addEventListener('play', this.handlePlay.bind(this));
            
            // Pause
            this.videoElement.addEventListener('pause', this.handlePause.bind(this));
            
            // Ended
            this.videoElement.addEventListener('ended', this.handleEnded.bind(this));
            
            // Error
            this.videoElement.addEventListener('error', this.handleErrorEvent.bind(this));
            
            // Time update
            this.videoElement.addEventListener('timeupdate', this.handleTimeUpdate.bind(this));
            
            // Progress
            this.videoElement.addEventListener('progress', this.handleProgress.bind(this));
            
            // Volume change
            this.videoElement.addEventListener('volumechange', this.handleVolumeChange.bind(this));
            
            console.log(`[${this.TAG}] Advertisement event listeners set up`);
        } catch (error) {
            this.handleError(error, 'setupEventListeners');
            throw error;
        }
    }

    /**
     * Apply configuration
     */
    applyConfiguration() {
        try {
            // Set volume
            this.videoElement.volume = this.config.volume;
            
            // Set loop
            this.videoElement.loop = this.config.loop;
            
            // Set preload
            this.videoElement.preload = this.config.preload;
            
            // Set autoplay
            this.videoElement.autoplay = this.config.autoPlay;
            
            // Set controls (hidden for advertisements)
            this.videoElement.controls = false;
            
            // Muted initially for autoplay policies
            this.videoElement.muted = true;
            
            console.log(`[${this.TAG}] Advertisement configuration applied`);
        } catch (error) {
            this.handleError(error, 'applyConfiguration');
            throw error;
        }
    }

    /**
     * Play advertisement
     * Mirrors: Lvideoads playAdvertisement() method
     */
    async play(advertisementData, callbacks = {}) {
        try {
            console.log(`[${this.TAG}] Playing advertisement: ${advertisementData.adv_name || advertisementData.adv_id}`);
            
            // Set callbacks
            this.callbacks = callbacks;
            
            // Set current advertisement
            this.currentAdvertisement = advertisementData;
            this.retryCount = 0;
            
            // Reset state
            this.isEnded = false;
            this.isPaused = false;
            
            // Show advertisement element
            this.showAdvertisementElement();
            
            // Set advertisement source
            await this.setAdvertisementSource(advertisementData);
            
            // Load and play
            await this.loadAndPlay();
            
            // Report impression
            this.reportImpression(advertisementData);
            
            // Unmute after successful play
            setTimeout(() => {
                if (this.videoElement && this.isPlaying) {
                    this.videoElement.muted = false;
                }
            }, 100);
            
            console.log(`[${this.TAG}] Advertisement playback started`);
            return true;
        } catch (error) {
            this.handleError(error, 'play');
            throw error;
        }
    }

    /**
     * Set advertisement source
     */
    async setAdvertisementSource(advertisementData) {
        try {
            // Get advertisement URL
            const advertisementUrl = this.getAdvertisementUrl(advertisementData);
            
            if (!advertisementUrl) {
                throw new Error('No advertisement URL available');
            }
            
            // Set source
            this.videoElement.src = advertisementUrl;
            
            // Set poster if available
            if (advertisementData.poster_url) {
                this.videoElement.poster = advertisementData.poster_url;
            }
            
            console.log(`[${this.TAG}] Advertisement source set: ${advertisementUrl}`);
        } catch (error) {
            this.handleError(error, 'setAdvertisementSource');
            throw error;
        }
    }

    /**
     * Get advertisement URL
     */
    getAdvertisementUrl(advertisementData) {
        // Try different URL fields
        return advertisementData.adv_path || 
               advertisementData.adv_file_url || 
               advertisementData.url || 
               advertisementData.src;
    }

    /**
     * Load and play advertisement
     */
    async loadAndPlay() {
        try {
            // Load advertisement
            await this.videoElement.load();
            
            // Wait for advertisement to be ready
            await this.waitForAdvertisementReady();
            
            // Play advertisement
            await this.videoElement.play();
            
            // Update state
            this.isPlaying = true;
            
            // Emit started event
            this.emitEvent('started', {
                advertisement: this.currentAdvertisement,
                duration: this.duration,
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Advertisement loaded and playing`);
        } catch (error) {
            // Retry if possible
            if (this.retryCount < this.config.maxRetries) {
                console.warn(`[${this.TAG}] Retrying advertisement play (${this.retryCount + 1}/${this.config.maxRetries})`);
                this.retryCount++;
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                
                // Retry play
                return await this.loadAndPlay();
            } else {
                this.handleError(error, 'loadAndPlay');
                throw error;
            }
        }
    }

    /**
     * Wait for advertisement to be ready
     */
    async waitForAdvertisementReady() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Advertisement ready timeout'));
            }, 10000); // 10 second timeout
            
            const checkReady = () => {
                if (this.videoElement.readyState >= 3) { // HAVE_FUTURE_DATA
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            
            checkReady();
        });
    }

    /**
     * Show advertisement element
     */
    showAdvertisementElement() {
        try {
            this.videoElement.style.display = 'block';
            console.log(`[${this.TAG}] Advertisement element shown`);
        } catch (error) {
            console.error(`[${this.TAG}] Error showing advertisement element:`, error);
        }
    }

    /**
     * Hide advertisement element
     */
    hideAdvertisementElement() {
        try {
            this.videoElement.style.display = 'none';
            console.log(`[${this.TAG}] Advertisement element hidden`);
        } catch (error) {
            console.error(`[${this.TAG}] Error hiding advertisement element:`, error);
        }
    }

    /**
     * Pause advertisement
     */
    async pause() {
        try {
            if (!this.isPlaying || this.isPaused) {
                return;
            }
            
            this.videoElement.pause();
            
            console.log(`[${this.TAG}] Advertisement paused`);
        } catch (error) {
            this.handleError(error, 'pause');
            throw error;
        }
    }

    /**
     * Resume advertisement
     */
    async resume() {
        try {
            if (!this.isPlaying || !this.isPaused) {
                return;
            }
            
            await this.videoElement.play();
            
            console.log(`[${this.TAG}] Advertisement resumed`);
        } catch (error) {
            this.handleError(error, 'resume');
            throw error;
        }
    }

    /**
     * Stop advertisement
     */
    async stop() {
        try {
            if (!this.isPlaying) {
                return;
            }
            
            // Pause advertisement
            this.videoElement.pause();
            
            // Reset to beginning
            this.videoElement.currentTime = 0;
            
            // Clear source
            this.videoElement.src = '';
            
            // Hide advertisement element
            this.hideAdvertisementElement();
            
            // Update state
            this.isPlaying = false;
            this.isPaused = false;
            this.isEnded = false;
            this.currentAdvertisement = null;
            this.retryCount = 0;
            
            // Emit stopped event
            this.emitEvent('stopped', {
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Advertisement stopped`);
        } catch (error) {
            this.handleError(error, 'stop');
            throw error;
        }
    }

    /**
     * Queue multiple advertisements
     */
    queueAdvertisements(advertisements) {
        try {
            console.log(`[${this.TAG}] Queuing ${advertisements.length} advertisements`);
            
            this.advertisementQueue = [...advertisements];
            this.currentQueueIndex = 0;
            
            console.log(`[${this.TAG}] Advertisement queue created`);
        } catch (error) {
            this.handleError(error, 'queueAdvertisements');
            throw error;
        }
    }

    /**
     * Play next advertisement in queue
     */
    async playNextInQueue() {
        try {
            if (this.currentQueueIndex >= this.advertisementQueue.length) {
                console.log(`[${this.TAG}] Advertisement queue completed`);
                return false;
            }
            
            const nextAdvertisement = this.advertisementQueue[this.currentQueueIndex];
            this.currentQueueIndex++;
            
            await this.play(nextAdvertisement);
            
            return true;
        } catch (error) {
            this.handleError(error, 'playNextInQueue');
            throw error;
        }
    }

    /**
     * Set volume
     */
    setVolume(volume) {
        try {
            const clampedVolume = Math.max(0, Math.min(1, volume));
            this.videoElement.volume = clampedVolume;
            this.config.volume = clampedVolume;
            
            console.log(`[${this.TAG}] Advertisement volume set to: ${clampedVolume}`);
        } catch (error) {
            this.handleError(error, 'setVolume');
            throw error;
        }
    }

    /**
     * Mute/unmute
     */
    setMuted(muted) {
        try {
            this.videoElement.muted = muted;
            console.log(`[${this.TAG}] Advertisement ${muted ? 'muted' : 'unmuted'}`);
        } catch (error) {
            this.handleError(error, 'setMuted');
            throw error;
        }
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            this.applyConfiguration();
            
            console.log(`[${this.TAG}] Advertisement configuration updated`);
        } catch (error) {
            this.handleError(error, 'updateConfig');
            throw error;
        }
    }

    /**
     * Report advertisement impression
     */
    reportImpression(advertisementData) {
        try {
            console.log(`[${this.TAG}] Reporting impression for advertisement: ${advertisementData.adv_id}`);
            
            // Emit impression event
            this.emitEvent('impression', {
                advertisement: advertisementData,
                timestamp: new Date()
            });
            
            // In a real implementation, this would send impression data to server
            // For now, we'll just log it
            if (this.callbacks.onImpression) {
                this.callbacks.onImpression(advertisementData);
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error reporting impression:`, error);
        }
    }

    /**
     * Get player status
     */
    getPlayerStatus() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            isEnded: this.isEnded,
            currentTime: this.currentTime,
            duration: this.duration,
            volume: this.videoElement.volume,
            muted: this.videoElement.muted,
            currentAdvertisement: this.currentAdvertisement,
            retryCount: this.retryCount,
            queueLength: this.advertisementQueue.length,
            currentQueueIndex: this.currentQueueIndex,
            readyState: this.videoElement.readyState,
            networkState: this.videoElement.networkState
        };
    }

    /**
     * Event handlers
     */
    handleLoadStart(event) {
        console.log(`[${this.TAG}] Advertisement load start`);
    }

    handleLoadedMetadata(event) {
        try {
            this.duration = this.videoElement.duration;
            console.log(`[${this.TAG}] Advertisement metadata loaded, duration: ${this.duration}s`);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling loaded metadata:`, error);
        }
    }

    handleLoadedData(event) {
        console.log(`[${this.TAG}] Advertisement data loaded`);
    }

    handleCanPlay(event) {
        console.log(`[${this.TAG}] Advertisement can play`);
    }

    handleCanPlayThrough(event) {
        console.log(`[${this.TAG}] Advertisement can play through`);
    }

    handlePlay(event) {
        try {
            this.isPlaying = true;
            this.isPaused = false;
            
            console.log(`[${this.TAG}] Advertisement playing`);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling play:`, error);
        }
    }

    handlePause(event) {
        try {
            this.isPaused = true;
            
            // Emit paused event
            this.emitEvent('paused', {
                advertisement: this.currentAdvertisement,
                currentTime: this.currentTime,
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Advertisement paused`);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling pause:`, error);
        }
    }

    handleEnded(event) {
        try {
            this.isPlaying = false;
            this.isPaused = false;
            this.isEnded = true;
            
            // Hide advertisement element
            this.hideAdvertisementElement();
            
            // Emit completed event
            this.emitEvent('completed', {
                advertisement: this.currentAdvertisement,
                duration: this.duration,
                timestamp: new Date()
            });
            
            // Play next in queue if available
            if (this.advertisementQueue.length > 0) {
                setTimeout(() => {
                    this.playNextInQueue().catch(error => {
                        console.error(`[${this.TAG}] Error playing next in queue:`, error);
                    });
                }, 1000);
            }
            
            console.log(`[${this.TAG}] Advertisement ended`);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling ended:`, error);
        }
    }

    handleErrorEvent(event) {
        try {
            const error = this.videoElement.error;
            console.error(`[${this.TAG}] Advertisement error:`, error);
            
            // Emit error event
            this.emitEvent('error', {
                advertisement: this.currentAdvertisement,
                error: {
                    code: error?.code,
                    message: error?.message
                },
                retryCount: this.retryCount,
                timestamp: new Date()
            });
        } catch (handlingError) {
            console.error(`[${this.TAG}] Error handling advertisement error:`, handlingError);
        }
    }

    handleTimeUpdate(event) {
        try {
            this.currentTime = this.videoElement.currentTime;
            
            // Emit time update event
            this.emitEvent('timeupdate', {
                currentTime: this.currentTime,
                duration: this.duration,
                progress: this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0
            });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling time update:`, error);
        }
    }

    handleProgress(event) {
        try {
            if (this.videoElement.buffered.length > 0) {
                const buffered = this.videoElement.buffered.end(0);
                const progress = this.duration > 0 ? (buffered / this.duration) * 100 : 0;
                
                // Emit progress event
                this.emitEvent('progress', {
                    buffered: buffered,
                    progress: progress,
                    duration: this.duration
                });
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error handling progress:`, error);
        }
    }

    handleVolumeChange(event) {
        console.log(`[${this.TAG}] Advertisement volume changed to: ${this.videoElement.volume}`);
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

    /**
     * Destroy player
     */
    destroy() {
        try {
            console.log(`[${this.TAG}] Destroying advertisement player`);
            
            // Stop playback
            this.stop();
            
            // Remove event listeners
            if (this.videoElement) {
                this.videoElement.removeEventListener('loadstart', this.handleLoadStart);
                this.videoElement.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
                this.videoElement.removeEventListener('loadeddata', this.handleLoadedData);
                this.videoElement.removeEventListener('canplay', this.handleCanPlay);
                this.videoElement.removeEventListener('canplaythrough', this.handleCanPlayThrough);
                this.videoElement.removeEventListener('play', this.handlePlay);
                this.videoElement.removeEventListener('pause', this.handlePause);
                this.videoElement.removeEventListener('ended', this.handleEnded);
                this.videoElement.removeEventListener('error', this.handleErrorEvent);
                this.videoElement.removeEventListener('timeupdate', this.handleTimeUpdate);
                this.videoElement.removeEventListener('progress', this.handleProgress);
                this.videoElement.removeEventListener('volumechange', this.handleVolumeChange);
                
                // Remove from DOM
                if (this.videoElement.parentNode) {
                    this.videoElement.parentNode.removeChild(this.videoElement);
                }
            }
            
            // Clear references
            this.videoElement = null;
            this.currentAdvertisement = null;
            this.advertisementQueue = [];
            this.eventListeners = {};
            this.callbacks = {};
            
            console.log(`[${this.TAG}] Advertisement player destroyed`);
        } catch (error) {
            console.error(`[${this.TAG}] Error destroying advertisement player:`, error);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvertisementPlayer;
} else if (typeof window !== 'undefined') {
    window.AdvertisementPlayer = AdvertisementPlayer;
}
