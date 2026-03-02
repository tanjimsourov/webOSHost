/**
 * PlaylistManager - Enhanced playlist management system
 * Complete playlist orchestration for webOS Signage
 */

class PlaylistManager {
    constructor(databaseManager, apiClient) {
        this.dbManager = databaseManager;
        this.apiClient = apiClient;
        this.TAG = 'PlaylistManager';
        
        // Playlist state
        this.currentPlaylist = null;
        this.currentItemIndex = 0;
        this.playlistItems = [];
        this.isPlaying = false;
        this.isPaused = false;
        this.repeatMode = false;
        this.shuffleMode = false;
        
        // Playback configuration
        this.config = {
            autoAdvance: true,
            advertisementFrequency: 3, // Play ad every 3 songs
            crossfadeDuration: 1000,
            gaplessPlayback: true,
            ...this.getDefaultConfig()
        };
        
        // Advertisement management
        this.advertisementQueue = [];
        this.advertisementIndex = 0;
        this.lastAdvertisementTime = 0;
        
        // Event listeners
        this.eventListeners = {
            'playlistStarted': [],
            'playlistStopped': [],
            'playlistChanged': [],
            'songStarted': [],
            'songEnded': [],
            'advertisementStarted': [],
            'advertisementEnded': [],
            'itemChanged': [],
            'error': []
        };
        
        // Initialize manager
        this.initializeManager();
    }

    /**
     * Initialize playlist manager
     */
    initializeManager() {
        try {
            console.log(`[${this.TAG}] Initializing playlist manager`);
            
            // Load configuration
            this.loadConfiguration();
            
            console.log(`[${this.TAG}] Playlist manager initialized`);
        } catch (error) {
            this.handleError(error, 'initializeManager');
            throw error;
        }
    }

    /**
     * Load configuration
     */
    loadConfiguration() {
        try {
            // Load configuration from preferences
            const autoAdvance = localStorage.getItem('playlist_autoadvance');
            if (autoAdvance !== null) {
                this.config.autoAdvance = autoAdvance === 'true';
            }
            
            const repeatMode = localStorage.getItem('playlist_repeat');
            if (repeatMode !== null) {
                this.config.repeatMode = repeatMode === 'true';
            }
            
            const shuffleMode = localStorage.getItem('playlist_shuffle');
            if (shuffleMode !== null) {
                this.config.shuffleMode = shuffleMode === 'true';
            }
            
            const adFrequency = localStorage.getItem('playlist_ad_frequency');
            if (adFrequency !== null) {
                this.config.advertisementFrequency = parseInt(adFrequency);
            }
            
            console.log(`[${this.TAG}] Configuration loaded`);
        } catch (error) {
            console.error(`[${this.TAG}] Error loading configuration:`, error);
        }
    }

    /**
     * Start playlist
     */
    async startPlaylist(playlist) {
        try {
            console.log(`[${this.TAG}] Starting playlist: ${playlist.sp_name}`);
            
            // Set current playlist
            this.currentPlaylist = playlist;
            this.currentItemIndex = 0;
            
            // Prepare playlist items
            await this.preparePlaylistItems(playlist);
            
            // Load advertisements
            await this.loadAdvertisements();
            
            // Start playback
            this.isPlaying = true;
            this.isPaused = false;
            
            // Emit playlist started event
            this.emitEvent('playlistStarted', {
                playlist: playlist,
                itemsCount: this.playlistItems.length,
                timestamp: new Date()
            });
            
            // Start first item
            await this.playCurrentItem();
            
            console.log(`[${this.TAG}] Playlist started: ${playlist.sp_name}`);
            return true;
        } catch (error) {
            this.handleError(error, 'startPlaylist');
            throw error;
        }
    }

    /**
     * Prepare playlist items
     */
    async preparePlaylistItems(playlist) {
        try {
            console.log(`[${this.TAG}] Preparing playlist items`);
            
            this.playlistItems = [];
            
            // Add songs
            if (playlist.songs && playlist.songs.length > 0) {
                for (const song of playlist.songs) {
                    this.playlistItems.push({
                        type: 'song',
                        data: song,
                        id: song.title_id,
                        title: song.title,
                        artist: song.artist_name,
                        duration: song.time || 0,
                        url: song.title_url || song.song_path
                    });
                }
            }
            
            // Add advertisements at intervals
            if (this.config.advertisementFrequency > 0 && this.advertisementQueue.length > 0) {
                this.insertAdvertisements();
            }
            
            // Apply shuffle if enabled
            if (this.config.shuffleMode) {
                this.shufflePlaylist();
            }
            
            console.log(`[${this.TAG}] Playlist items prepared: ${this.playlistItems.length} items`);
        } catch (error) {
            this.handleError(error, 'preparePlaylistItems');
            throw error;
        }
    }

    /**
     * Load advertisements
     */
    async loadAdvertisements() {
        try {
            console.log(`[${this.TAG}] Loading advertisements`);
            
            const advertisementDAO = this.dbManager.getDAO('advertisementDAO');
            if (!advertisementDAO) {
                console.warn(`[${this.TAG}] Advertisement DAO not available`);
                return;
            }
            
            const activeAdvertisements = await advertisementDAO.getActiveAdvertisements();
            
            this.advertisementQueue = activeAdvertisements.map(ad => ({
                type: 'advertisement',
                data: ad,
                id: ad.adv_id,
                title: ad.adv_name,
                duration: ad.adv_total_min || 0,
                url: ad.adv_file_url || ad.adv_path
            }));
            
            console.log(`[${this.TAG}] Loaded ${this.advertisementQueue.length} advertisements`);
        } catch (error) {
            this.handleError(error, 'loadAdvertisements');
            throw error;
        }
    }

    /**
     * Insert advertisements into playlist
     */
    insertAdvertisements() {
        try {
            console.log(`[${this.TAG}] Inserting advertisements into playlist`);
            
            const itemsWithAds = [];
            let songCount = 0;
            
            for (const item of this.playlistItems) {
                itemsWithAds.push(item);
                
                if (item.type === 'song') {
                    songCount++;
                    
                    // Insert advertisement after specified frequency
                    if (songCount % this.config.advertisementFrequency === 0 && this.advertisementQueue.length > 0) {
                        const ad = this.advertisementQueue[this.advertisementIndex % this.advertisementQueue.length];
                        itemsWithAds.push(ad);
                        this.advertisementIndex++;
                    }
                }
            }
            
            this.playlistItems = itemsWithAds;
            
            console.log(`[${this.TAG}] Advertisements inserted: ${this.playlistItems.length} total items`);
        } catch (error) {
            this.handleError(error, 'insertAdvertisements');
            throw error;
        }
    }

    /**
     * Shuffle playlist
     */
    shufflePlaylist() {
        try {
            console.log(`[${this.TAG}] Shuffling playlist`);
            
            // Separate songs and advertisements
            const songs = this.playlistItems.filter(item => item.type === 'song');
            const advertisements = this.playlistItems.filter(item => item.type === 'advertisement');
            
            // Shuffle songs
            for (let i = songs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [songs[i], songs[j]] = [songs[j], songs[i]];
            }
            
            // Rebuild playlist with advertisements at intervals
            this.playlistItems = [];
            let songCount = 0;
            let adIndex = 0;
            
            for (const song of songs) {
                this.playlistItems.push(song);
                songCount++;
                
                if (songCount % this.config.advertisementFrequency === 0 && advertisements.length > 0) {
                    this.playlistItems.push(advertisements[adIndex % advertisements.length]);
                    adIndex++;
                }
            }
            
            console.log(`[${this.TAG}] Playlist shuffled`);
        } catch (error) {
            this.handleError(error, 'shufflePlaylist');
            throw error;
        }
    }

    /**
     * Play current item
     */
    async playCurrentItem() {
        try {
            if (this.currentItemIndex >= this.playlistItems.length) {
                if (this.config.repeatMode) {
                    this.currentItemIndex = 0;
                } else {
                    await this.stopPlaylist();
                    return;
                }
            }
            
            const currentItem = this.playlistItems[this.currentItemIndex];
            
            console.log(`[${this.TAG}] Playing item: ${currentItem.type} - ${currentItem.title}`);
            
            // Emit item changed event
            this.emitEvent('itemChanged', {
                item: currentItem,
                index: this.currentItemIndex,
                total: this.playlistItems.length
            });
            
            // Play based on item type
            if (currentItem.type === 'song') {
                await this.playSong(currentItem);
            } else if (currentItem.type === 'advertisement') {
                await this.playAdvertisement(currentItem);
            }
            
        } catch (error) {
            this.handleError(error, 'playCurrentItem');
            throw error;
        }
    }

    /**
     * Play song
     */
    async playSong(song) {
        try {
            console.log(`[${this.TAG}] Playing song: ${song.title}`);
            
            // Emit song started event
            this.emitEvent('songStarted', {
                song: song,
                timestamp: new Date()
            });
            
            // In a real implementation, this would trigger the media engine
            // For now, we'll simulate playback
            this.simulatePlayback(song, 'song');
            
        } catch (error) {
            this.handleError(error, 'playSong');
            throw error;
        }
    }

    /**
     * Play advertisement
     */
    async playAdvertisement(advertisement) {
        try {
            console.log(`[${this.TAG}] Playing advertisement: ${advertisement.title}`);
            
            // Update last advertisement time
            this.lastAdvertisementTime = Date.now();
            
            // Emit advertisement started event
            this.emitEvent('advertisementStarted', {
                advertisement: advertisement,
                timestamp: new Date()
            });
            
            // In a real implementation, this would trigger the advertisement player
            // For now, we'll simulate playback
            this.simulatePlayback(advertisement, 'advertisement');
            
        } catch (error) {
            this.handleError(error, 'playAdvertisement');
            throw error;
        }
    }

    /**
     * Simulate playback
     */
    simulatePlayback(item, type) {
        try {
            const duration = item.duration || 30; // Default 30 seconds
            
            setTimeout(() => {
                if (type === 'song') {
                    this.handleSongCompleted(item);
                } else if (type === 'advertisement') {
                    this.handleAdvertisementCompleted(item);
                }
            }, duration * 1000);
            
        } catch (error) {
            console.error(`[${this.TAG}] Error simulating playback:`, error);
        }
    }

    /**
     * Handle song completed
     */
    handleSongCompleted(song) {
        try {
            console.log(`[${this.TAG}] Song completed: ${song.title}`);
            
            // Emit song ended event
            this.emitEvent('songEnded', {
                song: song,
                timestamp: new Date()
            });
            
            // Advance to next item
            if (this.config.autoAdvance) {
                this.nextItem();
            }
            
        } catch (error) {
            this.handleError(error, 'handleSongCompleted');
        }
    }

    /**
     * Handle advertisement completed
     */
    handleAdvertisementCompleted(advertisement) {
        try {
            console.log(`[${this.TAG}] Advertisement completed: ${advertisement.title}`);
            
            // Emit advertisement ended event
            this.emitEvent('advertisementEnded', {
                advertisement: advertisement,
                timestamp: new Date()
            });
            
            // Advance to next item
            if (this.config.autoAdvance) {
                this.nextItem();
            }
            
        } catch (error) {
            this.handleError(error, 'handleAdvertisementCompleted');
        }
    }

    /**
     * Handle song completed (external callback)
     */
    handleSongCompleted(song) {
        try {
            this.handleSongCompleted(song);
        } catch (error) {
            console.error(`[${this.TAG}] Error in external song completed handler:`, error);
        }
    }

    /**
     * Handle advertisement completed (external callback)
     */
    handleAdvertisementCompleted(advertisement) {
        try {
            this.handleAdvertisementCompleted(advertisement);
        } catch (error) {
            console.error(`[${this.TAG}] Error in external advertisement completed handler:`, error);
        }
    }

    /**
     * Next item
     */
    nextItem() {
        try {
            console.log(`[${this.TAG}] Moving to next item`);
            
            this.currentItemIndex++;
            
            if (this.currentItemIndex >= this.playlistItems.length) {
                if (this.config.repeatMode) {
                    this.currentItemIndex = 0;
                    console.log(`[${this.TAG}] Playlist repeating`);
                } else {
                    console.log(`[${this.TAG}] Playlist ended`);
                    this.stopPlaylist();
                    return;
                }
            }
            
            // Play next item
            this.playCurrentItem().catch(error => {
                console.error(`[${this.TAG}] Error playing next item:`, error);
            });
            
        } catch (error) {
            this.handleError(error, 'nextItem');
            throw error;
        }
    }

    /**
     * Previous item
     */
    previousItem() {
        try {
            console.log(`[${this.TAG}] Moving to previous item`);
            
            this.currentItemIndex--;
            
            if (this.currentItemIndex < 0) {
                if (this.config.repeatMode) {
                    this.currentItemIndex = this.playlistItems.length - 1;
                } else {
                    this.currentItemIndex = 0;
                }
            }
            
            // Play previous item
            this.playCurrentItem().catch(error => {
                console.error(`[${this.TAG}] Error playing previous item:`, error);
            });
            
        } catch (error) {
            this.handleError(error, 'previousItem');
            throw error;
        }
    }

    /**
     * Jump to item
     */
    jumpToItem(index) {
        try {
            console.log(`[${this.TAG}] Jumping to item: ${index}`);
            
            if (index < 0 || index >= this.playlistItems.length) {
                throw new Error(`Invalid item index: ${index}`);
            }
            
            this.currentItemIndex = index;
            
            // Play selected item
            this.playCurrentItem().catch(error => {
                console.error(`[${this.TAG}] Error playing selected item:`, error);
            });
            
        } catch (error) {
            this.handleError(error, 'jumpToItem');
            throw error;
        }
    }

    /**
     * Pause playlist
     */
    pausePlaylist() {
        try {
            console.log(`[${this.TAG}] Pausing playlist`);
            
            this.isPaused = true;
            this.isPlaying = false;
            
            // In a real implementation, this would pause the media player
            console.log(`[${this.TAG}] Playlist paused`);
        } catch (error) {
            this.handleError(error, 'pausePlaylist');
            throw error;
        }
    }

    /**
     * Resume playlist
     */
    resumePlaylist() {
        try {
            console.log(`[${this.TAG}] Resuming playlist`);
            
            this.isPaused = false;
            this.isPlaying = true;
            
            // In a real implementation, this would resume the media player
            console.log(`[${this.TAG}] Playlist resumed`);
        } catch (error) {
            this.handleError(error, 'resumePlaylist');
            throw error;
        }
    }

    /**
     * Stop playlist
     */
    async stopPlaylist() {
        try {
            console.log(`[${this.TAG}] Stopping playlist`);
            
            this.isPlaying = false;
            this.isPaused = false;
            this.currentItemIndex = 0;
            
            // Emit playlist stopped event
            this.emitEvent('playlistStopped', {
                playlist: this.currentPlaylist,
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Playlist stopped`);
        } catch (error) {
            this.handleError(error, 'stopPlaylist');
            throw error;
        }
    }

    /**
     * Get next item
     */
    getNextItem() {
        try {
            let nextIndex = this.currentItemIndex + 1;
            
            if (nextIndex >= this.playlistItems.length) {
                if (this.config.repeatMode) {
                    nextIndex = 0;
                } else {
                    return null;
                }
            }
            
            return this.playlistItems[nextIndex];
        } catch (error) {
            this.handleError(error, 'getNextItem');
            return null;
        }
    }

    /**
     * Update configuration
     */
    updateConfiguration(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            
            // Save configuration
            this.saveConfiguration();
            
            // Reapply configuration to current playlist
            if (this.currentPlaylist) {
                this.preparePlaylistItems(this.currentPlaylist);
            }
            
            console.log(`[${this.TAG}] Configuration updated`);
        } catch (error) {
            this.handleError(error, 'updateConfiguration');
            throw error;
        }
    }

    /**
     * Save configuration
     */
    saveConfiguration() {
        try {
            localStorage.setItem('playlist_autoadvance', this.config.autoAdvance.toString());
            localStorage.setItem('playlist_repeat', this.config.repeatMode.toString());
            localStorage.setItem('playlist_shuffle', this.config.shuffleMode.toString());
            localStorage.setItem('playlist_ad_frequency', this.config.advertisementFrequency.toString());
        } catch (error) {
            console.error(`[${this.TAG}] Error saving configuration:`, error);
        }
    }

    /**
     * Get playlist manager status
     */
    getPlaylistManagerStatus() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            currentPlaylist: this.currentPlaylist,
            currentItemIndex: this.currentItemIndex,
            totalItems: this.playlistItems.length,
            currentItem: this.playlistItems[this.currentItemIndex] || null,
            config: { ...this.config },
            advertisementQueue: this.advertisementQueue.length
        };
    }

    /**
     * Get playlist items
     */
    getPlaylistItems() {
        return [...this.playlistItems];
    }

    /**
     * Get current item
     */
    getCurrentItem() {
        return this.playlistItems[this.currentItemIndex] || null;
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            autoAdvance: true,
            advertisementFrequency: 3,
            crossfadeDuration: 1000,
            gaplessPlayback: true,
            repeatMode: false,
            shuffleMode: false
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
    module.exports = PlaylistManager;
} else if (typeof window !== 'undefined') {
    window.PlaylistManager = PlaylistManager;
}
