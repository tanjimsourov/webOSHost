/**
 * VideoPlayer - Mirrors MyClaudVideoView.java functionality
 * Complete video playback system for webOS Signage
 */

class VideoPlayer {
    constructor(config = {}) {
        this.TAG = 'VideoPlayer';
        
        // Player configuration
        this.config = {
            autoPlay: config.autoPlay || true,
            loop: config.loop || false,
            volume: config.volume || 1.0,
            hardwareAcceleration: config.hardwareAcceleration !== false,
            preload: config.preload || 'metadata',
            ...config
        };
        
        // Player state
        this.videoElement = null;
        this.currentMedia = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.isEnded = false;
        this.duration = 0;
        this.currentTime = 0;
        
        // Event listeners
        this.eventListeners = {
            'started': [],
            'paused': [],
            'stopped': [],
            'completed': [],
            'error': [],
            'progress': [],
            'timeupdate': []
        };
        
        // Playback callbacks
        this.callbacks = {};
        
        // Initialize player
        this.initializePlayer();
    }

    /**
     * Initialize video player
     * Mirrors: MyClaudVideoView constructor and setup
     */
    initializePlayer() {
        try {
            console.log(`[${this.TAG}] Initializing video player`);
            
            // Create video element
            this.createVideoElement();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Apply configuration
            this.applyConfiguration();
            
            console.log(`[${this.TAG}] Video player initialized`);
        } catch (error) {
            this.handleError(error, 'initializePlayer');
            throw error;
        }
    }

    /**
     * Create video element
     */
    createVideoElement() {
        try {
            // Create or get existing video element
            this.videoElement = document.getElementById('mainVideoPlayer');
            
            if (!this.videoElement) {
                this.videoElement = document.createElement('video');
                this.videoElement.id = 'mainVideoPlayer';
                this.videoElement.style.display = 'none';
                document.body.appendChild(this.videoElement);
            }
            
            // Set video element attributes
            this.videoElement.setAttribute('playsinline', 'true');
            this.videoElement.setAttribute('webkit-playsinline', 'true');
            this.videoElement.setAttribute('x-webkit-airplay', 'allow');
            
            // Enable hardware acceleration
            if (this.config.hardwareAcceleration) {
                this.videoElement.style.transform = 'translateZ(0)';
                this.videoElement.style.webkitTransform = 'translateZ(0)';
            }
            
            console.log(`[${this.TAG}] Video element created`);
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
            
            // Seeking
            this.videoElement.addEventListener('seeking', this.handleSeeking.bind(this));
            this.videoElement.addEventListener('seeked', this.handleSeeked.bind(this));
            
            // Volume change
            this.videoElement.addEventListener('volumechange', this.handleVolumeChange.bind(this));
            
            console.log(`[${this.TAG}] Event listeners set up`);
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
            
            // Set controls (hidden for signage)
            this.videoElement.controls = false;
            
            // Muted initially for autoplay policies
            this.videoElement.muted = true;
            
            console.log(`[${this.TAG}] Configuration applied`);
        } catch (error) {
            this.handleError(error, 'applyConfiguration');
            throw error;
        }
    }

    /**
     * Play media
     * Mirrors: MyClaudVideoView playVideo() method
     */
    async play(mediaData, callbacks = {}) {
        try {
            console.log(`[${this.TAG}] Playing video: ${mediaData.title || mediaData.title_id}`);
            
            // Set callbacks
            this.callbacks = callbacks;
            
            // Set current media
            this.currentMedia = mediaData;
            
            // Reset state
            this.isEnded = false;
            this.isPaused = false;
            
            // Set video source
            await this.setVideoSource(mediaData);
            
            // Load and play
            await this.loadAndPlay();
            
            // Unmute after successful play
            setTimeout(() => {
                if (this.videoElement && this.isPlaying) {
                    this.videoElement.muted = false;
                }
            }, 100);
            
            console.log(`[${this.TAG}] Video playback started`);
            return true;
        } catch (error) {
            this.handleError(error, 'play');
            throw error;
        }
    }

    /**
     * Set video source
     */
    async setVideoSource(mediaData) {
        try {
            // Get video URL
            const videoUrl = this.getVideoUrl(mediaData);
            
            if (!videoUrl) {
                throw new Error('No video URL available');
            }
            
            // Set source
            this.videoElement.src = videoUrl;
            
            // Set poster if available
            if (mediaData.poster_url) {
                this.videoElement.poster = mediaData.poster_url;
            }
            
            console.log(`[${this.TAG}] Video source set: ${videoUrl}`);
        } catch (error) {
            this.handleError(error, 'setVideoSource');
            throw error;
        }
    }

    /**
     * Get video URL
     */
    getVideoUrl(mediaData) {
        // Try different URL fields
        return mediaData.song_path || 
               mediaData.title_url || 
               mediaData.url || 
               mediaData.src;
    }

    /**
     * Load and play video
     */
    async loadAndPlay() {
        try {
            // Load video
            await this.videoElement.load();
            
            // Wait for video to be ready
            await this.waitForVideoReady();
            
            // Play video
            await this.videoElement.play();
            
            // Update state
            this.isPlaying = true;
            
            // Emit started event
            this.emitEvent('started', {
                media: this.currentMedia,
                duration: this.duration,
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Video loaded and playing`);
        } catch (error) {
            this.handleError(error, 'loadAndPlay');
            throw error;
        }
    }

    /**
     * Wait for video to be ready
     */
    async waitForVideoReady() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Video ready timeout'));
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
     * Pause video
     */
    async pause() {
        try {
            if (!this.isPlaying || this.isPaused) {
                return;
            }
            
            this.videoElement.pause();
            
            console.log(`[${this.TAG}] Video paused`);
        } catch (error) {
            this.handleError(error, 'pause');
            throw error;
        }
    }

    /**
     * Resume video
     */
    async resume() {
        try {
            if (!this.isPlaying || !this.isPaused) {
                return;
            }
            
            await this.videoElement.play();
            
            console.log(`[${this.TAG}] Video resumed`);
        } catch (error) {
            this.handleError(error, 'resume');
            throw error;
        }
    }

    /**
     * Stop video
     */
    async stop() {
        try {
            if (!this.isPlaying) {
                return;
            }
            
            // Pause video
            this.videoElement.pause();
            
            // Reset to beginning
            this.videoElement.currentTime = 0;
            
            // Clear source
            this.videoElement.src = '';
            
            // Update state
            this.isPlaying = false;
            this.isPaused = false;
            this.isEnded = false;
            this.currentMedia = null;
            
            // Emit stopped event
            this.emitEvent('stopped', {
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Video stopped`);
        } catch (error) {
            this.handleError(error, 'stop');
            throw error;
        }
    }

    /**
     * Seek to time
     */
    async seek(time) {
        try {
            if (!this.videoElement.duration) {
                return;
            }
            
            const seekTime = Math.max(0, Math.min(time, this.videoElement.duration));
            this.videoElement.currentTime = seekTime;
            
            console.log(`[${this.TAG}] Video seeked to: ${seekTime}s`);
        } catch (error) {
            this.handleError(error, 'seek');
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
            
            console.log(`[${this.TAG}] Volume set to: ${clampedVolume}`);
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
            console.log(`[${this.TAG}] Video ${muted ? 'muted' : 'unmuted'}`);
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
            
            console.log(`[${this.TAG}] Configuration updated`);
        } catch (error) {
            this.handleError(error, 'updateConfig');
            throw error;
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
            currentMedia: this.currentMedia,
            readyState: this.videoElement.readyState,
            networkState: this.videoElement.networkState
        };
    }

    /**
     * Event handlers
     */
    handleLoadStart(event) {
        console.log(`[${this.TAG}] Load start`);
    }

    handleLoadedMetadata(event) {
        try {
            this.duration = this.videoElement.duration;
            console.log(`[${this.TAG}] Metadata loaded, duration: ${this.duration}s`);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling loaded metadata:`, error);
        }
    }

    handleLoadedData(event) {
        console.log(`[${this.TAG}] Data loaded`);
    }

    handleCanPlay(event) {
        console.log(`[${this.TAG}] Can play`);
    }

    handleCanPlayThrough(event) {
        console.log(`[${this.TAG}] Can play through`);
    }

    handlePlay(event) {
        try {
            this.isPlaying = true;
            this.isPaused = false;
            
            console.log(`[${this.TAG}] Video playing`);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling play:`, error);
        }
    }

    handlePause(event) {
        try {
            this.isPaused = true;
            
            // Emit paused event
            this.emitEvent('paused', {
                media: this.currentMedia,
                currentTime: this.currentTime,
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Video paused`);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling pause:`, error);
        }
    }

    handleEnded(event) {
        try {
            this.isPlaying = false;
            this.isPaused = false;
            this.isEnded = true;
            
            // Emit completed event
            this.emitEvent('completed', {
                media: this.currentMedia,
                duration: this.duration,
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Video ended`);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling ended:`, error);
        }
    }

    handleErrorEvent(event) {
        try {
            const error = this.videoElement.error;
            console.error(`[${this.TAG}] Video error:`, error);
            
            // Emit error event
            this.emitEvent('error', {
                media: this.currentMedia,
                error: {
                    code: error?.code,
                    message: error?.message
                },
                timestamp: new Date()
            });
        } catch (handlingError) {
            console.error(`[${this.TAG}] Error handling video error:`, handlingError);
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

    handleSeeking(event) {
        console.log(`[${this.TAG}] Seeking to: ${this.videoElement.currentTime}s`);
    }

    handleSeeked(event) {
        console.log(`[${this.TAG}] Seeked to: ${this.videoElement.currentTime}s`);
    }

    handleVolumeChange(event) {
        console.log(`[${this.TAG}] Volume changed to: ${this.videoElement.volume}`);
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
            console.log(`[${this.TAG}] Destroying video player`);
            
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
                this.videoElement.removeEventListener('seeking', this.handleSeeking);
                this.videoElement.removeEventListener('seeked', this.handleSeeked);
                this.videoElement.removeEventListener('volumechange', this.handleVolumeChange);
                
                // Remove from DOM
                if (this.videoElement.parentNode) {
                    this.videoElement.parentNode.removeChild(this.videoElement);
                }
            }
            
            // Clear references
            this.videoElement = null;
            this.currentMedia = null;
            this.eventListeners = {};
            this.callbacks = {};
            
            console.log(`[${this.TAG}] Video player destroyed`);
        } catch (error) {
            console.error(`[${this.TAG}] Error destroying video player:`, error);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VideoPlayer;
} else if (typeof window !== 'undefined') {
    window.VideoPlayer = VideoPlayer;
}
