/**
 * PlaylistDAO - Mirrors PlaylistDataSource.java functionality
 * Complete playlist data access object for webOS Signage
 */

class PlaylistDAO {
    constructor(databaseManager) {
        this.dbManager = databaseManager;
        this.TAG = 'PlaylistDAO';
        this.tableName = 'playlist';
    }

    /**
     * Get all playlists in playing order
     * Mirrors: getAllPlaylistsInPlayingOrder()
     */
    async getAllPlaylistsInPlayingOrder() {
        try {
            console.log(`[${this.TAG}] Getting all playlists in playing order`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('start_time');
            const request = index.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const playlists = request.result || [];
                    console.log(`[${this.TAG}] Found ${playlists.length} playlists`);
                    resolve(playlists);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getAllPlaylistsInPlayingOrder');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getAllPlaylistsInPlayingOrder');
            throw error;
        }
    }

    /**
     * Get remaining all playlists (future playlists)
     * Mirrors: getRemainingAllPlaylists()
     */
    async getRemainingAllPlaylists() {
        try {
            console.log(`[${this.TAG}] Getting remaining playlists`);
            
            const currentTime = new Date().getTime();
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('start_time');
            const request = index.openCursor(IDBKeyRange.lowerBound(currentTime));
            
            const playlists = [];
            return new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        playlists.push(cursor.value);
                        cursor.continue();
                    } else {
                        console.log(`[${this.TAG}] Found ${playlists.length} remaining playlists`);
                        resolve(playlists);
                    }
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getRemainingAllPlaylists');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getRemainingAllPlaylists');
            throw error;
        }
    }

    /**
     * Get pending past playlists
     * Mirrors: getPendingPastPlaylist()
     */
    async getPendingPastPlaylist() {
        try {
            console.log(`[${this.TAG}] Getting pending past playlists`);
            
            const currentTime = new Date().getTime();
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('end_time');
            const request = index.openCursor(IDBKeyRange.upperBound(currentTime));
            
            const playlists = [];
            return new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        playlists.push(cursor.value);
                        cursor.continue();
                    } else {
                        console.log(`[${this.TAG}] Found ${playlists.length} pending past playlists`);
                        resolve(playlists);
                    }
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getPendingPastPlaylist');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getPendingPastPlaylist');
            throw error;
        }
    }

    /**
     * Get playlists not available in web response
     * Mirrors: getListNotAvailableinWebResponse()
     */
    async getListNotAvailableinWebResponse(serverPlaylistIds) {
        try {
            console.log(`[${this.TAG}] Getting playlists not in server response`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allPlaylists = request.result || [];
                    const missingPlaylists = allPlaylists.filter(playlist => 
                        !serverPlaylistIds.includes(playlist.sp_playlist_id)
                    );
                    
                    console.log(`[${this.TAG}] Found ${missingPlaylists.length} playlists not in server response`);
                    resolve(missingPlaylists);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getListNotAvailableinWebResponse');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getListNotAvailableinWebResponse');
            throw error;
        }
    }

    /**
     * Get playlists with gone time (expired)
     * Mirrors: getPlaylistGoneTime()
     */
    async getPlaylistGoneTime() {
        try {
            console.log(`[${this.TAG}] Getting expired playlists`);
            
            const currentTime = new Date().getTime();
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('endTimeInMilli');
            const request = index.openCursor(IDBKeyRange.upperBound(currentTime));
            
            const expiredPlaylists = [];
            return new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        expiredPlaylists.push(cursor.value);
                        cursor.continue();
                    } else {
                        console.log(`[${this.TAG}] Found ${expiredPlaylists.length} expired playlists`);
                        resolve(expiredPlaylists);
                    }
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getPlaylistGoneTime');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getPlaylistGoneTime');
            throw error;
        }
    }

    /**
     * Create or update playlist
     * Mirrors: createPlaylist() and updatePlaylist()
     */
    async createOrUpdatePlaylist(playlistData) {
        try {
            console.log(`[${this.TAG}] Creating/updating playlist: ${playlistData.sp_playlist_id}`);
            
            // Convert time strings to milliseconds
            if (playlistData.start_time) {
                playlistData.startTimeInMilli = new Date(playlistData.start_time).getTime();
            }
            if (playlistData.end_time) {
                playlistData.endTimeInMilli = new Date(playlistData.end_time).getTime();
            }
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('sp_playlist_id');
            const request = index.get(playlistData.sp_playlist_id);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const existingPlaylist = request.result;
                    
                    if (existingPlaylist) {
                        // Update existing playlist
                        const updateRequest = store.put({
                            ...existingPlaylist,
                            ...playlistData,
                            _id: existingPlaylist._id
                        });
                        
                        updateRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Updated playlist: ${playlistData.sp_playlist_id}`);
                            resolve({ ...existingPlaylist, ...playlistData });
                        };
                        
                        updateRequest.onerror = () => {
                            this.handleError(updateRequest.error, 'updatePlaylist');
                            reject(updateRequest.error);
                        };
                    } else {
                        // Create new playlist
                        const addRequest = store.add(playlistData);
                        
                        addRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Created playlist: ${playlistData.sp_playlist_id}`);
                            resolve({ ...playlistData, _id: addRequest.result });
                        };
                        
                        addRequest.onerror = () => {
                            this.handleError(addRequest.error, 'createPlaylist');
                            reject(addRequest.error);
                        };
                    }
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'createOrUpdatePlaylist');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'createOrUpdatePlaylist');
            throw error;
        }
    }

    /**
     * Get playlist by ID
     * Mirrors: getPlaylistById()
     */
    async getPlaylistById(playlistId) {
        try {
            console.log(`[${this.TAG}] Getting playlist by ID: ${playlistId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('sp_playlist_id');
            const request = index.get(playlistId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const playlist = request.result;
                    console.log(`[${this.TAG}] Playlist ${playlistId} ${playlist ? 'found' : 'not found'}`);
                    resolve(playlist);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getPlaylistById');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getPlaylistById');
            throw error;
        }
    }

    /**
     * Delete playlist
     * Mirrors: deletePlaylist()
     */
    async deletePlaylist(playlistId) {
        try {
            console.log(`[${this.TAG}] Deleting playlist: ${playlistId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('sp_playlist_id');
            const getRequest = index.get(playlistId);
            
            return new Promise((resolve, reject) => {
                getRequest.onsuccess = () => {
                    const playlist = getRequest.result;
                    
                    if (playlist) {
                        const deleteRequest = store.delete(playlist._id);
                        
                        deleteRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Deleted playlist: ${playlistId}`);
                            resolve(true);
                        };
                        
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deletePlaylist');
                            reject(deleteRequest.error);
                        };
                    } else {
                        console.log(`[${this.TAG}] Playlist not found for deletion: ${playlistId}`);
                        resolve(false);
                    }
                };
                
                getRequest.onerror = () => {
                    this.handleError(getRequest.error, 'deletePlaylist');
                    reject(getRequest.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deletePlaylist');
            throw error;
        }
    }

    /**
     * Get playlists by token
     * Mirrors: getPlaylistsByToken()
     */
    async getPlaylistsByToken(tokenId) {
        try {
            console.log(`[${this.TAG}] Getting playlists by token: ${tokenId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('token_id');
            const request = index.getAll(tokenId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const playlists = request.result || [];
                    console.log(`[${this.TAG}] Found ${playlists.length} playlists for token: ${tokenId}`);
                    resolve(playlists);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getPlaylistsByToken');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getPlaylistsByToken');
            throw error;
        }
    }

    /**
     * Get current active playlist
     * Mirrors: getCurrentActivePlaylist()
     */
    async getCurrentActivePlaylist() {
        try {
            console.log(`[${this.TAG}] Getting current active playlist`);
            
            const currentTime = new Date().getTime();
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const startTimeIndex = store.index('startTimeInMilli');
            const endTimeIndex = store.index('endTimeInMilli');
            
            // Get playlists that should be active now
            const startTimeRequest = startTimeIndex.openCursor(IDBKeyRange.upperBound(currentTime), 'prev');
            const endTimeRequest = endTimeIndex.openCursor(IDBKeyRange.lowerBound(currentTime));
            
            return new Promise((resolve, reject) => {
                let activePlaylist = null;
                let completedRequests = 0;
                
                const checkCompletion = () => {
                    completedRequests++;
                    if (completedRequests === 2) {
                        console.log(`[${this.TAG}] Current active playlist: ${activePlaylist ? activePlaylist.sp_name : 'None'}`);
                        resolve(activePlaylist);
                    }
                };
                
                startTimeRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor && cursor.value.endTimeInMilli > currentTime) {
                        activePlaylist = cursor.value;
                    }
                    checkCompletion();
                };
                
                startTimeRequest.onerror = () => {
                    this.handleError(startTimeRequest.error, 'getCurrentActivePlaylist');
                    reject(startTimeRequest.error);
                };
                
                endTimeRequest.onsuccess = () => {
                    // This is handled by the startTime request logic
                    checkCompletion();
                };
                
                endTimeRequest.onerror = () => {
                    this.handleError(endTimeRequest.error, 'getCurrentActivePlaylist');
                    reject(endTimeRequest.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getCurrentActivePlaylist');
            throw error;
        }
    }

    /**
     * Handle database errors
     */
    handleError(error, operation) {
        console.error(`[${this.TAG}] Error in ${operation}:`, error);
        throw new Error(`${operation} failed: ${error.message}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaylistDAO;
} else if (typeof window !== 'undefined') {
    window.PlaylistDAO = PlaylistDAO;
}
