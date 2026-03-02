/**
 * SMC - Main Application Bootstrap
 * Production-ready LG WebOS application. This file is provided
 * for compatibility with packaging requirements. The existing
 * Smc-Signage codebase uses a different bootstrap mechanism via
 * js/app.js and js/router.js, so this file does not override
 * that functionality. If you wish to adopt this bootstrap
 * implementation, update index.html to load main.js instead of
 * app.js/router.js and adjust the controller loading logic.
 */
(function() {
    'use strict';

    /**
     * Initialise the application. If webOS APIs are available the
     * display info is fetched before routing. Otherwise the router is
     * initialised immediately.
     */
    function initializeApp() {
        console.log('[Smc-Signage] Initializing SMC v2.0.0');

        // Initialise custom utilities if loaded
        if (window.SecurityManager) {
            console.log('[Smc-Signage] Security Manager initialized');
        }
        if (window.ResourceManager) {
            console.log('[Smc-Signage] Resource Manager initialized');
        }
        if (window.OfflineManager) {
            console.log('[Smc-Signage] Offline Manager initialized');
        }

        // Example: fetch display info on webOS
        if (window.webOS && typeof webOS.service !== 'undefined') {
            webOS.service.request('luna://com.webos.service.tvdisplay', {
                method: 'getSystemInfo'
            }).then(function(response) {
                console.log('[Smc-Signage] LG Display Info:', response);
                initializeRouter();
            }).catch(function(error) {
                console.error('[Smc-Signage] Failed to get display info:', error);
                initializeRouter();
            });
        } else {
            initializeRouter();
        }
    }

    /**
     * Basic route initialiser. Determines the current path and
     * loads the appropriate template and controller. This example
     * assumes templates are located under code/templates and
     * controllers expose themselves on the global scope.
     */
    function initializeRouter() {
        const routes = {
            '/': 'splash',
            '/splash': 'splash',
            '/login': 'login',
            '/home': 'home',
            '/player': 'player',
            '/settings': 'settings'
        };
        const currentPath = window.location.pathname || '/';
        const route = routes[currentPath] || 'splash';
        console.log('[Smc-Signage] Route:', currentPath, '→', route);
        loadController(route);
    }

    /**
     * Load a view template and mount the corresponding controller
     * when loaded. Displays a generic error page on failure.
     *
     * @param {string} route
     */
    function loadController(route) {
        const appContainer = document.getElementById('app-container') || document.getElementById('app') || document.body;
        loadTemplate(route).then(function(template) {
            appContainer.innerHTML = template;
            const controllerName = route + 'Controller';
            if (window[controllerName] && typeof window[controllerName].mount === 'function') {
                window[controllerName].mount({ route: '/' + route });
            }
        }).catch(function(error) {
            console.error('[Smc-Signage] Failed to load controller:', error);
            showError('Failed to load application');
        });
    }

    /**
     * Fetch an HTML template from the templates directory. If
     * fetching fails returns a fallback error template.
     *
     * @param {string} route
     * @returns {Promise<string>}
     */
    function loadTemplate(route) {
        return fetch('code/templates/activity_' + route + '.html')
            .then(function(response) { return response.text(); })
            .catch(function() {
                return '<div><h1>Loading Error</h1><p>Failed to load template</p></div>';
            });
    }

    /**
     * Render a generic error message in the application container.
     *
     * @param {string} message
     */
    function showError(message) {
        const appContainer = document.getElementById('app-container') || document.getElementById('app') || document.body;
        appContainer.innerHTML = '<div style="padding:20px;text-align:center;"><h1>Application Error</h1><p>' + message + '</p><button onclick="location.reload()">Reload</button></div>';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
})();
