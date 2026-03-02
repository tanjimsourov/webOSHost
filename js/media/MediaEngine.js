/**
 * MediaEngine - Mirrors AlenkaMedia.java functionality
 * Complete media management system for webOS Signage
 */

class MediaEngine {
    constructor(databaseManager, apiClient, downloadManager) {
        this.dbManager = databaseManager;
        this.apiClient = apiClient;
        this.downloadManager = downloadManager;
        this.TAG = 'MediaEngine';
        
        // Media state (mirroring AlenkaMedia static variables)
        this.playlistStatus = -12;
        this.currentPlaylistId = '';
        this.globalDocumentFile = null;
        this.deviceId = '';
        
        // Media components
        this.videoPlayer = null;
        this.advertisementPlayer = null;
        this.playlistManager = null;
        
        // Playback state
        this.isPlaying = false;
        this.currentMedia = null;
        this.playbackQueue = [];
        this.currentPlaylist = null;
        
        // Event listeners
        this.eventListeners = {
            'mediaStarted': [],
            'mediaPaused': [],
            'mediaStopped': [],
            'mediaCompleted': [],
            'playlistChanged': [],
            'error': []
        };
        
        // Media configuration
        this.config = {
            autoPlay: true,
            loop: false,
            volume: 1.0,
            hardwareAcceleration: true,
            preload: 'metadata'
        };
    }

    /**
     * Initialize media engine
     * Mirrors: AlenkaMedia.onCreate() and initialization
     */
    async initialize() {
        try {
            console.log(`[${this.TAG}] Initializing media engine`);
            
            // Initialize device ID
            await this.initializeDeviceId();
            
            // Initialize media components
            await this.initializeMediaComponents();
            
            // Load preferences
            await this.loadPreferences();
            
            // Set up global document file
            await this.setupGlobalDocumentFile();
            
            console.log(`[${this.TAG}] Media engine initialized successfully`);
            return true;
        } catch (error) {
            this.handleError(error, 'initialize');
            throw error;
        }
    }

    /**
     * Initialize device ID
     * Mirrors: AlenkaMedia device_id initialization
     */
    async initializeDeviceId() {
        try {
            console.log(`[${this.TAG}] Initializing device ID`);
            
            // Get or generate device ID
            let deviceId = localStorage.getItem('device_id');
            
            if (!deviceId) {
                // Generate new device ID
                deviceId = this.generateDeviceId();
                localStorage.setItem('device_id', deviceId);
            }
            
            this.deviceId = deviceId;
            console.log(`[${this.TAG}] Device ID: ${this.deviceId}`);
        } catch (error) {
            this.handleError(error, 'initializeDeviceId');
            throw error;
        }
    }

    /**
     * Initialize media components
     */
    async initializeMediaComponents() {
        try {
            console.log(`[${this.TAG}] Initializing media components`);
            
            // Initialize video player
            if (!this.videoPlayer) {
                this.videoPlayer = new VideoPlayer(this.config);
                this.videoPlayer.addEventListener('started', this.handleVideoStarted.bind(this));
                this.videoPlayer.addEventListener('paused', this.handleVideoPaused.bind(this));
                this.videoPlayer.addEventListener('stopped', this.handleVideoStopped.bind(this));
                this.videoPlayer.addEventListener('completed', this.handleVideoCompleted.bind(this));
                this.videoPlayer.addEventListener('error', this.handleVideoError.bind(this));
            }
            
            // Initialize advertisement player
            if (!this.advertisementPlayer) {
                this.advertisementPlayer = new AdvertisementPlayer(this.config);
                this.advertisementPlayer.addEventListener('started', this.handleAdStarted.bind(this));
                this.advertisementPlayer.addEventListener('completed', this.handleAdCompleted.bind(this));
                this.advertisementPlayer.addEventListener('error', this.handleAdError.bind(this));
            }
            
            // Initialize playlist manager
            if (!this.playlistManager) {
                this.playlistManager = new PlaylistManager(this.dbManager, this.apiClient);
                this.playlistManager.addEventListener('playlistChanged', this.handlePlaylistChanged.bind(this));
                this.playlistManager.addEventListener('songEnded', this.handleSongEnded.bind(this));
            }
            
            console.log(`[${this.TAG}] Media components initialized`);
        } catch (error) {
            this.handleError(error, 'initializeMediaComponents');
            throw error;
        }
    }

    /**
     * Load preferences
     * Mirrors: AlenkaMedia preferences loading
     */
    async loadPreferences() {
        try {
            console.log(`[${this.TAG}] Loading preferences`);
            
            // Load media preferences
            const volume = localStorage.getItem('media_volume');
            if (volume !== null) {
                this.config.volume = parseFloat(volume);
            }
            
            const autoPlay = localStorage.getItem('media_autoplay');
            if (autoPlay !== null) {
                this.config.autoPlay = autoPlay === 'true';
            }
            
            const loop = localStorage.getItem('media_loop');
            if (loop !== null) {
                this.config.loop = loop === 'true';
            }
            
            // Load playlist status
            const playlistStatus = localStorage.getItem('playlist_status');
            if (playlistStatus !== null) {
                this.playlistStatus = parseInt(playlistStatus);
            }
            
            // Load current playlist ID
            const currentPlaylistId = localStorage.getItem('current_playlist_id');
            if (currentPlaylistId !== null) {
                this.currentPlaylistId = currentPlaylistId;
            }
            
            console.log(`[${this.TAG}] Preferences loaded`);
        } catch (error) {
            this.handleError(error, 'loadPreferences');
            throw error;
        }
    }

    /**
     * Setup global document file
     * Mirrors: AlenkaMedia globalDocumentFile setup
     */
    async setupGlobalDocumentFile() {
        try {
            console.log(`[${this.TAG}] Setting up global document file`);
            
            // In webOS, we can use the app's private storage
            if (typeof webOS !== 'undefined' && webOS.deviceready) {
                // Use webOS file system if available
                this.globalDocumentFile = webOS.fileSystem;
            } else {
                // Fallback to localStorage-based file system
                this.globalDocumentFile = {
                    path: '/media/',
                    exists: (path) => localStorage.getItem(`file_${path}`) !== null,
                    read: (path) => localStorage.getItem(`file_${path}`),
                    write: (path, data) => localStorage.setItem(`file_${path}`, data),
                    delete: (path) => localStorage.removeItem(`file_${path}`)
                };
            }
            
            console.log(`[${this.TAG}] Global document file setup completed`);
        } catch (error) {
            this.handleError(error, 'setupGlobalDocumentFile');
            throw error;
        }
    }

    /**
     * Start playback
     * Mirrors: AlenkaMedia playback start logic
     */
    async startPlayback(playlistId = null) {
        try {
            console.log(`[${this.TAG}] Starting playback`);
            
            // Get playlist ID
            const targetPlaylistId = playlistId || this.currentPlaylistId;
            
            if (!targetPlaylistId) {
                throw new Error('No playlist ID provided');
            }
            
            // Load playlist
            const playlist = await this.loadPlaylist(targetPlaylistId);
            if (!playlist) {
                throw new Error(`Playlist not found: ${targetPlaylistId}`);
            }
            
            // Set current playlist
            this.currentPlaylist = playlist;
            this.currentPlaylistId = targetPlaylistId;
            
            // Update playlist status
            this.playlistStatus = 0; // Playing
            
            // Save state
            this.saveState();
            
            // Start playlist playback
            await this.playlistManager.startPlaylist(playlist);
            
            // Update playback state
            this.isPlaying = true;
            
            console.log(`[${this.TAG}] Playback started for playlist: ${targetPlaylistId}`);
            return true;
        } catch (error) {
            this.handleError(error, 'startPlayback');
            throw error;
        }
    }

    /**
     * Stop playback
     */
    async stopPlayback() {
        try {
            console.log(`[${this.TAG}] Stopping playback`);
            
            // Stop all media components
            if (this.videoPlayer) {
                await this.videoPlayer.stop();
            }
            
            if (this.advertisementPlayer) {
                await this.advertisementPlayer.stop();
            }
            
            if (this.playlistManager) {
                await this.playlistManager.stop();
            }
            
            // Update state
            this.isPlaying = false;
            this.currentMedia = null;
            this.playlistStatus = -1; // Stopped
            
            // Save state
            this.saveState();
            
            // Emit media stopped event
            this.emitEvent('mediaStopped', { timestamp: new Date() });
            
            console.log(`[${this.TAG}] Playback stopped`);
            return true;
        } catch (error) {
            this.handleError(error, 'stopPlayback');
            throw error;
        }
    }

    /**
     * Pause playback
     */
    async pausePlayback() {
        try {
            console.log(`[${this.TAG}] Pausing playback`);
            
            if (!this.isPlaying) {
                console.log(`[${this.TAG}] Playback not playing`);
                return true;
            }
            
            // Pause current media
            if (this.currentMedia) {
                if (this.currentMedia.type === 'video') {
                    await this.videoPlayer.pause();
                } else if (this.currentMedia.type === 'advertisement') {
                    await this.advertisementPlayer.pause();
                }
            }
            
            // Update state
            this.playlistStatus = 1; // Paused
            
            // Save state
            this.saveState();
            
            // Emit media paused event
            this.emitEvent('mediaPaused', { timestamp: new Date() });
            
            console.log(`[${this.TAG}] Playback paused`);
            return true;
        } catch (error) {
            this.handleError(error, 'pausePlayback');
            throw error;
        }
    }

    /**
     * Resume playback
     */
    async resumePlayback() {
        try {
            console.log(`[${this.TAG}] Resuming playback`);
            
            if (this.isPlaying && this.playlistStatus !== 1) {
                console.log(`[${this.TAG}] Playback already playing`);
                return true;
            }
            
            // Resume current media
            if (this.currentMedia) {
                if (this.currentMedia.type === 'video') {
                    await this.videoPlayer.resume();
                } else if (this.currentMedia.type === 'advertisement') {
                    await this.advertisementPlayer.resume();
                }
            }
            
            // Update state
            this.isPlaying = true;
            this.playlistStatus = 0; // Playing
            
            // Save state
            this.saveState();
            
            // Emit media started event
            this.emitEvent('mediaStarted', { timestamp: new Date() });
            
            console.log(`[${this.TAG}] Playback resumed`);
            return true;
        } catch (error) {
            this.handleError(error, 'resumePlayback');
            throw error;
        }
    }

    /**
     * Load playlist
     */
    async loadPlaylist(playlistId) {
        try {
            console.log(`[${this.TAG}] Loading playlist: ${playlistId}`);
            
            const playlistDAO = this.dbManager.getDAO('playlistDAO');
            if (!playlistDAO) {
                throw new Error('Playlist DAO not available');
            }
            
            const playlist = await playlistDAO.getPlaylistById(playlistId);
            
            if (!playlist) {
                console.warn(`[${this.TAG}] Playlist not found: ${playlistId}`);
                return null;
            }
            
            // Load playlist songs
            const songsDAO = this.dbManager.getDAO('songsDAO');
            if (songsDAO) {
                playlist.songs = await songsDAO.getSongsByPlaylistId(playlistId);
            }
            
            // Load playlist advertisements
            const advertisementDAO = this.dbManager.getDAO('advertisementDAO');
            if (advertisementDAO) {
                playlist.advertisements = await advertisementDAO.getActiveAdvertisements();
            }
            
            console.log(`[${this.TAG}] Playlist loaded: ${playlist.sp_name} (${playlist.songs?.length || 0} songs, ${playlist.advertisements?.length || 0} ads)`);
            return playlist;
        } catch (error) {
            this.handleError(error, 'loadPlaylist');
            throw error;
        }
    }

    /**
     * Play media item
     */
    async playMediaItem(mediaItem) {
        try {
            console.log(`[${this.TAG}] Playing media item: ${mediaItem.type}`);
            
            // Stop current media
            if (this.currentMedia) {
                await this.stopCurrentMedia();
            }
            
            // Set current media
            this.currentMedia = mediaItem;
            
            // Play based on media type
            if (mediaItem.type === 'video' || mediaItem.type === 'song') {
                await this.videoPlayer.play(mediaItem);
            } else if (mediaItem.type === 'advertisement') {
                await this.advertisementPlayer.play(mediaItem);
            } else {
                throw new Error(`Unknown media type: ${mediaItem.type}`);
            }
            
            console.log(`[${this.TAG}] Media item playing: ${mediaItem.type}`);
        } catch (error) {
            this.handleError(error, 'playMediaItem');
            throw error;
        }
    }

    /**
     * Stop current media
     */
    async stopCurrentMedia() {
        try {
            if (!this.currentMedia) {
                return;
            }
            
            if (this.currentMedia.type === 'video' || this.currentMedia.type === 'song') {
                await this.videoPlayer.stop();
            } else if (this.currentMedia.type === 'advertisement') {
                await this.advertisementPlayer.stop();
            }
            
            this.currentMedia = null;
        } catch (error) {
            console.error(`[${this.TAG}] Error stopping current media:`, error);
        }
    }

    /**
     * Handle video started event
     */
    handleVideoStarted(event) {
        try {
            console.log(`[${this.TAG}] Video started:`, event.data);
            
            // Update status reporting
            this.reportMediaStatus('played_song', event.data);
            
            // Emit media started event
            this.emitEvent('mediaStarted', { type: 'video', data: event.data });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling video started:`, error);
        }
    }

    /**
     * Handle video paused event
     */
    handleVideoPaused(event) {
        try {
            console.log(`[${this.TAG}] Video paused:`, event.data);
            
            // Emit media paused event
            this.emitEvent('mediaPaused', { type: 'video', data: event.data });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling video paused:`, error);
        }
    }

    /**
     * Handle video stopped event
     */
    handleVideoStopped(event) {
        try {
            console.log(`[${this.TAG}] Video stopped:`, event.data);
            
            // Emit media stopped event
            this.emitEvent('mediaStopped', { type: 'video', data: event.data });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling video stopped:`, error);
        }
    }

    /**
     * Handle video completed event
     */
    handleVideoCompleted(event) {
        try {
            console.log(`[${this.TAG}] Video completed:`, event.data);
            
            // Report completion
            this.reportMediaStatus('played_song', event.data);
            
            // Notify playlist manager
            if (this.playlistManager) {
                this.playlistManager.handleSongCompleted(event.data);
            }
            
            // Emit media completed event
            this.emitEvent('mediaCompleted', { type: 'video', data: event.data });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling video completed:`, error);
        }
    }

    /**
     * Handle video error event
     */
    handleVideoError(event) {
        try {
            console.error(`[${this.TAG}] Video error:`, event.data);
            
            // Emit error event
            this.emitEvent('error', { type: 'video', error: event.data });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling video error:`, error);
        }
    }

    /**
     * Handle advertisement started event
     */
    handleAdStarted(event) {
        try {
            console.log(`[${this.TAG}] Advertisement started:`, event.data);
            
            // Report ad status
            this.reportMediaStatus('played_advertisement', event.data);
            
            // Emit media started event
            this.emitEvent('mediaStarted', { type: 'advertisement', data: event.data });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling ad started:`, error);
        }
    }

    /**
     * Handle advertisement completed event
     */
    handleAdCompleted(event) {
        try {
            console.log(`[${this.TAG}] Advertisement completed:`, event.data);
            
            // Report ad completion
            this.reportMediaStatus('played_advertisement', event.data);
            
            // Notify playlist manager
            if (this.playlistManager) {
                this.playlistManager.handleAdvertisementCompleted(event.data);
            }
            
            // Emit media completed event
            this.emitEvent('mediaCompleted', { type: 'advertisement', data: event.data });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling ad completed:`, error);
        }
    }

    /**
     * Handle advertisement error event
     */
    handleAdError(event) {
        try {
            console.error(`[${this.TAG}] Advertisement error:`, event.data);
            
            // Emit error event
            this.emitEvent('error', { type: 'advertisement', error: event.data });
        } catch (error) {
            console.error(`[${this.TAG}] Error handling ad error:`, error);
        }
    }

    /**
     * Handle playlist changed event
     */
    handlePlaylistChanged(event) {
        try {
            console.log(`[${this.TAG}] Playlist changed:`, event.data);
            
            // Update current playlist
            this.currentPlaylist = event.data.playlist;
            this.currentPlaylistId = event.data.playlist.sp_playlist_id;
            
            // Save state
            this.saveState();
            
            // Emit playlist changed event
            this.emitEvent('playlistChanged', event.data);
        } catch (error) {
            console.error(`[${this.TAG}] Error handling playlist changed:`, error);
        }
    }

    /**
     * Handle song ended event
     */
    async handleSongEnded(event) {
        try {
            console.log(`[${this.TAG}] Song ended:`, event.data);
            
            // Play next item in playlist
            if (this.playlistManager) {
                const nextItem = this.playlistManager.getNextItem();
                if (nextItem) {
                    await this.playMediaItem(nextItem);
                }
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error handling song ended:`, error);
        }
    }

    /**
     * Report media status
     */
    async reportMediaStatus(statusType, mediaData) {
        try {
            const statusDAO = this.dbManager.getDAO('playerStatusDAO');
            if (!statusDAO) {
                return;
            }
            
            const token = await this.getCurrentToken();
            if (!token) {
                return;
            }
            
            let statusData;
            
            switch (statusType) {
                case 'played_song':
                    statusData = {
                        artist_id_song: mediaData.artist_id,
                        title_id_song: mediaData.title_id,
                        sp_playlist_id_song: this.currentPlaylistId,
                        token_id: token
                    };
                    await statusDAO.createPlayedSongStatus(statusData);
                    break;
                    
                case 'played_advertisement':
                    statusData = {
                        advertisement_id_status: mediaData.adv_id,
                        token_id: token
                    };
                    await statusDAO.createPlayedAdvertisementStatus(statusData);
                    break;
                    
                default:
                    console.warn(`[${this.TAG}] Unknown status type: ${statusType}`);
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error reporting media status:`, error);
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
     * Save state
     */
    saveState() {
        try {
            localStorage.setItem('playlist_status', this.playlistStatus.toString());
            localStorage.setItem('current_playlist_id', this.currentPlaylistId);
            localStorage.setItem('media_volume', this.config.volume.toString());
            localStorage.setItem('media_autoplay', this.config.autoPlay.toString());
            localStorage.setItem('media_loop', this.config.loop.toString());
        } catch (error) {
            console.warn(`[${this.TAG}] Could not save state:`, error);
        }
    }

    /**
     * Generate device ID
     */
    generateDeviceId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `device_${timestamp}_${random}`;
    }

    /**
     * Get media engine status
     */
    getMediaEngineStatus() {
        return {
            isPlaying: this.isPlaying,
            currentMedia: this.currentMedia,
            currentPlaylist: this.currentPlaylist,
            currentPlaylistId: this.currentPlaylistId,
            playlistStatus: this.playlistStatus,
            deviceId: this.deviceId,
            config: { ...this.config }
        };
    }

    /**
     * Update configuration
     */
    updateConfiguration(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            
            // Update media components configuration
            if (this.videoPlayer) {
                this.videoPlayer.updateConfig(this.config);
            }
            
            if (this.advertisementPlayer) {
                this.advertisementPlayer.updateConfig(this.config);
            }
            
            // Save state
            this.saveState();
            
            console.log(`[${this.TAG}] Configuration updated`);
        } catch (error) {
            this.handleError(error, 'updateConfiguration');
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
    module.exports = MediaEngine;
} else if (typeof window !== 'undefined') {
    window.MediaEngine = MediaEngine;
}
