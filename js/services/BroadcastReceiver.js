/**
 * BroadcastReceiver - Mirrors MyReceiver.java functionality
 * Complete broadcast event handling system for webOS Signage
 */

class BroadcastReceiver {
    constructor() {
        this.TAG = 'BroadcastReceiver';
        
        // Receiver state
        this.isRegistered = false;
        this.receivers = new Map();
        this.broadcastQueue = [];
        
        // Event listeners
        this.eventListeners = {
            'broadcastReceived': [],
            'receiverRegistered': [],
            'receiverUnregistered': [],
            'error': []
        };
        
        // Broadcast actions (mirroring Android broadcast actions)
        this.BROADCAST_ACTIONS = {
            // System broadcasts
            BOOT_COMPLETED: 'android.intent.action.BOOT_COMPLETED',
            PACKAGE_REPLACED: 'android.intent.action.PACKAGE_REPLACED',
            PACKAGE_ADDED: 'android.intent.action.PACKAGE_ADDED',
            PACKAGE_REMOVED: 'android.intent.action.PACKAGE_REMOVED',
            
            // Application broadcasts
            CONTENT_REFRESH: 'com.smc.signage.CONTENT_REFRESH',
            PLAYLIST_CHANGED: 'com.smc.signage.PLAYLIST_CHANGED',
            DOWNLOAD_COMPLETED: 'com.smc.signage.DOWNLOAD_COMPLETED',
            STATUS_UPDATE: 'com.smc.signage.STATUS_UPDATE',
            SERVICE_RESTART: 'com.smc.signage.SERVICE_RESTART',
            
            // Media broadcasts
            MEDIA_PLAYBACK_STARTED: 'com.smc.signage.MEDIA_PLAYBACK_STARTED',
            MEDIA_PLAYBACK_PAUSED: 'com.smc.signage.MEDIA_PLAYBACK_PAUSED',
            MEDIA_PLAYBACK_STOPPED: 'com.smc.signage.MEDIA_PLAYBACK_STOPPED',
            MEDIA_PLAYBACK_COMPLETED: 'com.smc.signage.MEDIA_PLAYBACK_COMPLETED',
            
            // Network broadcasts
            NETWORK_CONNECTED: 'com.smc.signage.NETWORK_CONNECTED',
            NETWORK_DISCONNECTED: 'com.smc.signage.NETWORK_DISCONNECTED',
            NETWORK_SLOW: 'com.smc.signage.NETWORK_SLOW',
            
            // Device broadcasts
            BATTERY_LOW: 'com.smc.signage.BATTERY_LOW',
            STORAGE_LOW: 'com.smc.signage.STORAGE_LOW',
            MEMORY_LOW: 'com.smc.signage.MEMORY_LOW',
            
            // Custom broadcasts
            CUSTOM_ACTION: 'com.smc.signage.CUSTOM_ACTION'
        };
    }

    /**
     * Register broadcast receiver
     * Mirrors: MyReceiver registration logic
     */
    async register() {
        try {
            console.log(`[${this.TAG}] Registering broadcast receiver`);
            
            if (this.isRegistered) {
                console.log(`[${this.TAG}] Broadcast receiver already registered`);
                return true;
            }
            
            // Register system event listeners
            this.registerSystemEventListeners();
            
            // Register application event listeners
            this.registerApplicationEventListeners();
            
            // Register network event listeners
            this.registerNetworkEventListeners();
            
            // Register device event listeners
            this.registerDeviceEventListeners();
            
            // Set registered state
            this.isRegistered = true;
            
            // Process any queued broadcasts
            await this.processBroadcastQueue();
            
            // Emit receiver registered event
            this.emitEvent('receiverRegistered', { registeredAt: new Date() });
            
            console.log(`[${this.TAG}] Broadcast receiver registered successfully`);
            return true;
        } catch (error) {
            this.handleError(error, 'register');
            throw error;
        }
    }

    /**
     * Unregister broadcast receiver
     */
    async unregister() {
        try {
            console.log(`[${this.TAG}] Unregistering broadcast receiver`);
            
            if (!this.isRegistered) {
                console.log(`[${this.TAG}] Broadcast receiver not registered`);
                return true;
            }
            
            // Unregister all event listeners
            this.unregisterAllEventListeners();
            
            // Clear receivers
            this.receivers.clear();
            
            // Set registered state
            this.isRegistered = false;
            
            // Emit receiver unregistered event
            this.emitEvent('receiverUnregistered', { unregisteredAt: new Date() });
            
            console.log(`[${this.TAG}] Broadcast receiver unregistered successfully`);
            return true;
        } catch (error) {
            this.handleError(error, 'unregister');
            throw error;
        }
    }

    /**
     * Register system event listeners
     */
    registerSystemEventListeners() {
        try {
            console.log(`[${this.TAG}] Registering system event listeners`);
            
            // Listen for page visibility changes (app foreground/background)
            document.addEventListener('visibilitychange', (event) => {
                this.handleSystemBroadcast({
                    action: document.hidden ? 'APP_BACKGROUND' : 'APP_FOREGROUND',
                    data: {
                        hidden: document.hidden,
                        visibilityState: document.visibilityState
                    },
                    timestamp: new Date()
                });
            });
            
            // Listen for page load/unload
            window.addEventListener('load', (event) => {
                this.handleSystemBroadcast({
                    action: this.BROADCAST_ACTIONS.BOOT_COMPLETED,
                    data: {
                        url: window.location.href
                    },
                    timestamp: new Date()
                });
            });
            
            window.addEventListener('beforeunload', (event) => {
                this.handleSystemBroadcast({
                    action: 'APP_UNLOAD',
                    data: {
                        url: window.location.href
                    },
                    timestamp: new Date()
                });
            });
            
            // Listen for online/offline events
            window.addEventListener('online', (event) => {
                this.handleSystemBroadcast({
                    action: this.BROADCAST_ACTIONS.NETWORK_CONNECTED,
                    data: {
                        online: true
                    },
                    timestamp: new Date()
                });
            });
            
            window.addEventListener('offline', (event) => {
                this.handleSystemBroadcast({
                    action: this.BROADCAST_ACTIONS.NETWORK_DISCONNECTED,
                    data: {
                        online: false
                    },
                    timestamp: new Date()
                });
            });
            
            console.log(`[${this.TAG}] System event listeners registered`);
        } catch (error) {
            console.error(`[${this.TAG}] Error registering system event listeners:`, error);
        }
    }

    /**
     * Register application event listeners
     */
    registerApplicationEventListeners() {
        try {
            console.log(`[${this.TAG}] Registering application event listeners`);
            
            // Listen for storage events (cross-tab communication)
            window.addEventListener('storage', (event) => {
                if (event.key && event.key.startsWith('smc_broadcast_')) {
                    try {
                        const broadcast = JSON.parse(event.newValue);
                        this.handleApplicationBroadcast(broadcast);
                    } catch (parseError) {
                        console.warn(`[${this.TAG}] Could not parse storage broadcast:`, parseError);
                    }
                }
            });
            
            // Listen for custom application events
            document.addEventListener('smcBroadcast', (event) => {
                this.handleApplicationBroadcast(event.detail);
            });
            
            console.log(`[${this.TAG}] Application event listeners registered`);
        } catch (error) {
            console.error(`[${this.TAG}] Error registering application event listeners:`, error);
        }
    }

    /**
     * Register network event listeners
     */
    registerNetworkEventListeners() {
        try {
            console.log(`[${this.TAG}] Registering network event listeners`);
            
            // Monitor network connection quality
            if (navigator.connection) {
                navigator.connection.addEventListener('change', (event) => {
                    const connection = navigator.connection;
                    
                    let networkAction = this.BROADCAST_ACTIONS.NETWORK_CONNECTED;
                    
                    if (!connection.effectiveType || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                        networkAction = this.BROADCAST_ACTIONS.NETWORK_SLOW;
                    }
                    
                    this.handleNetworkBroadcast({
                        action: networkAction,
                        data: {
                            effectiveType: connection.effectiveType,
                            downlink: connection.downlink,
                            rtt: connection.rtt,
                            saveData: connection.saveData
                        },
                        timestamp: new Date()
                    });
                });
            }
            
            console.log(`[${this.TAG}] Network event listeners registered`);
        } catch (error) {
            console.error(`[${this.TAG}] Error registering network event listeners:`, error);
        }
    }

    /**
     * Register device event listeners
     */
    registerDeviceEventListeners() {
        try {
            console.log(`[${this.TAG}] Registering device event listeners`);
            
            // Monitor battery status
            if (navigator.getBattery) {
                navigator.getBattery().then(battery => {
                    // Listen for battery level changes
                    battery.addEventListener('levelchange', (event) => {
                        if (battery.level < 0.2) { // Less than 20%
                            this.handleDeviceBroadcast({
                                action: this.BROADCAST_ACTIONS.BATTERY_LOW,
                                data: {
                                    level: battery.level,
                                    charging: battery.charging
                                },
                                timestamp: new Date()
                            });
                        }
                    });
                    
                    // Listen for charging status changes
                    battery.addEventListener('chargingchange', (event) => {
                        this.handleDeviceBroadcast({
                            action: battery.charging ? 'BATTERY_CHARGING' : 'BATTERY_DISCHARGING',
                            data: {
                                level: battery.level,
                                charging: battery.charging
                            },
                            timestamp: new Date()
                        });
                    });
                });
            }
            
            // Monitor memory status
            if (performance && performance.memory) {
                setInterval(() => {
                    const memoryInfo = performance.memory;
                    const memoryUsage = (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;
                    
                    if (memoryUsage > 90) { // More than 90% memory usage
                        this.handleDeviceBroadcast({
                            action: this.BROADCAST_ACTIONS.MEMORY_LOW,
                            data: {
                                used: memoryInfo.usedJSHeapSize,
                                total: memoryInfo.jsHeapSizeLimit,
                                usage: memoryUsage
                            },
                            timestamp: new Date()
                        });
                    }
                }, 30000); // Check every 30 seconds
            }
            
            console.log(`[${this.TAG}] Device event listeners registered`);
        } catch (error) {
            console.error(`[${this.TAG}] Error registering device event listeners:`, error);
        }
    }

    /**
     * Unregister all event listeners
     */
    unregisterAllEventListeners() {
        try {
            console.log(`[${this.TAG}] Unregistering all event listeners`);
            
            // Remove system event listeners
            document.removeEventListener('visibilitychange', this.handleSystemBroadcast);
            window.removeEventListener('load', this.handleSystemBroadcast);
            window.removeEventListener('beforeunload', this.handleSystemBroadcast);
            window.removeEventListener('online', this.handleSystemBroadcast);
            window.removeEventListener('offline', this.handleSystemBroadcast);
            
            // Remove application event listeners
            window.removeEventListener('storage', this.handleApplicationBroadcast);
            document.removeEventListener('smcBroadcast', this.handleApplicationBroadcast);
            
            // Remove network event listeners
            if (navigator.connection) {
                navigator.connection.removeEventListener('change', this.handleNetworkBroadcast);
            }
            
            console.log(`[${this.TAG}] All event listeners unregistered`);
        } catch (error) {
            console.error(`[${this.TAG}] Error unregistering event listeners:`, error);
        }
    }

    /**
     * Handle system broadcast
     */
    handleSystemBroadcast(broadcast) {
        try {
            console.log(`[${this.TAG}] Handling system broadcast: ${broadcast.action}`);
            
            // Add system-specific metadata
            broadcast.type = 'system';
            broadcast.source = 'system';
            
            // Process the broadcast
            this.processBroadcast(broadcast);
        } catch (error) {
            this.handleError(error, 'handleSystemBroadcast');
        }
    }

    /**
     * Handle application broadcast
     */
    handleApplicationBroadcast(broadcast) {
        try {
            console.log(`[${this.TAG}] Handling application broadcast: ${broadcast.action}`);
            
            // Add application-specific metadata
            broadcast.type = 'application';
            broadcast.source = 'application';
            
            // Process the broadcast
            this.processBroadcast(broadcast);
        } catch (error) {
            this.handleError(error, 'handleApplicationBroadcast');
        }
    }

    /**
     * Handle network broadcast
     */
    handleNetworkBroadcast(broadcast) {
        try {
            console.log(`[${this.TAG}] Handling network broadcast: ${broadcast.action}`);
            
            // Add network-specific metadata
            broadcast.type = 'network';
            broadcast.source = 'network';
            
            // Process the broadcast
            this.processBroadcast(broadcast);
        } catch (error) {
            this.handleError(error, 'handleNetworkBroadcast');
        }
    }

    /**
     * Handle device broadcast
     */
    handleDeviceBroadcast(broadcast) {
        try {
            console.log(`[${this.TAG}] Handling device broadcast: ${broadcast.action}`);
            
            // Add device-specific metadata
            broadcast.type = 'device';
            broadcast.source = 'device';
            
            // Process the broadcast
            this.processBroadcast(broadcast);
        } catch (error) {
            this.handleError(error, 'handleDeviceBroadcast');
        }
    }

    /**
     * Process broadcast
     */
    processBroadcast(broadcast) {
        try {
            console.log(`[${this.TAG}] Processing broadcast: ${broadcast.action}`);
            
            // Add processing metadata
            broadcast.processedAt = new Date();
            broadcast.id = this.generateBroadcastId();
            
            // Find registered receivers for this action
            const receivers = this.receivers.get(broadcast.action) || [];
            
            // Send broadcast to all registered receivers
            receivers.forEach(receiver => {
                try {
                    receiver(broadcast);
                } catch (receiverError) {
                    console.error(`[${this.TAG}] Error in broadcast receiver:`, receiverError);
                }
            });
            
            // Emit broadcast received event
            this.emitEvent('broadcastReceived', broadcast);
            
            console.log(`[${this.TAG}] Broadcast processed: ${broadcast.action}`);
        } catch (error) {
            this.handleError(error, 'processBroadcast');
            throw error;
        }
    }

    /**
     * Process broadcast queue
     */
    async processBroadcastQueue() {
        try {
            console.log(`[${this.TAG}] Processing broadcast queue (${this.broadcastQueue.length} items)`);
            
            while (this.broadcastQueue.length > 0) {
                const broadcast = this.broadcastQueue.shift();
                await this.processBroadcast(broadcast);
            }
            
            console.log(`[${this.TAG}] Broadcast queue processed`);
        } catch (error) {
            this.handleError(error, 'processBroadcastQueue');
            throw error;
        }
    }

    /**
     * Send broadcast
     */
    sendBroadcast(action, data = {}, options = {}) {
        try {
            const broadcast = {
                action: action,
                data: data,
                timestamp: new Date(),
                sender: 'BroadcastReceiver',
                ...options
            };
            
            if (this.isRegistered) {
                // Process immediately if registered
                this.processBroadcast(broadcast);
            } else {
                // Queue for later processing if not registered
                this.broadcastQueue.push(broadcast);
                console.log(`[${this.TAG}] Broadcast queued: ${action}`);
            }
            
            // Also send via storage for cross-tab communication
            if (options.crossTab !== false) {
                const storageKey = `smc_broadcast_${Date.now()}`;
                localStorage.setItem(storageKey, JSON.stringify(broadcast));
                
                // Remove after a short delay
                setTimeout(() => {
                    localStorage.removeItem(storageKey);
                }, 1000);
            }
            
            console.log(`[${this.TAG}] Broadcast sent: ${action}`);
            return broadcast.id;
        } catch (error) {
            this.handleError(error, 'sendBroadcast');
            throw error;
        }
    }

    /**
     * Register receiver for specific action
     */
    registerReceiver(action, receiver) {
        try {
            console.log(`[${this.TAG}] Registering receiver for action: ${action}`);
            
            if (!this.receivers.has(action)) {
                this.receivers.set(action, []);
            }
            
            this.receivers.get(action).push(receiver);
            
            console.log(`[${this.TAG}] Receiver registered for action: ${action}`);
        } catch (error) {
            this.handleError(error, 'registerReceiver');
            throw error;
        }
    }

    /**
     * Unregister receiver for specific action
     */
    unregisterReceiver(action, receiver) {
        try {
            console.log(`[${this.TAG}] Unregistering receiver for action: ${action}`);
            
            const receivers = this.receivers.get(action);
            if (receivers) {
                const index = receivers.indexOf(receiver);
                if (index > -1) {
                    receivers.splice(index, 1);
                }
                
                if (receivers.length === 0) {
                    this.receivers.delete(action);
                }
            }
            
            console.log(`[${this.TAG}] Receiver unregistered for action: ${action}`);
        } catch (error) {
            this.handleError(error, 'unregisterReceiver');
            throw error;
        }
    }

    /**
     * Generate broadcast ID
     */
    generateBroadcastId() {
        return `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get receiver status
     */
    getReceiverStatus() {
        return {
            isRegistered: this.isRegistered,
            registeredReceivers: Array.from(this.receivers.keys()),
            queuedBroadcasts: this.broadcastQueue.length,
            supportedActions: Object.keys(this.BROADCAST_ACTIONS)
        };
    }

    /**
     * Get broadcast actions
     */
    getBroadcastActions() {
        return { ...this.BROADCAST_ACTIONS };
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
    module.exports = BroadcastReceiver;
} else if (typeof window !== 'undefined') {
    window.BroadcastReceiver = BroadcastReceiver;
}
