/**
 * PlayerStatusDAO - Mirrors PlayerStatusDataSource.java functionality
 * Complete player status data access object for webOS Signage
 */

class PlayerStatusDAO {
    constructor(databaseManager) {
        this.dbManager = databaseManager;
        this.TAG = 'PlayerStatusDAO';
        this.tableName = 'table_player_status';
        
        // Status types from Java implementation
        this.STATUS_TYPES = {
            LOGIN: 'login',
            LOGOUT: 'logout',
            HEARTBEAT: 'heartbeat',
            PLAYED_SONG: 'played_song',
            PLAYED_ADVERTISEMENT: 'played_advertisement',
            PLAYED_PRAYER: 'played_prayer'
        };
    }

    /**
     * Create player status record
     * Mirrors: createPlayerStatus()
     */
    async createPlayerStatus(statusData) {
        try {
            console.log(`[${this.TAG}] Creating player status: ${statusData.is_player_status_type}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const request = store.add({
                ...statusData,
                created_at: new Date().toISOString()
            });
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const createdStatus = { ...statusData, _id: request.result };
                    console.log(`[${this.TAG}] Created player status: ${statusData.is_player_status_type}`);
                    resolve(createdStatus);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'createPlayerStatus');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'createPlayerStatus');
            throw error;
        }
    }

    /**
     * Create login status
     * Mirrors: createLoginStatus()
     */
    async createLoginStatus(loginData) {
        try {
            const now = new Date();
            const statusData = {
                is_player_status_type: this.STATUS_TYPES.LOGIN,
                login_date: now.toISOString().split('T')[0],
                login_time: now.toTimeString().split(' ')[0],
                token_id: loginData.token_id,
                heartbeat_datetime: now.toISOString()
            };
            
            return await this.createPlayerStatus(statusData);
        } catch (error) {
            this.handleError(error, 'createLoginStatus');
            throw error;
        }
    }

    /**
     * Create logout status
     * Mirrors: createLogoutStatus()
     */
    async createLogoutStatus(logoutData) {
        try {
            const now = new Date();
            const statusData = {
                is_player_status_type: this.STATUS_TYPES.LOGOUT,
                logout_date: now.toISOString().split('T')[0],
                logout_time: now.toTimeString().split(' ')[0],
                token_id: logoutData.token_id
            };
            
            return await this.createPlayerStatus(statusData);
        } catch (error) {
            this.handleError(error, 'createLogoutStatus');
            throw error;
        }
    }

    /**
     * Create heartbeat status
     * Mirrors: createHeartbeatStatus()
     */
    async createHeartbeatStatus(tokenId) {
        try {
            const now = new Date();
            const statusData = {
                is_player_status_type: this.STATUS_TYPES.HEARTBEAT,
                heartbeat_datetime: now.toISOString(),
                token_id: tokenId
            };
            
            return await this.createPlayerStatus(statusData);
        } catch (error) {
            this.handleError(error, 'createHeartbeatStatus');
            throw error;
        }
    }

    /**
     * Create played song status
     * Mirrors: createPlayedSongStatus()
     */
    async createPlayedSongStatus(songData) {
        try {
            const now = new Date();
            const statusData = {
                is_player_status_type: this.STATUS_TYPES.PLAYED_SONG,
                artist_id_song: songData.artist_id,
                played_date_time_song: now.toISOString(),
                title_id_song: songData.title_id,
                sp_playlist_id_song: songData.sp_playlist_id,
                token_id: songData.token_id
            };
            
            return await this.createPlayerStatus(statusData);
        } catch (error) {
            this.handleError(error, 'createPlayedSongStatus');
            throw error;
        }
    }

    /**
     * Create played advertisement status
     * Mirrors: createPlayedAdvertisementStatus()
     */
    async createPlayedAdvertisementStatus(adData) {
        try {
            const now = new Date();
            const statusData = {
                is_player_status_type: this.STATUS_TYPES.PLAYED_ADVERTISEMENT,
                advertisement_id_status: adData.adv_id,
                advertisement_played_date: now.toISOString().split('T')[0],
                advertisement_played_time: now.toTimeString().split(' ')[0],
                token_id: adData.token_id
            };
            
            return await this.createPlayerStatus(statusData);
        } catch (error) {
            this.handleError(error, 'createPlayedAdvertisementStatus');
            throw error;
        }
    }

    /**
     * Create played prayer status
     * Mirrors: createPlayedPrayerStatus()
     */
    async createPlayedPrayerStatus(prayerData) {
        try {
            const now = new Date();
            const statusData = {
                is_player_status_type: this.STATUS_TYPES.PLAYED_PRAYER,
                prayer_played_date: now.toISOString().split('T')[0],
                prayer_played_time: now.toTimeString().split(' ')[0],
                token_id: prayerData.token_id
            };
            
            return await this.createPlayerStatus(statusData);
        } catch (error) {
            this.handleError(error, 'createPlayedPrayerStatus');
            throw error;
        }
    }

    /**
     * Get statuses by type
     * Mirrors: getStatusesByType()
     */
    async getStatusesByType(statusType, limit = 100) {
        try {
            console.log(`[${this.TAG}] Getting statuses by type: ${statusType}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('is_player_status_type');
            const request = index.getAll(statusType);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const statuses = request.result || [];
                    // Sort by created_at descending and limit
                    const sortedStatuses = statuses
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .slice(0, limit);
                    
                    console.log(`[${this.TAG}] Found ${sortedStatuses.length} statuses of type: ${statusType}`);
                    resolve(sortedStatuses);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getStatusesByType');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getStatusesByType');
            throw error;
        }
    }

    /**
     * Get recent statuses (for offline queue)
     * Mirrors: getRecentStatuses()
     */
    async getRecentStatuses(limit = 50) {
        try {
            console.log(`[${this.TAG}] Getting recent statuses`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allStatuses = request.result || [];
                    // Sort by created_at descending and limit
                    const recentStatuses = allStatuses
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .slice(0, limit);
                    
                    console.log(`[${this.TAG}] Found ${recentStatuses.length} recent statuses`);
                    resolve(recentStatuses);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getRecentStatuses');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getRecentStatuses');
            throw error;
        }
    }

    /**
     * Get statuses by date range
     * Mirrors: getStatusesByDateRange()
     */
    async getStatusesByDateRange(startDate, endDate, statusType = null) {
        try {
            console.log(`[${this.TAG}] Getting statuses from ${startDate} to ${endDate}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allStatuses = request.result || [];
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    
                    let filteredStatuses = allStatuses.filter(status => {
                        const statusDate = new Date(status.created_at);
                        return statusDate >= start && statusDate <= end;
                    });
                    
                    if (statusType) {
                        filteredStatuses = filteredStatuses.filter(status => 
                            status.is_player_status_type === statusType
                        );
                    }
                    
                    // Sort by created_at ascending
                    filteredStatuses.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    
                    console.log(`[${this.TAG}] Found ${filteredStatuses.length} statuses in date range`);
                    resolve(filteredStatuses);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getStatusesByDateRange');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getStatusesByDateRange');
            throw error;
        }
    }

    /**
     * Get statuses by token ID
     * Mirrors: getStatusesByToken()
     */
    async getStatusesByToken(tokenId, limit = 100) {
        try {
            console.log(`[${this.TAG}] Getting statuses for token: ${tokenId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allStatuses = request.result || [];
                    const tokenStatuses = allStatuses.filter(status => 
                        status.token_id === tokenId
                    );
                    
                    // Sort by created_at descending and limit
                    const sortedStatuses = tokenStatuses
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .slice(0, limit);
                    
                    console.log(`[${this.TAG}] Found ${sortedStatuses.length} statuses for token: ${tokenId}`);
                    resolve(sortedStatuses);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getStatusesByToken');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getStatusesByToken');
            throw error;
        }
    }

    /**
     * Delete statuses by type and date range
     * Mirrors: deleteStatusesByTypeAndDate()
     */
    async deleteStatusesByTypeAndDate(statusType, beforeDate) {
        try {
            console.log(`[${this.TAG}] Deleting ${statusType} statuses before ${beforeDate}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('is_player_status_type');
            const request = index.getAll(statusType);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const statuses = request.result || [];
                    const cutoffDate = new Date(beforeDate);
                    
                    const statusesToDelete = statuses.filter(status => {
                        const statusDate = new Date(status.created_at);
                        return statusDate < cutoffDate;
                    });
                    
                    let deletedCount = 0;
                    const totalToDelete = statusesToDelete.length;
                    
                    if (totalToDelete === 0) {
                        console.log(`[${this.TAG}] No ${statusType} statuses to delete before ${beforeDate}`);
                        resolve(0);
                        return;
                    }
                    
                    statusesToDelete.forEach(status => {
                        const deleteRequest = store.delete(status._id);
                        
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            if (deletedCount === totalToDelete) {
                                console.log(`[${this.TAG}] Deleted ${deletedCount} ${statusType} statuses before ${beforeDate}`);
                                resolve(deletedCount);
                            }
                        };
                        
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deleteStatusesByTypeAndDate');
                            reject(deleteRequest.error);
                        };
                    });
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'deleteStatusesByTypeAndDate');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deleteStatusesByTypeAndDate');
            throw error;
        }
    }

    /**
     * Delete old statuses (cleanup)
     * Mirrors: deleteOldStatuses()
     */
    async deleteOldStatuses(daysToKeep = 30) {
        try {
            console.log(`[${this.TAG}] Deleting statuses older than ${daysToKeep} days`);
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allStatuses = request.result || [];
                    const oldStatuses = allStatuses.filter(status => {
                        const statusDate = new Date(status.created_at);
                        return statusDate < cutoffDate;
                    });
                    
                    let deletedCount = 0;
                    const totalToDelete = oldStatuses.length;
                    
                    if (totalToDelete === 0) {
                        console.log(`[${this.TAG}] No old statuses to delete`);
                        resolve(0);
                        return;
                    }
                    
                    oldStatuses.forEach(status => {
                        const deleteRequest = store.delete(status._id);
                        
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            if (deletedCount === totalToDelete) {
                                console.log(`[${this.TAG}] Deleted ${deletedCount} old statuses`);
                                resolve(deletedCount);
                            }
                        };
                        
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deleteOldStatuses');
                            reject(deleteRequest.error);
                        };
                    });
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'deleteOldStatuses');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deleteOldStatuses');
            throw error;
        }
    }

    /**
     * Get status count by type
     * Mirrors: getStatusCountByType()
     */
    async getStatusCountByType(statusType) {
        try {
            console.log(`[${this.TAG}] Getting status count for type: ${statusType}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('is_player_status_type');
            const request = index.count(statusType);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const count = request.result;
                    console.log(`[${this.TAG}] Status count for ${statusType}: ${count}`);
                    resolve(count);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getStatusCountByType');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getStatusCountByType');
            throw error;
        }
    }

    /**
     * Get all status types with counts
     * Mirrors: getAllStatusTypesWithCounts()
     */
    async getAllStatusTypesWithCounts() {
        try {
            console.log(`[${this.TAG}] Getting all status types with counts`);
            
            const statusCounts = {};
            
            for (const statusType of Object.values(this.STATUS_TYPES)) {
                statusCounts[statusType] = await this.getStatusCountByType(statusType);
            }
            
            console.log(`[${this.TAG}] Status counts:`, statusCounts);
            return statusCounts;
        } catch (error) {
            this.handleError(error, 'getAllStatusTypesWithCounts');
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
    module.exports = PlayerStatusDAO;
} else if (typeof window !== 'undefined') {
    window.PlayerStatusDAO = PlayerStatusDAO;
}
