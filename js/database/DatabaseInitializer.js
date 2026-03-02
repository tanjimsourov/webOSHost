/**
 * DatabaseInitializer - Database initialization and upgrade scripts
 * Handles database setup, migration, and data seeding for webOS Signage
 */

class DatabaseInitializer {
    constructor() {
        this.TAG = 'DatabaseInitializer';
        this.dbManager = null;
        this.daoInstances = {};
    }

    /**
     * Initialize complete database system
     */
    async initialize() {
        try {
            console.log(`[${this.TAG}] Starting database initialization`);
            
            // Initialize database manager
            this.dbManager = new DatabaseManager();
            await this.dbManager.initialize();
            
            // Initialize all DAOs
            await this.initializeDAOs();
            
            // Run any necessary migrations
            await this.runMigrations();
            
            // Seed initial data if needed
            await this.seedInitialData();
            
            console.log(`[${this.TAG}] Database initialization completed successfully`);
            return true;
        } catch (error) {
            console.error(`[${this.TAG}] Database initialization failed:`, error);
            throw error;
        }
    }

    /**
     * Initialize all DAO instances
     */
    async initializeDAOs() {
        try {
            console.log(`[${this.TAG}] Initializing DAO instances`);
            
            // Import and initialize DAOs
            this.daoInstances = {
                playlistDAO: new PlaylistDAO(this.dbManager),
                songsDAO: new SongsDAO(this.dbManager),
                advertisementDAO: new AdvertisementDAO(this.dbManager),
                playerStatusDAO: new PlayerStatusDAO(this.dbManager),
                prayerDAO: new PrayerDAO(this.dbManager)
            };
            
            console.log(`[${this.TAG}] DAO instances initialized`);
        } catch (error) {
            this.handleError(error, 'initializeDAOs');
            throw error;
        }
    }

    /**
     * Run database migrations
     */
    async runMigrations() {
        try {
            console.log(`[${this.TAG}] Running database migrations`);
            
            const currentVersion = this.dbManager.version;
            const storedVersion = await this.getStoredDatabaseVersion();
            
            console.log(`[${this.TAG}] Current version: ${currentVersion}, Stored version: ${storedVersion}`);
            
            if (storedVersion < currentVersion) {
                await this.migrateFromVersion(storedVersion, currentVersion);
                await this.updateStoredDatabaseVersion(currentVersion);
            }
            
            console.log(`[${this.TAG}] Database migrations completed`);
        } catch (error) {
            this.handleError(error, 'runMigrations');
            throw error;
        }
    }

    /**
     * Get stored database version
     */
    async getStoredDatabaseVersion() {
        try {
            // Check if version table exists, if not return 0
            const store = this.dbManager.getObjectStore('playlist', 'readonly');
            const request = store.get(1);
            
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    // For now, return 0 as we don't have a version table
                    resolve(0);
                };
                request.onerror = () => {
                    resolve(0);
                };
            });
        } catch (error) {
            return 0;
        }
    }

    /**
     * Update stored database version
     */
    async updateStoredDatabaseVersion(version) {
        try {
            console.log(`[${this.TAG}] Updating stored database version to: ${version}`);
            // In a real implementation, this would update a version table
            // For now, we'll use localStorage
            localStorage.setItem('database_version', version.toString());
        } catch (error) {
            console.warn(`[${this.TAG}] Could not update stored version:`, error);
        }
    }

    /**
     * Migrate from specific version
     */
    async migrateFromVersion(fromVersion, toVersion) {
        try {
            console.log(`[${this.TAG}] Migrating from version ${fromVersion} to ${toVersion}`);
            
            // Handle specific migrations based on version differences
            if (fromVersion < 1) {
                await this.migrateToVersion1();
            }
            if (fromVersion < 2) {
                await this.migrateToVersion2();
            }
            if (fromVersion < 3) {
                await this.migrateToVersion3();
            }
            if (fromVersion < 4) {
                await this.migrateToVersion4();
            }
            
            console.log(`[${this.TAG}] Migration completed successfully`);
        } catch (error) {
            this.handleError(error, 'migrateFromVersion');
            throw error;
        }
    }

    /**
     * Migrate to version 1
     */
    async migrateToVersion1() {
        console.log(`[${this.TAG}] Migrating to version 1 - Basic tables`);
        // Version 1 migration logic if needed
    }

    /**
     * Migrate to version 2
     */
    async migrateToVersion2() {
        console.log(`[${this.TAG}] Migrating to version 2 - Enhanced indexes`);
        // Version 2 migration logic if needed
    }

    /**
     * Migrate to version 3
     */
    async migrateToVersion3() {
        console.log(`[${this.TAG}] Migrating to version 3 - Prayer support`);
        // Version 3 migration logic if needed
    }

    /**
     * Migrate to version 4
     */
    async migrateToVersion4() {
        console.log(`[${this.TAG}] Migrating to version 4 - Status reporting enhancements`);
        // Version 4 migration logic if needed
    }

    /**
     * Seed initial data
     */
    async seedInitialData() {
        try {
            console.log(`[${this.TAG}] Seeding initial data`);
            
            // Check if data already exists
            const existingData = await this.checkExistingData();
            
            if (!existingData.hasPlaylists) {
                await this.seedDefaultPlaylists();
            }
            
            if (!existingData.hasPrayerTimes) {
                await this.seedDefaultPrayerTimes();
            }
            
            console.log(`[${this.TAG}] Initial data seeding completed`);
        } catch (error) {
            this.handleError(error, 'seedInitialData');
            throw error;
        }
    }

    /**
     * Check if data already exists
     */
    async checkExistingData() {
        try {
            const playlistCount = await this.daoInstances.playlistDAO.getAllPlaylistsInPlayingOrder();
            const prayerCount = await this.daoInstances.prayerDAO.getAllPrayers();
            
            return {
                hasPlaylists: playlistCount.length > 0,
                hasPrayerTimes: prayerCount.length > 0
            };
        } catch (error) {
            return {
                hasPlaylists: false,
                hasPrayerTimes: false
            };
        }
    }

    /**
     * Seed default playlists
     */
    async seedDefaultPlaylists() {
        try {
            console.log(`[${this.TAG}] Seeding default playlists`);
            
            // Create a default playlist for testing
            const defaultPlaylist = {
                sp_playlist_id: 'default_playlist_001',
                token_id: 'default_token',
                sp_name: 'Default Playlist',
                start_time: new Date().toISOString(),
                end_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
                isseprationactive: 0,
                playlistcategory: 'default',
                playlistvol: 50
            };
            
            await this.daoInstances.playlistDAO.createOrUpdatePlaylist(defaultPlaylist);
            console.log(`[${this.TAG}] Default playlist created`);
        } catch (error) {
            console.warn(`[${this.TAG}] Could not seed default playlists:`, error);
        }
    }

    /**
     * Seed default prayer times
     */
    async seedDefaultPrayerTimes() {
        try {
            console.log(`[${this.TAG}] Seeding default prayer times`);
            
            const today = new Date().toISOString().split('T')[0];
            const defaultPrayerTimes = {
                'fajr': { time: '05:30:00', start: '05:30:00', end: '06:00:00' },
                'sunrise': { time: '06:15:00', start: '06:15:00', end: '06:30:00' },
                'dhuhr': { time: '12:30:00', start: '12:30:00', end: '13:00:00' },
                'asr': { time: '15:45:00', start: '15:45:00', end: '16:15:00' },
                'maghrib': { time: '18:15:00', start: '18:15:00', end: '18:45:00' },
                'isha': { time: '19:30:00', start: '19:30:00', end: '20:00:00' }
            };
            
            await this.daoInstances.prayerDAO.updatePrayerTimesForDate(today, defaultPrayerTimes);
            console.log(`[${this.TAG}] Default prayer times created`);
        } catch (error) {
            console.warn(`[${this.TAG}] Could not seed default prayer times:`, error);
        }
    }

    /**
     * Get database instance
     */
    getDatabaseManager() {
        return this.dbManager;
    }

    /**
     * Get DAO instances
     */
    getDAOs() {
        return this.daoInstances;
    }

    /**
     * Get specific DAO
     */
    getDAO(daoName) {
        return this.daoInstances[daoName] || null;
    }

    /**
     * Reset database (for testing)
     */
    async resetDatabase() {
        try {
            console.log(`[${this.TAG}] Resetting database`);
            
            await this.dbManager.clearAllData();
            await this.seedInitialData();
            
            console.log(`[${this.TAG}] Database reset completed`);
            return true;
        } catch (error) {
            this.handleError(error, 'resetDatabase');
            throw error;
        }
    }

    /**
     * Get database statistics
     */
    async getDatabaseStatistics() {
        try {
            console.log(`[${this.TAG}] Getting database statistics`);
            
            const stats = {
                database: {
                    name: this.dbManager.dbName,
                    version: this.dbManager.version
                },
                tables: {}
            };
            
            // Get record counts for each table
            const playlistCount = await this.daoInstances.playlistDAO.getAllPlaylistsInPlayingOrder();
            const songsCount = await this.daoInstances.songsDAO.getAllDownloadedSongs();
            const advertisementCount = await this.daoInstances.advertisementDAO.getAllAdvertisements();
            const statusCount = await this.daoInstances.playerStatusDAO.getAllStatusTypesWithCounts();
            const prayerCount = await this.daoInstances.prayerDAO.getAllPrayers();
            
            stats.tables = {
                playlist: playlistCount.length,
                songs: songsCount.length,
                advertisement: advertisementCount.length,
                player_status: Object.values(statusCount).reduce((sum, count) => sum + count, 0),
                prayer: prayerCount.length
            };
            
            console.log(`[${this.TAG}] Database statistics:`, stats);
            return stats;
        } catch (error) {
            this.handleError(error, 'getDatabaseStatistics');
            throw error;
        }
    }

    /**
     * Validate database integrity
     */
    async validateDatabaseIntegrity() {
        try {
            console.log(`[${this.TAG}] Validating database integrity`);
            
            const validationResults = {
                isValid: true,
                errors: [],
                warnings: []
            };
            
            // Check if database is ready
            if (!this.dbManager.isReady()) {
                validationResults.isValid = false;
                validationResults.errors.push('Database is not ready');
            }
            
            // Check table structures
            const dbInfo = await this.dbManager.getDatabaseInfo();
            for (const [tableName, tableInfo] of Object.entries(dbInfo.tables)) {
                if (tableInfo.recordCount < 0) {
                    validationResults.warnings.push(`Table ${tableName} has negative record count`);
                }
            }
            
            // Validate DAO functionality
            try {
                await this.daoInstances.playlistDAO.getAllPlaylistsInPlayingOrder();
            } catch (error) {
                validationResults.isValid = false;
                validationResults.errors.push(`Playlist DAO validation failed: ${error.message}`);
            }
            
            console.log(`[${this.TAG}] Database validation completed: ${validationResults.isValid ? 'PASSED' : 'FAILED'}`);
            return validationResults;
        } catch (error) {
            this.handleError(error, 'validateDatabaseIntegrity');
            throw error;
        }
    }

    /**
     * Close database connection
     */
    close() {
        try {
            if (this.dbManager) {
                this.dbManager.close();
                console.log(`[${this.TAG}] Database connection closed`);
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error closing database:`, error);
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
    module.exports = DatabaseInitializer;
} else if (typeof window !== 'undefined') {
    window.DatabaseInitializer = DatabaseInitializer;
}
