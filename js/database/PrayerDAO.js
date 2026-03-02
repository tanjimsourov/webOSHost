/**
 * PrayerDAO - Prayer timing functionality for webOS Signage
 * Complete prayer data access object with timing management
 */

class PrayerDAO {
    constructor(databaseManager) {
        this.dbManager = databaseManager;
        this.TAG = 'PrayerDAO';
        this.tableName = 'prayer';
        
        // Prayer types based on Islamic prayer times
        this.PRAYER_TYPES = {
            FAJR: 'fajr',
            SUNRISE: 'sunrise',
            DHUHR: 'dhuhr',
            ASR: 'asr',
            MAGHRIB: 'maghrib',
            ISHA: 'isha'
        };
    }

    /**
     * Create or update prayer time
     */
    async createOrUpdatePrayer(prayerData) {
        try {
            console.log(`[${this.TAG}] Creating/updating prayer: ${prayerData.prayer_name}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('prayer_name');
            const request = index.get(prayerData.prayer_name);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const existingPrayer = request.result;
                    
                    if (existingPrayer) {
                        // Update existing prayer
                        const updateRequest = store.put({
                            ...existingPrayer,
                            ...prayerData,
                            _id: existingPrayer._id
                        });
                        
                        updateRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Updated prayer: ${prayerData.prayer_name}`);
                            resolve({ ...existingPrayer, ...prayerData });
                        };
                        
                        updateRequest.onerror = () => {
                            this.handleError(updateRequest.error, 'updatePrayer');
                            reject(updateRequest.error);
                        };
                    } else {
                        // Create new prayer
                        const addRequest = store.add({
                            ...prayerData,
                            is_active: prayerData.is_active !== undefined ? prayerData.is_active : 1,
                            created_at: new Date().toISOString()
                        });
                        
                        addRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Created prayer: ${prayerData.prayer_name}`);
                            resolve({ ...prayerData, _id: addRequest.result });
                        };
                        
                        addRequest.onerror = () => {
                            this.handleError(addRequest.error, 'createPrayer');
                            reject(addRequest.error);
                        };
                    }
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'createOrUpdatePrayer');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'createOrUpdatePrayer');
            throw error;
        }
    }

    /**
     * Get all prayers
     */
    async getAllPrayers() {
        try {
            console.log(`[${this.TAG}] Getting all prayers`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const prayers = request.result || [];
                    console.log(`[${this.TAG}] Found ${prayers.length} prayers`);
                    resolve(prayers);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getAllPrayers');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getAllPrayers');
            throw error;
        }
    }

    /**
     * Get active prayers
     */
    async getActivePrayers() {
        try {
            console.log(`[${this.TAG}] Getting active prayers`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('is_active');
            const request = index.getAll(1); // 1 = active
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const prayers = request.result || [];
                    // Sort by prayer time
                    const sortedPrayers = prayers.sort((a, b) => {
                        const timeA = new Date(`1970-01-01 ${a.prayer_time}`);
                        const timeB = new Date(`1970-01-01 ${b.prayer_time}`);
                        return timeA - timeB;
                    });
                    
                    console.log(`[${this.TAG}] Found ${sortedPrayers.length} active prayers`);
                    resolve(sortedPrayers);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getActivePrayers');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getActivePrayers');
            throw error;
        }
    }

    /**
     * Get prayers by date
     */
    async getPrayersByDate(date) {
        try {
            console.log(`[${this.TAG}] Getting prayers for date: ${date}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('prayer_date');
            const request = index.getAll(date);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const prayers = request.result || [];
                    console.log(`[${this.TAG}] Found ${prayers.length} prayers for date: ${date}`);
                    resolve(prayers);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getPrayersByDate');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getPrayersByDate');
            throw error;
        }
    }

    /**
     * Get prayer by name
     */
    async getPrayerByName(prayerName) {
        try {
            console.log(`[${this.TAG}] Getting prayer by name: ${prayerName}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const index = store.index('prayer_name');
            const request = index.get(prayerName);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const prayer = request.result;
                    console.log(`[${this.TAG}] Prayer ${prayerName} ${prayer ? 'found' : 'not found'}`);
                    resolve(prayer);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getPrayerByName');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getPrayerByName');
            throw error;
        }
    }

    /**
     * Get current active prayer window
     */
    async getCurrentActivePrayerWindow() {
        try {
            console.log(`[${this.TAG}] Getting current active prayer window`);
            
            const now = new Date();
            const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS format
            const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allPrayers = request.result || [];
                    
                    // Find prayers that are active for current date and time
                    const activePrayers = allPrayers.filter(prayer => {
                        if (!prayer.is_active || prayer.prayer_date !== currentDate) {
                            return false;
                        }
                        
                        // Check if current time is within prayer window
                        const prayerStartTime = prayer.start_time;
                        const prayerEndTime = prayer.end_time;
                        
                        return currentTime >= prayerStartTime && currentTime <= prayerEndTime;
                    });
                    
                    // Sort by start time
                    activePrayers.sort((a, b) => {
                        const timeA = new Date(`1970-01-01 ${a.start_time}`);
                        const timeB = new Date(`1970-01-01 ${b.start_time}`);
                        return timeA - timeB;
                    });
                    
                    const currentPrayer = activePrayers.length > 0 ? activePrayers[0] : null;
                    console.log(`[${this.TAG}] Current active prayer: ${currentPrayer ? currentPrayer.prayer_name : 'None'}`);
                    resolve(currentPrayer);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getCurrentActivePrayerWindow');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getCurrentActivePrayerWindow');
            throw error;
        }
    }

    /**
     * Get next prayer window
     */
    async getNextPrayerWindow() {
        try {
            console.log(`[${this.TAG}] Getting next prayer window`);
            
            const now = new Date();
            const currentTime = now.toTimeString().split(' ')[0];
            const currentDate = now.toISOString().split('T')[0];
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readonly');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allPrayers = request.result || [];
                    
                    // Find next prayer window
                    const nextPrayers = allPrayers.filter(prayer => {
                        if (!prayer.is_active || prayer.prayer_date !== currentDate) {
                            return false;
                        }
                        
                        return prayer.start_time > currentTime;
                    });
                    
                    // Sort by start time
                    nextPrayers.sort((a, b) => {
                        const timeA = new Date(`1970-01-01 ${a.start_time}`);
                        const timeB = new Date(`1970-01-01 ${b.start_time}`);
                        return timeA - timeB;
                    });
                    
                    const nextPrayer = nextPrayers.length > 0 ? nextPrayers[0] : null;
                    console.log(`[${this.TAG}] Next prayer: ${nextPrayer ? nextPrayer.prayer_name : 'None'}`);
                    resolve(nextPrayer);
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'getNextPrayerWindow');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'getNextPrayerWindow');
            throw error;
        }
    }

    /**
     * Update prayer times for date
     */
    async updatePrayerTimesForDate(date, prayerTimes) {
        try {
            console.log(`[${this.TAG}] Updating prayer times for date: ${date}`);
            
            const updatedPrayers = [];
            
            for (const [prayerName, prayerTime] of Object.entries(prayerTimes)) {
                const prayerData = {
                    prayer_name: prayerName,
                    prayer_time: prayerTime.time,
                    prayer_date: date,
                    start_time: prayerTime.start || prayerTime.time,
                    end_time: prayerTime.end || prayerTime.time,
                    is_active: 1
                };
                
                const updated = await this.createOrUpdatePrayer(prayerData);
                updatedPrayers.push(updated);
            }
            
            console.log(`[${this.TAG}] Updated ${updatedPrayers.length} prayer times for date: ${date}`);
            return updatedPrayers;
        } catch (error) {
            this.handleError(error, 'updatePrayerTimesForDate');
            throw error;
        }
    }

    /**
     * Delete prayers by date
     */
    async deletePrayersByDate(date) {
        try {
            console.log(`[${this.TAG}] Deleting prayers for date: ${date}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('prayer_date');
            const request = index.getAll(date);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const prayers = request.result || [];
                    let deletedCount = 0;
                    const totalToDelete = prayers.length;
                    
                    if (totalToDelete === 0) {
                        console.log(`[${this.TAG}] No prayers to delete for date: ${date}`);
                        resolve(0);
                        return;
                    }
                    
                    prayers.forEach(prayer => {
                        const deleteRequest = store.delete(prayer._id);
                        
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            if (deletedCount === totalToDelete) {
                                console.log(`[${this.TAG}] Deleted ${deletedCount} prayers for date: ${date}`);
                                resolve(deletedCount);
                            }
                        };
                        
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deletePrayersByDate');
                            reject(deleteRequest.error);
                        };
                    });
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'deletePrayersByDate');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deletePrayersByDate');
            throw error;
        }
    }

    /**
     * Delete old prayers (cleanup)
     */
    async deleteOldPrayers(daysToKeep = 7) {
        try {
            console.log(`[${this.TAG}] Deleting prayers older than ${daysToKeep} days`);
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            const cutoffDateString = cutoffDate.toISOString().split('T')[0];
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allPrayers = request.result || [];
                    const oldPrayers = allPrayers.filter(prayer => {
                        return prayer.prayer_date < cutoffDateString;
                    });
                    
                    let deletedCount = 0;
                    const totalToDelete = oldPrayers.length;
                    
                    if (totalToDelete === 0) {
                        console.log(`[${this.TAG}] No old prayers to delete`);
                        resolve(0);
                        return;
                    }
                    
                    oldPrayers.forEach(prayer => {
                        const deleteRequest = store.delete(prayer._id);
                        
                        deleteRequest.onsuccess = () => {
                            deletedCount++;
                            if (deletedCount === totalToDelete) {
                                console.log(`[${this.TAG}] Deleted ${deletedCount} old prayers`);
                                resolve(deletedCount);
                            }
                        };
                        
                        deleteRequest.onerror = () => {
                            this.handleError(deleteRequest.error, 'deleteOldPrayers');
                            reject(deleteRequest.error);
                        };
                    });
                };
                
                request.onerror = () => {
                    this.handleError(request.error, 'deleteOldPrayers');
                    reject(request.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'deleteOldPrayers');
            throw error;
        }
    }

    /**
     * Toggle prayer active status
     */
    async togglePrayerStatus(prayerName, isActive) {
        try {
            console.log(`[${this.TAG}] Toggling prayer status: ${prayerName} -> ${isActive}`);
            
            const store = this.dbManager.getObjectStore(this.tableName, 'readwrite');
            const index = store.index('prayer_name');
            const getRequest = index.get(prayerName);
            
            return new Promise((resolve, reject) => {
                getRequest.onsuccess = () => {
                    const prayer = getRequest.result;
                    
                    if (prayer) {
                        const updateData = {
                            ...prayer,
                            is_active: isActive ? 1 : 0
                        };
                        
                        const updateRequest = store.put(updateData);
                        
                        updateRequest.onsuccess = () => {
                            console.log(`[${this.TAG}] Updated prayer status: ${prayerName}`);
                            resolve(updateData);
                        };
                        
                        updateRequest.onerror = () => {
                            this.handleError(updateRequest.error, 'togglePrayerStatus');
                            reject(updateRequest.error);
                        };
                    } else {
                        console.log(`[${this.TAG}] Prayer not found for status toggle: ${prayerName}`);
                        resolve(null);
                    }
                };
                
                getRequest.onerror = () => {
                    this.handleError(getRequest.error, 'togglePrayerStatus');
                    reject(getRequest.error);
                };
            });
        } catch (error) {
            this.handleError(error, 'togglePrayerStatus');
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
    module.exports = PrayerDAO;
} else if (typeof window !== 'undefined') {
    window.PrayerDAO = PrayerDAO;
}
