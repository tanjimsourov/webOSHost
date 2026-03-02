/**
 * SongsDAO - Mirrors SongsDataSource.java functionality
 * Complete songs data access object for webOS Signage
 */

class SongsDAO {
    constructor(databaseManager) {
        this.dbManager = databaseManager;
        this.TAG = 'SongsDAO';
        this.tableName = 'songs';
    }

    /**
     * Delete songs with playlist ID
     * Mirrors: deleteSongsWithPlaylist()
     */
    async deleteSongsWithPlaylist(playlistId) {
        try {
            console.log(`[${this.TAG}] Deleting songs for playlist: ${playlistId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('sp_playlist_id');
            const request = index.openCursor(IDBKeyRange.only(playlistId));
            
            let deletedCount = 0;
            return new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const deleteRequest = cursor.delete();
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            cursor.continue();
                        };
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deleteSongsWithPlaylist');
                            reject(deleteRequest.error);
                        };
                    } else {
                        console.log(`[${this.TAG}] Deleted ${deletedCount} songs for playlist: ${playlistId}`);
                        resolve(deletedCount);
                    }
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'deleteSongsWithPlaylist');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deleteSongsWithPlaylist');
            throw error;
        }
    }

    /**
     * Get all downloaded songs
     * Mirrors: getAllDownloadedSongs()
     */
    async getAllDownloadedSongs() {
        try {
            console.log(`[${this.TAG}] Getting all downloaded songs`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('is_downloaded');
            const request = index.getAll(1); // 1 = downloaded
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const songs = request.result || [];
                    console.log(`[${this.TAG}] Found ${songs.length} downloaded songs`);
                    resolve(songs);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getAllDownloadedSongs');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getAllDownloadedSongs');
            throw error;
        }
    }

    /**
     * Get all songs that are downloaded (with path verification)
     * Mirrors: getAllSongsThatAreDownloaded()
     */
    async getAllSongsThatAreDownloaded() {
        try {
            console.log(`[${this.TAG}] Getting downloaded songs with path verification`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('is_downloaded');
            const request = index.getAll(1);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const songs = request.result || [];
                    // Filter songs that have valid paths
                    const validSongs = songs.filter(song => 
                        song.song_path && song.song_path.trim() !== ''
                    );
                    
                    console.log(`[${this.TAG}] Found ${validSongs.length} valid downloaded songs`);
                    resolve(validSongs);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getAllSongsThatAreDownloaded');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getAllSongsThatAreDownloaded');
            throw error;
        }
    }

    /**
     * Check if song exists, create with download status from existing
     * Mirrors: checkifSongExist()
     */
    async checkifSongExist(songData) {
        try {
            console.log(`[${this.TAG}] Checking if song exists: ${songData.title_id}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('title_id');
            const request = index.get(songData.title_id);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const existingSong = request.result;
                    
                    if (existingSong) {
                        // Update existing song with new data but preserve download status
                        this.updateSong(existingSong._id, {
                            ...songData,
                            is_downloaded: existingSong.is_downloaded,
                            song_path: existingSong.song_path || songData.song_path
                        }).then(updated => {
                            console.log(`[${this.TAG}] Updated existing song: ${songData.title_id}`);
                            resolve(updated);
                        }).catch(reject);
                    } else {
                        // Create new song
                        this.createSong(songData).then(created => {
                            console.log(`[${this.TAG}] Created new song: ${songData.title_id}`);
                            resolve(created);
                        }).catch(reject);
                    }
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'checkifSongExist');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'checkifSongExist');
            throw error;
        }
    }

    /**
     * Check if multiple songs with same title exist
     * Mirrors: checkifSongsExist1()
     */
    async checkifSongsExist1(titleId) {
        try {
            console.log(`[${this.TAG}] Checking for duplicate songs: ${titleId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('title_id');
            const request = index.getAll(titleId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const songs = request.result || [];
                    const hasDuplicates = songs.length > 1;
                    console.log(`[${this.TAG}] Found ${songs.length} songs with title_id: ${titleId}`);
                    resolve(hasDuplicates);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'checkifSongsExist1');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'checkifSongsExist1');
            throw error;
        }
    }

    /**
     * Update songs list with serial number
     * Mirrors: updateSongsListWithSerialNumber()
     */
    async updateSongsListWithSerialNumber(songsData) {
        try {
            console.log(`[${this.TAG}] Updating songs list with serial numbers`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const updatedSongs = [];
            
            return new Promise((resolve, reject) => {
                let completedUpdates = 0;
                const totalUpdates = songsData.length;
                
                if (totalUpdates === 0) {
                    resolve([]);
                    return;
                }
                
                songsData.forEach((songData, index) => {
                    const indexStore = store.index('title_id');
                    const getRequest = indexStore.get(songData.title_id);
                    
                    getRequest.onsuccess = () => {
                        const existingSong = getRequest.result;
                        
                        if (existingSong) {
                            const updateData = {
                                ...existingSong,
                                ...songData,
                                serial_no: songData.serial_no || (index + 1).toString(),
                                refreshtime: new Date().toISOString()
                            };
                            
                            const updateRequest = store.put(updateData);
                            
                            updateRequest.onsuccess = () => {
                                updatedSongs.push(updateData);
                                completedUpdates++;
                                
                                if (completedUpdates === totalUpdates) {
                                    console.log(`[${this.TAG}] Updated ${updatedSongs.length} songs with serial numbers`);
                                    resolve(updatedSongs);
                                }
                            };
                            
                            updateRequest.onerror = () => {
                                this.handleError(updateRequest.error, 'updateSongsListWithSerialNumber');
                                reject(updateRequest.error);
                            };
                        } else {
                            // Song doesn't exist, create it
                            const newSong = {
                                ...songData,
                                serial_no: songData.serial_no || (index + 1).toString(),
                                refreshtime: new Date().toISOString(),
                                is_downloaded: 0
                            };
                            
                            const addRequest = store.add(newSong);
                            
                            addRequest.onsuccess = () => {
                                updatedSongs.push({ ...newSong, _id: addRequest.result });
                                completedUpdates++;
                                
                                if (completedUpdates === totalUpdates) {
                                    console.log(`[${this.TAG}] Created/updated ${updatedSongs.length} songs with serial numbers`);
                                    resolve(updatedSongs);
                                }
                            };
                            
                            addRequest.onerror = () => {
                                this.handleError(addRequest.error, 'updateSongsListWithSerialNumber');
                                reject(addRequest.error);
                            };
                        }
                    };
                    
                    getRequest.onerror = () => {
                        this.handleError(getRequest.error, 'updateSongsListWithSerialNumber');
                        reject(getRequest.error);
                    };
                });
            });
        } catch (error) {
            this.handleError(error, 'updateSongsListWithSerialNumber');
            throw error;
        }
    }

    /**
     * Get unscheduled songs that are not downloaded
     * Mirrors: getUnschdSongsThoseAreNotDownloaded()
     */
    async getUnschdSongsThoseAreNotDownloaded() {
        try {
            console.log(`[${this.TAG}] Getting unscheduled non-downloaded songs`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const downloadIndex = store.index('is_downloaded');
            const request = downloadIndex.getAll(0); // 0 = not downloaded
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const songs = request.result || [];
                    // Filter for unscheduled songs (no playlist assignment)
                    const unscheduledSongs = songs.filter(song => 
                        !song.sp_playlist_id || song.sp_playlist_id.trim() === ''
                    );
                    
                    console.log(`[${this.TAG}] Found ${unscheduledSongs.length} unscheduled non-downloaded songs`);
                    resolve(unscheduledSongs);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getUnschdSongsThoseAreNotDownloaded');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getUnschdSongsThoseAreNotDownloaded');
            throw error;
        }
    }

    /**
     * Update songs column download status
     * Mirrors: updateSongsColumnDownloadStatus()
     */
    async updateSongsColumnDownloadStatus(titleIds, downloadStatus = 0) {
        try {
            console.log(`[${this.TAG}] Updating download status for ${titleIds.length} songs`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const updatedSongs = [];
            
            return new Promise((resolve, reject) => {
                let completedUpdates = 0;
                const totalUpdates = titleIds.length;
                
                if (totalUpdates === 0) {
                    resolve([]);
                    return;
                }
                
                titleIds.forEach(titleId => {
                    const index = store.index('title_id');
                    const getRequest = index.get(titleId);
                    
                    getRequest.onsuccess = () => {
                        const song = getRequest.result;
                        
                        if (song) {
                            const updateData = {
                                ...song,
                                is_downloaded: downloadStatus,
                                refreshtime: new Date().toISOString()
                            };
                            
                            const updateRequest = store.put(updateData);
                            
                            updateRequest.onsuccess = () => {
                                updatedSongs.push(updateData);
                                completedUpdates++;
                                
                                if (completedUpdates === totalUpdates) {
                                    console.log(`[${this.TAG}] Updated download status for ${updatedSongs.length} songs`);
                                    resolve(updatedSongs);
                                }
                            };
                            
                            updateRequest.onerror = () => {
                                this.handleError(updateRequest.error, 'updateSongsColumnDownloadStatus');
                                reject(updateRequest.error);
                            };
                        } else {
                            completedUpdates++;
                            if (completedUpdates === totalUpdates) {
                                console.log(`[${this.TAG}] Updated download status for ${updatedSongs.length} songs`);
                                resolve(updatedSongs);
                            }
                        }
                    };
                    
                    getRequest.onerror = () => {
                        this.handleError(getRequest.error, 'updateSongsColumnDownloadStatus');
                        reject(getRequest.error);
                    };
                });
            });
        } catch (error) {
            this.handleError(error, 'updateSongsColumnDownloadStatus');
            throw error;
        }
    }

    /**
     * Get song list not available in web response
     * Mirrors: getSongListNotAvailableinWebResponse()
     */
    async getSongListNotAvailableinWebResponse(serverSongIds) {
        try {
            console.log(`[${this.TAG}] Getting songs not in server response`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allSongs = request.result || [];
                    const missingSongs = allSongs.filter(song => 
                        !serverSongIds.includes(song.title_id)
                    );
                    
                    console.log(`[${this.TAG}] Found ${missingSongs.length} songs not in server response`);
                    resolve(missingSongs);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getSongListNotAvailableinWebResponse');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getSongListNotAvailableinWebResponse');
            throw error;
        }
    }

    /**
     * Get songs to be deleted with title IDs
     * Mirrors: getSongsToBeDeletedWithTitleIds()
     */
    async getSongsToBeDeletedWithTitleIds(titleIds) {
        try {
            console.log(`[${this.TAG}] Getting songs to delete for ${titleIds.length} title IDs`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('title_id');
            
            const songsToDelete = [];
            return new Promise((resolve, reject) => {
                let completedChecks = 0;
                const totalChecks = titleIds.length;
                
                if (totalChecks === 0) {
                    resolve([]);
                    return;
                }
                
                titleIds.forEach(titleId => {
                    const getRequest = index.get(titleId);
                    
                    getRequest.onsuccess = () => {
                        const song = getRequest.result;
                        if (song) {
                            songsToDelete.push(song);
                        }
                        
                        completedChecks++;
                        if (completedChecks === totalChecks) {
                            console.log(`[${this.TAG}] Found ${songsToDelete.length} songs to delete`);
                            resolve(songsToDelete);
                        }
                    };
                    
                    getRequest.onerror = () => {
                        this.handleError(getRequest.error, 'getSongsToBeDeletedWithTitleIds');
                        reject(getRequest.error);
                    };
                });
            });
        } catch (error) {
            this.handleError(error, 'getSongsToBeDeletedWithTitleIds');
            throw error;
        }
    }

    /**
     * Get count for total songs downloaded
     * Mirrors: getCountForTotalSongsDownloaded()
     */
    async getCountForTotalSongsDownloaded() {
        try {
            console.log(`[${this.TAG}] Getting count of downloaded songs`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('is_downloaded');
            const request = index.count(1); // 1 = downloaded
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const count = request.result;
                    console.log(`[${this.TAG}] Total downloaded songs count: ${count}`);
                    resolve(count);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getCountForTotalSongsDownloaded');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getCountForTotalSongsDownloaded');
            throw error;
        }
    }

    /**
     * Create new song
     */
    async createSong(songData) {
        try {
            console.log(`[${this.TAG}] Creating song: ${songData.title_id}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const request = store.add({
                ...songData,
                is_downloaded: songData.is_downloaded || 0,
                refreshtime: new Date().toISOString()
            });
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const createdSong = { ...songData, _id: request.result };
                    console.log(`[${this.TAG}] Created song: ${songData.title_id}`);
                    resolve(createdSong);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'createSong');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'createSong');
            throw error;
        }
    }

    /**
     * Update song
     */
    async updateSong(songId, updateData) {
        try {
            console.log(`[${this.TAG}] Updating song: ${songId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const request = store.put({
                ...updateData,
                _id: songId,
                refreshtime: new Date().toISOString()
            });
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const updatedSong = { ...updateData, _id: songId };
                    console.log(`[${this.TAG}] Updated song: ${songId}`);
                    resolve(updatedSong);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'updateSong');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'updateSong');
            throw error;
        }
    }

    /**
     * Get song by title ID
     */
    async getSongByTitleId(titleId) {
        try {
            console.log(`[${this.TAG}] Getting song by title ID: ${titleId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('title_id');
            const request = index.get(titleId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const song = request.result;
                    console.log(`[${this.TAG}] Song ${titleId} ${song ? 'found' : 'not found'}`);
                    resolve(song);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getSongByTitleId');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getSongByTitleId');
            throw error;
        }
    }

    /**
     * Get songs by playlist ID
     */
    async getSongsByPlaylistId(playlistId) {
        try {
            console.log(`[${this.TAG}] Getting songs for playlist: ${playlistId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('sp_playlist_id');
            const request = index.getAll(playlistId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const songs = request.result || [];
                    console.log(`[${this.TAG}] Found ${songs.length} songs for playlist: ${playlistId}`);
                    resolve(songs);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getSongsByPlaylistId');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getSongsByPlaylistId');
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
    module.exports = SongsDAO;
} else if (typeof window !== 'undefined') {
    window.SongsDAO = SongsDAO;
}
