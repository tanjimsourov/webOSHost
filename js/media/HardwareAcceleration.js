/**
 * HardwareAcceleration - Hardware acceleration support for webOS Signage
 * Complete GPU optimization and hardware acceleration management
 */

class HardwareAcceleration {
    constructor() {
        this.TAG = 'HardwareAcceleration';
        
        // Hardware acceleration state
        this.isSupported = false;
        this.isEnabled = false;
        this.gpuInfo = null;
        
        // Performance metrics
        this.performanceMetrics = {
            frameRate: 0,
            droppedFrames: 0,
            renderingTime: 0,
            memoryUsage: 0,
            gpuUtilization: 0
        };
        
        // Configuration
        this.config = {
            enableByDefault: true,
            forceHardwareAcceleration: false,
            maxFrameRate: 60,
            targetFrameRate: 30,
            memoryThreshold: 0.8, // 80% memory usage threshold
            gpuThreshold: 0.9, // 90% GPU utilization threshold
            ...this.getDefaultConfig()
        };
        
        // Event listeners
        this.eventListeners = {
            'hardwareAccelerationEnabled': [],
            'hardwareAccelerationDisabled': [],
            'performanceWarning': [],
            'gpuInfoUpdated': [],
            'error': []
        };
        
        // Initialize hardware acceleration
        this.initializeHardwareAcceleration();
    }

    /**
     * Initialize hardware acceleration
     */
    initializeHardwareAcceleration() {
        try {
            console.log(`[${this.TAG}] Initializing hardware acceleration`);
            
            // Detect hardware acceleration support
            this.detectHardwareAccelerationSupport();
            
            // Get GPU information
            this.getGPUInfo();
            
            // Set up performance monitoring
            this.setupPerformanceMonitoring();
            
            // Enable hardware acceleration if supported
            if (this.isSupported && this.config.enableByDefault) {
                this.enableHardwareAcceleration();
            }
            
            console.log(`[${this.TAG}] Hardware acceleration initialized`);
            console.log(`[${this.TAG}] Supported: ${this.isSupported}, Enabled: ${this.isEnabled}`);
        } catch (error) {
            this.handleError(error, 'initializeHardwareAcceleration');
            throw error;
        }
    }

    /**
     * Detect hardware acceleration support
     */
    detectHardwareAccelerationSupport() {
        try {
            console.log(`[${this.TAG}] Detecting hardware acceleration support`);
            
            // Check for WebGL support
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (gl) {
                this.isSupported = true;
                
                // Check for specific GPU features
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                    console.log(`[${this.TAG}] GPU Renderer: ${renderer}`);
                }
                
                // Check for hardware acceleration indicators
                this.checkHardwareAccelerationIndicators();
            } else {
                this.isSupported = false;
                console.warn(`[${this.TAG}] WebGL not supported, hardware acceleration unavailable`);
            }
            
        } catch (error) {
            console.error(`[${this.TAG}] Error detecting hardware acceleration support:`, error);
            this.isSupported = false;
        }
    }

    /**
     * Check hardware acceleration indicators
     */
    checkHardwareAccelerationIndicators() {
        try {
            // Check for CSS 3D transforms support
            const testElement = document.createElement('div');
            testElement.style.transform = 'translateZ(0)';
            const has3DTransforms = testElement.style.transform !== '';
            
            // Check for GPU acceleration in CSS
            const hasGPUAcceleration = window.CSS && CSS.supports && CSS.supports('transform', 'translateZ(0)');
            
            // Check for requestAnimationFrame support
            const hasRequestAnimationFrame = typeof requestAnimationFrame === 'function';
            
            // Check for performance.now() support
            const hasPerformanceNow = typeof performance.now === 'function';
            
            console.log(`[${this.TAG}] Hardware acceleration indicators:`, {
                has3DTransforms,
                hasGPUAcceleration,
                hasRequestAnimationFrame,
                hasPerformanceNow
            });
            
            // Update support status based on indicators
            if (!has3DTransforms || !hasRequestAnimationFrame || !hasPerformanceNow) {
                console.warn(`[${this.TAG}] Some hardware acceleration indicators missing`);
            }
            
        } catch (error) {
            console.error(`[${this.TAG}] Error checking hardware acceleration indicators:`, error);
        }
    }

    /**
     * Get GPU information
     */
    getGPUInfo() {
        try {
            console.log(`[${this.TAG}] Getting GPU information`);
            
            this.gpuInfo = {
                vendor: 'Unknown',
                renderer: 'Unknown',
                version: 'Unknown',
                maxTextureSize: 0,
                maxViewportSize: 0,
                shadingLanguageVersion: 'Unknown',
                extensions: []
            };
            
            // Try to get WebGL GPU info
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (gl) {
                // Get debug info
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    this.gpuInfo.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                    this.gpuInfo.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
                
                // Get version info
                this.gpuInfo.version = gl.getParameter(gl.VERSION);
                this.gpuInfo.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
                
                // Get limits
                this.gpuInfo.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
                this.gpuInfo.maxViewportSize = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
                
                // Get extensions
                const extensions = gl.getSupportedExtensions();
                this.gpuInfo.extensions = extensions || [];
                
                console.log(`[${this.TAG}] GPU info:`, this.gpuInfo);
                
                // Emit GPU info updated event
                this.emitEvent('gpuInfoUpdated', this.gpuInfo);
            }
            
        } catch (error) {
            console.error(`[${this.TAG}] Error getting GPU information:`, error);
        }
    }

    /**
     * Set up performance monitoring
     */
    setupPerformanceMonitoring() {
        try {
            console.log(`[${this.TAG}] Setting up performance monitoring`);
            
            // Monitor frame rate
            this.monitorFrameRate();
            
            // Monitor memory usage
            this.monitorMemoryUsage();
            
            // Monitor GPU utilization (if available)
            this.monitorGPUUtilization();
            
            console.log(`[${this.TAG}] Performance monitoring set up`);
        } catch (error) {
            console.error(`[${this.TAG}] Error setting up performance monitoring:`, error);
        }
    }

    /**
     * Monitor frame rate
     */
    monitorFrameRate() {
        try {
            let lastTime = performance.now();
            let frameCount = 0;
            
            const measureFrameRate = (currentTime) => {
                frameCount++;
                
                if (currentTime - lastTime >= 1000) {
                    this.performanceMetrics.frameRate = Math.round(frameCount * 1000 / (currentTime - lastTime));
                    frameCount = 0;
                    lastTime = currentTime;
                    
                    // Check for performance warnings
                    if (this.performanceMetrics.frameRate < this.config.targetFrameRate) {
                        this.emitPerformanceWarning('low_frame_rate', {
                            currentFrameRate: this.performanceMetrics.frameRate,
                            targetFrameRate: this.config.targetFrameRate
                        });
                    }
                }
                
                if (this.isEnabled) {
                    requestAnimationFrame(measureFrameRate);
                }
            };
            
            if (this.isEnabled) {
                requestAnimationFrame(measureFrameRate);
            }
            
        } catch (error) {
            console.error(`[${this.TAG}] Error monitoring frame rate:`, error);
        }
    }

    /**
     * Monitor memory usage
     */
    monitorMemoryUsage() {
        try {
            setInterval(() => {
                if (performance && performance.memory) {
                    const memoryInfo = performance.memory;
                    const usedMemory = memoryInfo.usedJSHeapSize;
                    const totalMemory = memoryInfo.totalJSHeapSize;
                    const memoryUsage = usedMemory / totalMemory;
                    
                    this.performanceMetrics.memoryUsage = memoryUsage;
                    
                    // Check for memory warnings
                    if (memoryUsage > this.config.memoryThreshold) {
                        this.emitPerformanceWarning('high_memory_usage', {
                            memoryUsage: memoryUsage,
                            usedMemory: usedMemory,
                            totalMemory: totalMemory
                        });
                    }
                }
            }, 5000); // Check every 5 seconds
            
        } catch (error) {
            console.error(`[${this.TAG}] Error monitoring memory usage:`, error);
        }
    }

    /**
     * Monitor GPU utilization
     */
    monitorGPUUtilization() {
        try {
            // GPU utilization monitoring is not directly available in web browsers
            // We'll estimate based on performance metrics
            setInterval(() => {
                if (this.isEnabled && this.performanceMetrics.frameRate > 0) {
                    // Estimate GPU utilization based on frame rate and rendering complexity
                    const targetFrameRate = this.config.targetFrameRate;
                    const currentFrameRate = this.performanceMetrics.frameRate;
                    
                    if (currentFrameRate < targetFrameRate) {
                        // Low frame rate might indicate high GPU utilization
                        this.performanceMetrics.gpuUtilization = 0.8;
                    } else {
                        this.performanceMetrics.gpuUtilization = 0.3;
                    }
                    
                    // Check for GPU warnings
                    if (this.performanceMetrics.gpuUtilization > this.config.gpuThreshold) {
                        this.emitPerformanceWarning('high_gpu_utilization', {
                            gpuUtilization: this.performanceMetrics.gpuUtilization,
                            frameRate: currentFrameRate
                        });
                    }
                }
            }, 3000); // Check every 3 seconds
            
        } catch (error) {
            console.error(`[${this.TAG}] Error monitoring GPU utilization:`, error);
        }
    }

    /**
     * Enable hardware acceleration
     */
    enableHardwareAcceleration() {
        try {
            console.log(`[${this.TAG}] Enabling hardware acceleration`);
            
            if (!this.isSupported) {
                console.warn(`[${this.TAG}] Hardware acceleration not supported`);
                return false;
            }
            
            // Apply hardware acceleration styles to all video elements
            this.applyHardwareAccelerationToVideos();
            
            // Apply hardware acceleration to canvas elements
            this.applyHardwareAccelerationToCanvas();
            
            // Apply hardware acceleration to media containers
            this.applyHardwareAccelerationToContainers();
            
            // Update state
            this.isEnabled = true;
            
            // Save configuration
            this.saveConfiguration();
            
            // Emit event
            this.emitEvent('hardwareAccelerationEnabled', {
                timestamp: new Date(),
                gpuInfo: this.gpuInfo
            });
            
            console.log(`[${this.TAG}] Hardware acceleration enabled`);
            return true;
        } catch (error) {
            this.handleError(error, 'enableHardwareAcceleration');
            throw error;
        }
    }

    /**
     * Disable hardware acceleration
     */
    disableHardwareAcceleration() {
        try {
            console.log(`[${this.TAG}] Disabling hardware acceleration`);
            
            // Remove hardware acceleration styles
            this.removeHardwareAccelerationFromVideos();
            this.removeHardwareAccelerationFromCanvas();
            this.removeHardwareAccelerationFromContainers();
            
            // Update state
            this.isEnabled = false;
            
            // Save configuration
            this.saveConfiguration();
            
            // Emit event
            this.emitEvent('hardwareAccelerationDisabled', {
                timestamp: new Date()
            });
            
            console.log(`[${this.TAG}] Hardware acceleration disabled`);
            return true;
        } catch (error) {
            this.handleError(error, 'disableHardwareAcceleration');
            throw error;
        }
    }

    /**
     * Apply hardware acceleration to videos
     */
    applyHardwareAccelerationToVideos() {
        try {
            const videos = document.querySelectorAll('video');
            
            videos.forEach(video => {
                // Apply hardware acceleration styles
                video.style.transform = 'translateZ(0)';
                video.style.webkitTransform = 'translateZ(0)';
                video.style.backfaceVisibility = 'hidden';
                video.style.webkitBackfaceVisibility = 'hidden';
                video.style.perspective = '1000px';
                video.style.webkitPerspective = '1000px';
                
                // Enable hardware decode if available
                if (video.decode) {
                    video.decode().catch(error => {
                        console.warn(`[${this.TAG}] Video decode failed:`, error);
                    });
                }
            });
            
            console.log(`[${this.TAG}] Applied hardware acceleration to ${videos.length} video elements`);
        } catch (error) {
            console.error(`[${this.TAG}] Error applying hardware acceleration to videos:`, error);
        }
    }

    /**
     * Apply hardware acceleration to canvas
     */
    applyHardwareAccelerationToCanvas() {
        try {
            const canvases = document.querySelectorAll('canvas');
            
            canvases.forEach(canvas => {
                // Apply hardware acceleration styles
                canvas.style.transform = 'translateZ(0)';
                canvas.style.webkitTransform = 'translateZ(0)';
                canvas.style.imageRendering = 'optimizeSpeed';
                canvas.style.webkitImageRendering = 'optimizeSpeed';
                
                // Enable hardware acceleration for 2D context
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // Some browsers support hardware acceleration hints
                    ctx.imageSmoothingEnabled = false;
                }
            });
            
            console.log(`[${this.TAG}] Applied hardware acceleration to ${canvases.length} canvas elements`);
        } catch (error) {
            console.error(`[${this.TAG}] Error applying hardware acceleration to canvas:`, error);
        }
    }

    /**
     * Apply hardware acceleration to containers
     */
    applyHardwareAccelerationToContainers() {
        try {
            const containers = document.querySelectorAll('.media-container, .video-container, .player-container');
            
            containers.forEach(container => {
                // Apply hardware acceleration styles
                container.style.transform = 'translateZ(0)';
                container.style.webkitTransform = 'translateZ(0)';
                container.style.willChange = 'transform';
                container.style.webkitWillChange = 'transform';
                
                // Create compositing layer
                container.style.position = 'relative';
                container.style.zIndex = '1';
            });
            
            console.log(`[${this.TAG}] Applied hardware acceleration to ${containers.length} container elements`);
        } catch (error) {
            console.error(`[${this.TAG}] Error applying hardware acceleration to containers:`, error);
        }
    }

    /**
     * Remove hardware acceleration from videos
     */
    removeHardwareAccelerationFromVideos() {
        try {
            const videos = document.querySelectorAll('video');
            
            videos.forEach(video => {
                // Remove hardware acceleration styles
                video.style.transform = '';
                video.style.webkitTransform = '';
                video.style.backfaceVisibility = '';
                video.style.webkitBackfaceVisibility = '';
                video.style.perspective = '';
                video.style.webkitPerspective = '';
            });
            
            console.log(`[${this.TAG}] Removed hardware acceleration from ${videos.length} video elements`);
        } catch (error) {
            console.error(`[${this.TAG}] Error removing hardware acceleration from videos:`, error);
        }
    }

    /**
     * Remove hardware acceleration from canvas
     */
    removeHardwareAccelerationFromCanvas() {
        try {
            const canvases = document.querySelectorAll('canvas');
            
            canvases.forEach(canvas => {
                // Remove hardware acceleration styles
                canvas.style.transform = '';
                canvas.style.webkitTransform = '';
                canvas.style.imageRendering = '';
                canvas.style.webkitImageRendering = '';
            });
            
            console.log(`[${this.TAG}] Removed hardware acceleration from ${canvases.length} canvas elements`);
        } catch (error) {
            console.error(`[${this.TAG}] Error removing hardware acceleration from canvas:`, error);
        }
    }

    /**
     * Remove hardware acceleration from containers
     */
    removeHardwareAccelerationFromContainers() {
        try {
            const containers = document.querySelectorAll('.media-container, .video-container, .player-container');
            
            containers.forEach(container => {
                // Remove hardware acceleration styles
                container.style.transform = '';
                container.style.webkitTransform = '';
                container.style.willChange = '';
                container.style.webkitWillChange = '';
            });
            
            console.log(`[${this.TAG}] Removed hardware acceleration from ${containers.length} container elements`);
        } catch (error) {
            console.error(`[${this.TAG}] Error removing hardware acceleration from containers:`, error);
        }
    }

    /**
     * Optimize for hardware acceleration
     */
    optimizeForHardwareAcceleration() {
        try {
            console.log(`[${this.TAG}] Optimizing for hardware acceleration`);
            
            // Set target frame rate
            this.setTargetFrameRate(this.config.targetFrameRate);
            
            // Enable video decode hints
            this.enableVideoDecodeHints();
            
            // Optimize CSS for hardware acceleration
            this.optimizeCSSForHardwareAcceleration();
            
            // Enable requestAnimationFrame optimizations
            this.enableRequestAnimationFrameOptimizations();
            
            console.log(`[${this.TAG}] Hardware acceleration optimization completed`);
        } catch (error) {
            this.handleError(error, 'optimizeForHardwareAcceleration');
            throw error;
        }
    }

    /**
     * Set target frame rate
     */
    setTargetFrameRate(targetFrameRate) {
        try {
            console.log(`[${this.TAG}] Setting target frame rate: ${targetFrameRate}`);
            
            this.config.targetFrameRate = targetFrameRate;
            
            // In a real implementation, this would configure the display refresh rate
            // For now, we'll just log it
            console.log(`[${this.TAG}] Target frame rate set to: ${targetFrameRate} FPS`);
        } catch (error) {
            console.error(`[${this.TAG}] Error setting target frame rate:`, error);
        }
    }

    /**
     * Enable video decode hints
     */
    enableVideoDecodeHints() {
        try {
            const videos = document.querySelectorAll('video');
            
            videos.forEach(video => {
                // Enable preload hints
                video.preload = 'metadata';
                
                // Enable decode hints if available
                if (video.decode) {
                    video.decode().catch(error => {
                        console.warn(`[${this.TAG}] Video decode hint failed:`, error);
                    });
                }
                
                // Set poster for better loading
                if (!video.poster && video.src) {
                    // Generate a simple poster
                    video.poster = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                }
            });
            
            console.log(`[${this.TAG}] Video decode hints enabled for ${videos.length} videos`);
        } catch (error) {
            console.error(`[${this.TAG}] Error enabling video decode hints:`, error);
        }
    }

    /**
     * Optimize CSS for hardware acceleration
     */
    optimizeCSSForHardwareAcceleration() {
        try {
            // Create or update CSS rules for hardware acceleration
            let cssRules = `
                /* Hardware acceleration optimizations */
                video, canvas, .media-container, .video-container, .player-container {
                    transform: translateZ(0);
                    -webkit-transform: translateZ(0);
                    backface-visibility: hidden;
                    -webkit-backface-visibility: hidden;
                    perspective: 1000px;
                    -webkit-perspective: 1000px;
                }
                
                video {
                    image-rendering: optimizeSpeed;
                    -webkit-image-rendering: optimizeSpeed;
                }
                
                canvas {
                    image-rendering: optimizeSpeed;
                    -webkit-image-rendering: optimizeSpeed;
                }
                
                .media-container, .video-container, .player-container {
                    will-change: transform;
                    -webkit-will-change: transform;
                    position: relative;
                    z-index: 1;
                }
                
                /* Performance optimizations */
                * {
                    -webkit-tap-highlight-color: transparent;
                    -webkit-touch-callout: none;
                    -webkit-user-select: none;
                    -khtml-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                    user-select: none;
                }
            `;
            
            // Create style element if it doesn't exist
            let styleElement = document.getElementById('hardware-acceleration-styles');
            if (!styleElement) {
                styleElement = document.createElement('style');
                styleElement.id = 'hardware-acceleration-styles';
                styleElement.type = 'text/css';
                document.head.appendChild(styleElement);
            }
            
            styleElement.textContent = cssRules;
            
            console.log(`[${this.TAG}] CSS optimizations applied`);
        } catch (error) {
            console.error(`[${this.TAG}] Error optimizing CSS for hardware acceleration:`, error);
        }
    }

    /**
     * Enable requestAnimationFrame optimizations
     */
    enableRequestAnimationFrameOptimizations() {
        try {
            // Use requestAnimationFrame for smooth animations
            if (typeof requestAnimationFrame === 'function') {
                // Override setTimeout for better performance
                const originalSetTimeout = window.setTimeout;
                window.setTimeout = function(callback, delay) {
                    if (delay < 16) { // Less than 60fps
                        return requestAnimationFrame(callback);
                    }
                    return originalSetTimeout(callback, delay);
                };
                
                console.log(`[${this.TAG}] RequestAnimationFrame optimizations enabled`);
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error enabling requestAnimationFrame optimizations:`, error);
        }
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            isHardwareAccelerationEnabled: this.isEnabled,
            isHardwareAccelerationSupported: this.isSupported,
            gpuInfo: this.gpuInfo,
            config: { ...this.config }
        };
    }

    /**
     * Update configuration
     */
    updateConfiguration(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            
            // Reapply hardware acceleration if enabled
            if (this.isEnabled) {
                this.disableHardwareAcceleration();
                this.enableHardwareAcceleration();
            }
            
            // Save configuration
            this.saveConfiguration();
            
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
            localStorage.setItem('hardware_acceleration_enabled', this.isEnabled.toString());
            localStorage.setItem('hardware_acceleration_target_fps', this.config.targetFrameRate.toString());
            localStorage.setItem('hardware_acceleration_auto_enable', this.config.enableByDefault.toString());
        } catch (error) {
            console.error(`[${this.TAG}] Error saving configuration:`, error);
        }
    }

    /**
     * Load configuration
     */
    loadConfiguration() {
        try {
            const enabled = localStorage.getItem('hardware_acceleration_enabled');
            if (enabled !== null) {
                this.isEnabled = enabled === 'true';
            }
            
            const targetFPS = localStorage.getItem('hardware_acceleration_target_fps');
            if (targetFPS !== null) {
                this.config.targetFrameRate = parseInt(targetFPS);
            }
            
            const autoEnable = localStorage.getItem('hardware_acceleration_auto_enable');
            if (autoEnable !== null) {
                this.config.enableByDefault = autoEnable === 'true';
            }
        } catch (error) {
            console.error(`[${this.TAG}] Error loading configuration:`, error);
        }
    }

    /**
     * Emit performance warning
     */
    emitPerformanceWarning(type, data) {
        try {
            console.warn(`[${this.TAG}] Performance warning: ${type}`, data);
            
            this.emitEvent('performanceWarning', {
                type: type,
                data: data,
                timestamp: new Date()
            });
        } catch (error) {
            console.error(`[${this.TAG}] Error emitting performance warning:`, error);
        }
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            enableByDefault: true,
            forceHardwareAcceleration: false,
            maxFrameRate: 60,
            targetFrameRate: 30,
            memoryThreshold: 0.8,
            gpuThreshold: 0.9
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
    module.exports = HardwareAcceleration;
} else if (typeof window !== 'undefined') {
    window.HardwareAcceleration = HardwareAcceleration;
}
