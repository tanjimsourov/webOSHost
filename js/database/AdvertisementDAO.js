/**
 * AdvertisementDAO - Mirrors AdvertisementDataSource.java functionality
 * Complete advertisement data access object for webOS Signage
 */

class AdvertisementDAO {
    constructor(databaseManager) {
        this.dbManager = databaseManager;
        this.TAG = 'AdvertisementDAO';
        this.tableName = 'advertisement';
    }

    /**
     * Delete advertisements if not in server
     * Mirrors: deleteAdvIfNotInServer()
     */
    async deleteAdvIfNotInServer(serverAdvertisementIds) {
        try {
            console.log(`[${this.TAG}] Deleting ads not in server response`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allAdvertisements = request.result || [];
                    const adsToDelete = allAdvertisements.filter(ad => 
                        !serverAdvertisementIds.includes(ad.adv_id)
                    );
                    
                    let deletedCount = 0;
                    const totalToDelete = adsToDelete.length;
                    
                    if (totalToDelete === 0) {
                        console.log(`[${this.TAG}] No advertisements to delete`);
                        resolve(0);
                        return;
                    }
                    
                    adsToDelete.forEach(ad => {
                        const deleteRequest = store.delete(ad._id);
                        
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            if (deletedCount === totalToDelete) {
                                console.log(`[${this.TAG}] Deleted ${deletedCount} advertisements not in server`);
                                resolve(deletedCount);
                            }
                        };
                        
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deleteAdvIfNotInServer');
                            reject(deleteRequest.error);
                        };
                    });
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'deleteAdvIfNotInServer');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deleteAdvIfNotInServer');
            throw error;
        }
    }

    /**
     * Delete unused advertisements
     * Mirrors: deleteAdvUnUsed()
     */
    async deleteAdvUnUsed() {
        try {
            console.log(`[${this.TAG}] Deleting unused advertisements`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allAdvertisements = request.result || [];
                    const currentTime = new Date().getTime();
                    
                    // Delete ads that are expired or not scheduled
                    const unusedAds = allAdvertisements.filter(ad => {
                        if (ad.adv_e_date) {
                            const endDate = new Date(ad.adv_e_date).getTime();
                            return endDate < currentTime;
                        }
                        if (ad.adv_s_date && ad.adv_s_time) {
                            const startDate = new Date(`${ad.adv_s_date} ${ad.adv_s_time}`).getTime();
                            return startDate > currentTime;
                        }
                        return true; // Delete if no valid schedule
                    });
                    
                    let deletedCount = 0;
                    const totalToDelete = unusedAds.length;
                    
                    if (totalToDelete === 0) {
                        console.log(`[${this.TAG}] No unused advertisements to delete`);
                        resolve(0);
                        return;
                    }
                    
                    unusedAds.forEach(ad => {
                        const deleteRequest = store.delete(ad._id);
                        
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            if (deletedCount === totalToDelete) {
                                console.log(`[${this.TAG}] Deleted ${deletedCount} unused advertisements`);
                                resolve(deletedCount);
                            }
                        };
                        
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deleteAdvUnUsed');
                            reject(deleteRequest.error);
                        };
                    });
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'deleteAdvUnUsed');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deleteAdvUnUsed');
            throw error;
        }
    }

    /**
     * Get advertisements that don't exist in storage
     * Mirrors: getNotExistInStorage()
     */
    async getNotExistInStorage(serverAdvertisements) {
        try {
            console.log(`[${this.TAG}] Getting advertisements not in storage`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const storedAdvertisements = request.result || [];
                    const storedAdIds = storedAdvertisements.map(ad => ad.adv_id);
                    
                    // Find server ads that don't exist in storage
                    const missingAds = serverAdvertisements.filter(serverAd => 
                        !storedAdIds.includes(serverAd.adv_id)
                    );
                    
                    console.log(`[${this.TAG}] Found ${missingAds.length} advertisements not in storage`);
                    resolve(missingAds);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getNotExistInStorage');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getNotExistInStorage');
            throw error;
        }
    }

    /**
     * Get all advertisements
     */
    async getAllAdvertisements() {
        try {
            console.log(`[${this.TAG}] Getting all advertisements`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const advertisements = request.result || [];
                    console.log(`[${this.TAG}] Found ${advertisements.length} advertisements`);
                    resolve(advertisements);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getAllAdvertisements');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getAllAdvertisements');
            throw error;
        }
    }

    /**
     * Get advertisement by ID
     */
    async getAdvertisementById(advId) {
        try {
            console.log(`[${this.TAG}] Getting advertisement by ID: ${advId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('adv_id');
            const request = index.get(advId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const advertisement = request.result;
                    console.log(`[${this.TAG}] Advertisement ${advId} ${advertisement ? 'found' : 'not found'}`);
                    resolve(advertisement);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getAdvertisementById');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getAdvertisementById');
            throw error;
        }
    }

    /**
     * Get downloaded advertisements
     */
    async getDownloadedAdvertisements() {
        try {
            console.log(`[${this.TAG}] Getting downloaded advertisements`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('is_downloaded');
            const request = index.getAll(1); // 1 = downloaded
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const advertisements = request.result || [];
                    console.log(`[${this.TAG}] Found ${advertisements.length} downloaded advertisements`);
                    resolve(advertisements);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getDownloadedAdvertisements');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getDownloadedAdvertisements');
            throw error;
        }
    }

    /**
     * Get active advertisements (scheduled for current time)
     */
    async getActiveAdvertisements() {
        try {
            console.log(`[${this.TAG}] Getting active advertisements`);
            
            const currentTime = new Date().getTime();
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allAdvertisements = request.result || [];
                    const activeAds = allAdvertisements.filter(ad => {
                        if (ad.adv_s_date && ad.adv_s_time && ad.adv_e_date) {
                            const startTime = new Date(`${ad.adv_s_date} ${ad.adv_s_time}`).getTime();
                            const endTime = new Date(ad.adv_e_date).getTime();
                            return currentTime >= startTime && currentTime <= endTime;
                        }
                        return false;
                    });
                    
                    console.log(`[${this.TAG}] Found ${activeAds.length} active advertisements`);
                    resolve(activeAds);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getActiveAdvertisements');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getActiveAdvertisements');
            throw error;
        }
    }

    /**
     * Create or update advertisement
     */
    async createOrUpdateAdvertisement(advertisementData) {
        try {
            console.log(`[${this.TAG}] Creating/updating advertisement: ${advertisementData.adv_id}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('adv_id');
            const request = index.get(advertisementData.adv_id);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const existingAdvertisement = request.result;
                    
                    if (existingAdvertisement) {
                        // Update existing advertisement
                        const updateRequest = store.put({
                            ...existingAdvertisement,
                            ...advertisementData,
                            _id: existingAdvertisement._id
                        });
                        
                        updateRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Updated advertisement: ${advertisementData.adv_id}`);
                            resolve({ ...existingAdvertisement, ...advertisementData });
                        };
                        
                        updateRequest.onerror = () => {
                            this.handleError(updateRequest.error, 'updateAdvertisement');
                            reject(updateRequest.error);
                        };
                    } else {
                        // Create new advertisement
                        const addRequest = store.add({
                            ...advertisementData,
                            is_downloaded: advertisementData.is_downloaded || 0
                        });
                        
                        addRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Created advertisement: ${advertisementData.adv_id}`);
                            resolve({ ...advertisementData, _id: addRequest.result });
                        };
                        
                        addRequest.onerror = () => {
                            this.handleError(addRequest.error, 'createAdvertisement');
                            reject(addRequest.error);
                        };
                    }
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'createOrUpdateAdvertisement');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'createOrUpdateAdvertisement');
            throw error;
        }
    }

    /**
     * Update advertisement download status
     */
    async updateAdvertisementDownloadStatus(advId, downloadStatus, filePath = null) {
        try {
            console.log(`[${this.TAG}] Updating download status for advertisement: ${advId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('adv_id');
            const getRequest = index.get(advId);
            
            return new Promise((resolve, reject) => {
                getRequest.onsuccess = () => {
                    const advertisement = getRequest.result;
                    
                    if (advertisement) {
                        const updateData = {
                            ...advertisement,
                            is_downloaded: downloadStatus
                        };
                        
                        if (filePath) {
                            updateData.adv_path = filePath;
                        }
                        
                        const updateRequest = store.put(updateData);
                        
                        updateRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Updated download status for advertisement: ${advId}`);
                            resolve(updateData);
                        };
                        
                        updateRequest.onerror = () => {
                            this.handleError(updateRequest.error, 'updateAdvertisementDownloadStatus');
                            reject(updateRequest.error);
                        };
                    } else {
                        console.log(`[${this.TAG}] Advertisement not found for status update: ${advId}`);
                        resolve(null);
                    }
                };
                
                getRequest.onerror = () => {
                    this.handleError(getRequest.error, 'updateAdvertisementDownloadStatus');
                    reject(getRequest.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'updateAdvertisementDownloadStatus');
            throw error;
        }
    }

    /**
     * Delete advertisement
     */
    async deleteAdvertisement(advId) {
        try {
            console.log(`[${this.TAG}] Deleting advertisement: ${advId}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('adv_id');
            const getRequest = index.get(advId);
            
            return new Promise((resolve, reject) => {
                getRequest.onsuccess = () => {
                    const advertisement = getRequest.result;
                    
                    if (advertisement) {
                        const deleteRequest = store.delete(advertisement._id);
                        
                        deleteRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Deleted advertisement: ${advId}`);
                            resolve(true);
                        };
                        
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deleteAdvertisement');
                            reject(deleteRequest.error);
                        };
                    } else {
                        console.log(`[${this.TAG}] Advertisement not found for deletion: ${advId}`);
                        resolve(false);
                    }
                };
                
                getRequest.onerror = () => {
                    this.handleError(getRequest.error, 'deleteAdvertisement');
                    reject(getRequest.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deleteAdvertisement');
            throw error;
        }
    }

    /**
     * Get advertisements by type
     */
    async getAdvertisementsByType(advPlyType) {
        try {
            console.log(`[${this.TAG}] Getting advertisements by type: ${advPlyType}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allAdvertisements = request.result || [];
                    const filteredAds = allAdvertisements.filter(ad => 
                        ad.adv_ply_type === advPlyType
                    );
                    
                    console.log(`[${this.TAG}] Found ${filteredAds.length} advertisements of type: ${advPlyType}`);
                    resolve(filteredAds);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getAdvertisementsByType');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getAdvertisementsByType');
            throw error;
        }
    }

    /**
     * Get advertisements by serial number
     */
    async getAdvertisementBySerialNumber(serialNo) {
        try {
            console.log(`[${this.TAG}] Getting advertisement by serial number: ${serialNo}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('adv_serial_no');
            const request = index.get(serialNo);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const advertisement = request.result;
                    console.log(`[${this.TAG}] Advertisement with serial ${serialNo} ${advertisement ? 'found' : 'not found'}`);
                    resolve(advertisement);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getAdvertisementBySerialNumber');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getAdvertisementBySerialNumber');
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
    module.exports = AdvertisementDAO;
} else if (typeof window !== 'undefined') {
    window.AdvertisementDAO = AdvertisementDAO;
}
