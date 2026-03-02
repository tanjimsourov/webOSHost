/**
 * DatabaseManager - Mirrors MySQLiteHelper.java functionality
 * Complete IndexedDB implementation for webOS Signage
 * Database: claudSignagedb (Version 4)
 */

class DatabaseManager {
    constructor() {
        this.dbName = 'claudSignagedb';
        this.version = 4;
        this.db = null;
        
        // Exact table schema from MySQLiteHelper.java
        this.tables = {
            playlist: {
                name: 'playlist',
                columns: {
                    _id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
                    sch_id: 'TEXT',
                    sp_playlist_id: 'TEXT', 
                    token_id: 'TEXT',
                    start_time: 'TEXT',
                    end_time: 'TEXT',
                    sp_name: 'TEXT',
                    startTimeInMilli: 'INTEGER',
                    endTimeInMilli: 'INTEGER',
                    isseprationactive: 'INTEGER',
                    playlistcategory: 'TEXT',
                    playlistvol: 'INTEGER'
                }
            },
            songs: {
                name: 'songs',
                columns: {
                    _id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
                    sch_id: 'TEXT',
                    title_id: 'TEXT',
                    is_downloaded: 'INTEGER',
                    title: 'TEXT',
                    album_id: 'TEXT',
                    artist_id: 'TEXT',
                    time: 'TEXT',
                    artist_name: 'TEXT',
                    album_name: 'TEXT',
                    sp_playlist_id: 'TEXT',
                    song_path: 'TEXT',
                    title_url: 'TEXT',
                    serial_no: 'TEXT',
                    FileSize: 'INTEGER',
                    TimeInterval: 'INTEGER',
                    Mediatype: 'TEXT',
                    refreshtime: 'TEXT'
                }
            },
            prayer: {
                name: 'prayer',
                columns: {
                    _id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
                    prayer_time: 'TEXT',
                    prayer_name: 'TEXT',
                    is_active: 'INTEGER',
                    prayer_date: 'TEXT',
                    start_time: 'TEXT',
                    end_time: 'TEXT'
                }
            },
            advertisement: {
                name: 'advertisement',
                columns: {
                    _id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
                    adv_file_url: 'TEXT',
                    adv_id: 'TEXT',
                    adv_name: 'TEXT',
                    adv_is_min: 'INTEGER',
                    adv_is_song: 'INTEGER',
                    adv_is_time: 'INTEGER',
                    adv_ply_type: 'TEXT',
                    adv_sound_type: 'TEXT',
                    adv_serial_no: 'TEXT',
                    adv_total_min: 'INTEGER',
                    adv_total_songs: 'INTEGER',
                    adv_e_date: 'TEXT',
                    adv_s_date: 'TEXT',
                    adv_s_time: 'TEXT',
                    adv_path: 'TEXT',
                    is_downloaded: 'INTEGER'
                }
            },
            table_player_status: {
                name: 'table_player_status',
                columns: {
                    _id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
                    login_date: 'TEXT',
                    login_time: 'TEXT',
                    logout_date: 'TEXT',
                    logout_time: 'TEXT',
                    artist_id_song: 'TEXT',
                    played_date_time_song: 'TEXT',
                    title_id_song: 'TEXT',
                    sp_playlist_id_song: 'TEXT',
                    heartbeat_datetime: 'TEXT',
                    advertisement_id_status: 'TEXT',
                    advertisement_played_date: 'TEXT',
                    advertisement_played_time: 'TEXT',
                    prayer_played_date: 'TEXT',
                    prayer_played_time: 'TEXT',
                    is_player_status_type: 'TEXT'
                }
            }
        };
        
        this.TAG = 'DatabaseManager';
    }

    /**
     * Initialize database - mirrors SQLiteOpenHelper onCreate()
     */
    async initialize() {
        try {
            console.log(`[${this.TAG}] Initializing database: ${this.dbName} v${this.version}`);
            
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);
                
                request.onerror = (event) => {
                    console.error(`[${this.TAG}] Database open error:`, event.target.error);
                    reject(event.target.error);
                };
                
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.log(`[${this.TAG}] Database opened successfully`);
                    resolve(this.db);
                };
                
                request.onupgradeneeded = (event) => {
                    console.log(`[${this.TAG}] Database upgrade needed from v${event.oldVersion} to v${event.newVersion}`);
                    this.createTables(event.target.result);
                };
            });
        } catch (error) {
            console.error(`[${this.TAG}] Initialization failed:`, error);
            throw error;
        }
    }

    /**
     * Create all tables - mirrors SQLiteOpenHelper onCreate()
     */
    createTables(db) {
        console.log(`[${this.TAG}] Creating tables...`);
        
        // Create playlist table
        if (!db.objectStoreNames.contains('playlist')) {
            const playlistStore = db.createObjectStore('playlist', { 
                keyPath: '_id', 
                autoIncrement: true 
            });
            
            // Create indexes for common queries
            playlistStore.createIndex('sp_playlist_id', 'sp_playlist_id', { unique: false });
            playlistStore.createIndex('start_time', 'start_time', { unique: false });
            playlistStore.createIndex('end_time', 'end_time', { unique: false });
            playlistStore.createIndex('token_id', 'token_id', { unique: false });
            console.log(`[${this.TAG}] Created playlist table`);
        }

        // Create songs table
        if (!db.objectStoreNames.contains('songs')) {
            const songsStore = db.createObjectStore('songs', { 
                keyPath: '_id', 
                autoIncrement: true 
            });
            
            songsStore.createIndex('title_id', 'title_id', { unique: false });
            songsStore.createIndex('sp_playlist_id', 'sp_playlist_id', { unique: false });
            songsStore.createIndex('is_downloaded', 'is_downloaded', { unique: false });
            songsStore.createIndex('sch_id', 'sch_id', { unique: false });
            console.log(`[${this.TAG}] Created songs table`);
        }

        // Create prayer table
        if (!db.objectStoreNames.contains('prayer')) {
            const prayerStore = db.createObjectStore('prayer', { 
                keyPath: '_id', 
                autoIncrement: true 
            });
            
            prayerStore.createIndex('prayer_time', 'prayer_time', { unique: false });
            prayerStore.createIndex('is_active', 'is_active', { unique: false });
            prayerStore.createIndex('prayer_date', 'prayer_date', { unique: false });
            console.log(`[${this.TAG}] Created prayer table`);
        }

        // Create advertisement table
        if (!db.objectStoreNames.contains('advertisement')) {
            const advStore = db.createObjectStore('advertisement', { 
                keyPath: '_id', 
                autoIncrement: true 
            });
            
            advStore.createIndex('adv_id', 'adv_id', { unique: false });
            advStore.createIndex('adv_serial_no', 'adv_serial_no', { unique: false });
            advStore.createIndex('is_downloaded', 'is_downloaded', { unique: false });
            console.log(`[${this.TAG}] Created advertisement table`);
        }

        // Create player_status table
        if (!db.objectStoreNames.contains('table_player_status')) {
            const statusStore = db.createObjectStore('table_player_status', { 
                keyPath: '_id', 
                autoIncrement: true 
            });
            
            statusStore.createIndex('is_player_status_type', 'is_player_status_type', { unique: false });
            statusStore.createIndex('played_date_time_song', 'played_date_time_song', { unique: false });
            statusStore.createIndex('heartbeat_datetime', 'heartbeat_datetime', { unique: false });
            console.log(`[${this.TAG}] Created table_player_status table`);
        }
    }

    /**
     * Get transaction for table operations
     */
    getTransaction(storeName, mode = 'readonly') {
        if (!this.db) {
            throw new Error(`[${this.TAG}] Database not initialized`);
        }
        return this.db.transaction(storeName, mode);
    }

    /**
     * Get object store for operations
     */
    getObjectStore(storeName, mode = 'readonly') {
        const transaction = this.getTransaction(storeName, mode);
        return transaction.objectStore(storeName);
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            console.log(`[${this.TAG}] Database closed`);
        }
    }

    /**
     * Clear all data - for testing/reset
     */
    async clearAllData() {
        try {
            const tables = Object.keys(this.tables);
            for (const tableName of tables) {
                const store = this.getObjectStore(tableName, 'readwrite');
                await store.clear();
                console.log(`[${this.TAG}] Cleared table: ${tableName}`);
            }
            console.log(`[${this.TAG}] All data cleared successfully`);
        } catch (error) {
            console.error(`[${this.TAG}] Error clearing data:`, error);
            throw error;
        }
    }

    /**
     * Get database info - mirrors database info methods
     */
    async getDatabaseInfo() {
        try {
            const info = {
                name: this.dbName,
                version: this.version,
                tables: {}
            };

            for (const tableName of Object.keys(this.tables)) {
                const store = this.getObjectStore(tableName);
                const count = await store.count();
                info.tables[tableName] = {
                    name: tableName,
                    recordCount: count,
                    columns: Object.keys(this.tables[tableName].columns)
                };
            }

            console.log(`[${this.TAG}] Database info:`, info);
            return info;
        } catch (error) {
            console.error(`[${this.TAG}] Error getting database info:`, error);
            throw error;
        }
    }

    /**
     * Check if database is ready
     */
    isReady() {
        return this.db !== null;
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
    module.exports = DatabaseManager;
} else if (typeof window !== 'undefined') {
    window.DatabaseManager = DatabaseManager;
}
