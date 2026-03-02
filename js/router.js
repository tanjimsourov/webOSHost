/**
 * Lightweight hash router for the Smc Signage application. Routes map
 * to HTML template files located under the `templates/` directory. The
 * router handles navigation, route guards based on login state and
 * integrates a simple DPAD focus engine. A history stack mimics the
 * Android back stack so that pressing the back key navigates to the
 * previous route when appropriate.
 */
(function () {
  // Mapping of routes to template files. Additional views can be
  // registered here. The keys should match the fragment portion of
  // the URL (without the leading '#').
  const ROUTES = {
    '/splash': 'templates/activity_splash_.html',
    '/login': 'templates/activity_login.html',
    '/settings': 'templates/activity_settings.html',
    '/home': 'templates/activity_main.html',
    '/player': 'templates/activity_player.html',
  };

  // Back stack to replicate Android navigation behaviour.
  const historyStack = [];

  function resolveTemplateUrl(path) {
    // In webOS emulator this app runs from file:// and fetch() can reject
    // local relative paths. Resolve against document URL without hash.
    try {
      const base = window.location.href.split('#')[0];
      return new URL(path, base).toString();
    } catch (e) {
      return path;
    }
  }

  function loadTemplateViaXhr(url) {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          // status 0 is valid for file:// in some WebKit/WebOS runtimes
          if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
            resolve(xhr.responseText || '');
            return;
          }
          reject(xhr.status || 'XHR_STATUS_ERROR');
        };
        xhr.onerror = function () {
          reject('XHR_NETWORK_ERROR');
        };
        xhr.send();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Fetch an HTML template and return its contents. If the fetch
   * fails the returned promise resolves to a simple error message.
   */
  async function fetchTemplate(path) {
    const resolvedPath = resolveTemplateUrl(path);
    const isFileProtocol = (window.location && window.location.protocol === 'file:');

    if (!isFileProtocol) {
      try {
        const resp = await fetch(resolvedPath, { cache: 'no-store' });
        if (resp.ok) {
          console.log('[ROUTER]', 'template load SUCCESS(fetch)', path, '->', resolvedPath);
          return await resp.text();
        }
        throw resp.status;
      } catch (fetchErr) {
        console.warn('[ROUTER]', 'template load fetch FAIL', path, fetchErr);
      }
    }

    try {
      const text = await loadTemplateViaXhr(resolvedPath);
      console.log('[ROUTER]', 'template load SUCCESS(xhr)', path, '->', resolvedPath);
      return text;
    } catch (xhrErr) {
      if (resolvedPath !== path) {
        try {
          const text = await loadTemplateViaXhr(path);
          console.log('[ROUTER]', 'template load SUCCESS(xhr-relative)', path);
          return text;
        } catch (xhrRelativeErr) {
          console.error('[ROUTER]', 'template load FAIL', path, xhrErr, xhrRelativeErr);
          return '<div>Template not found: ' + path + '</div>';
        }
      }
      console.error('[ROUTER]', 'template load FAIL', path, xhrErr);
      return '<div>Template not found: ' + path + '</div>';
    }
  }

  /**
   * Apply rotation based on the stored preference. Rotation is applied
   * to the root app container so that entire screens rotate like the
   * Android RotateLayout.
   */
  function applyRotation() {
    const rotation = prefs.getString('rotation', '0');
    const appEl = document.getElementById('app');
    appEl.style.transform = 'rotate(' + rotation + 'deg)';
  }

  /**
   * Render a route by injecting its template into the app container.
   * After injection the focus engine is initialised to enable DPAD
   * navigation. If the requested route is not defined, fallback to
   * `/splash`.
   */
  async function renderRoute(route) {
    const templatePath = ROUTES[route] || ROUTES['/splash'];
    console.log('[ROUTER]', 'renderRoute START', route, '->', templatePath);
    const html = await fetchTemplate(templatePath);
    const appEl = document.getElementById('app');
    appEl.innerHTML = '';
    // parse string into DOM nodes
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    Array.from(doc.body.children).forEach((child) => appEl.appendChild(child));
    applyRotation();
    // focus engine initialisation
    focusEngine.initForRoute(route);
    console.log('[ROUTER]', 'renderRoute SUCCESS', route);
  }

  // Controller lifecycle state. Controllers are registered in
  // `js/controllers/_controller_registry.js`.
  let currentController = null;
  let currentControllerRoute = null;

  function getControllerForRoute(route) {
    try {
      if (window.controllerRegistry) {
        if (typeof window.controllerRegistry.getController === 'function') {
          return window.controllerRegistry.getController(route);
        }
        if (window.controllerRegistry.controllers && window.controllerRegistry.controllers[route]) {
          return window.controllerRegistry.controllers[route];
        }
      }
    } catch (e) {
      console.error('[ROUTER]', 'controller registry access FAIL', e);
    }
    return null;
  }

  /**
   * Render a route and invoke controller lifecycle hooks.
   * - unmount previous controller before template swap
   * - mount next controller after template render
   *
   * Safe error boundary: mount/unmount errors are logged and do not crash the app.
   */
  async function renderRouteWithController(route) {
    const nextController = getControllerForRoute(route);

    // Unmount previous controller before we replace the DOM.
    if (currentController && typeof currentController.unmount === 'function') {
      try {
        const ctx = { route: currentControllerRoute, nextRoute: route };
        const unmountResult = currentController.unmount(ctx);
        if (unmountResult && typeof unmountResult.then === 'function') {
          await unmountResult
            .then(() => console.log('[ROUTER]', 'controller unmount SUCCESS', currentControllerRoute))
            .catch((err) => console.error('[ROUTER]', 'controller unmount FAIL', currentControllerRoute, err));
        } else {
          console.log('[ROUTER]', 'controller unmount SUCCESS', currentControllerRoute);
        }
      } catch (err) {
        console.error('[ROUTER]', 'controller unmount FAIL', currentControllerRoute, err);
      }
    }

    // Render template
    try {
      await renderRoute(route);
    } catch (err) {
      // renderRoute already handles template fetch errors, but keep a boundary anyway.
      console.error('[ROUTER]', 'renderRoute FAIL', route, err);
    }

    // Mount next controller after DOM is in place.
    currentController = nextController;
    currentControllerRoute = route;
    if (nextController && typeof nextController.mount === 'function') {
      try {
        const ctx = { route: route };
        const mountResult = nextController.mount(ctx);
        if (mountResult && typeof mountResult.then === 'function') {
          await mountResult
            .then(() => console.log('[ROUTER]', 'controller mount SUCCESS', route))
            .catch((err) => console.error('[ROUTER]', 'controller mount FAIL', route, err));
        } else {
          console.log('[ROUTER]', 'controller mount SUCCESS', route);
        }
      } catch (err) {
        console.error('[ROUTER]', 'controller mount FAIL', route, err);
      }
    }
  }

  /**
   * Navigate to a route programmatically. Guards check whether a
   * session is authenticated via the LoginSuccess preference; if
   * unauthorized the user is redirected to the login screen. On
   * successful navigation the history stack is updated.
   */
  function navigate(route) {
    // Guard: if not logged in force login
    const loginStatus = prefs.getString('login', '');
    if (route !== '/login' && route !== '/splash' && route !== '/settings' && loginStatus !== 'Permit') {
      route = '/settings';
    }
    historyStack.push(route);
    window.location.hash = route;
  }

  /**
   * Handle back navigation. Pops the current route and navigates to
   * the previous route if available. When at the root of the stack
   * nothing happens (mirroring Android's default behaviour).
   */
  function back() {
    if (historyStack.length > 1) {
      historyStack.pop(); // discard current
      const previous = historyStack.pop() || '/settings';
      navigate(previous);
    }
  }

  // Listen for hash changes triggered by manual navigation or
  // programmatic route changes and render the appropriate template.
  window.addEventListener('hashchange', () => {
    const route = window.location.hash.replace('#', '') || '/settings';
    renderRouteWithController(route).catch((err) => {
      console.error('[ROUTER]', 'route change FAIL', route, err);
    });
  });

  // On initial load render the current hash or default route.
  window.addEventListener('DOMContentLoaded', () => {
    const initialRoute = window.location.hash.replace('#', '') || '/settings';
    // push initial route into history so back behaviour works
    historyStack.push(initialRoute);
    renderRouteWithController(initialRoute).catch((err) => {
      console.error('[ROUTER]', 'initial route FAIL', initialRoute, err);
    });
  });

  // Expose router API globally
  window.router = {
    navigate,
    back,
    render: renderRoute,
    renderWithController: renderRouteWithController,
  };

  /**
   * Focus engine implementing spatial navigation for DPAD control. It
   * finds focusable elements within the current screen and moves focus
   * based on arrow key direction. The last focused element per route
   * is remembered so that when the user returns to a screen the
   * previous focus point is restored. Pressing Enter/Space clicks
   * the active element; pressing Backspace/Escape triggers back
   * navigation via the router.
   */
  const focusEngine = {
    lastFocused: {},
    currentRoute: null,
    focusables: [],
    isElementVisible(el) {
      if (!el) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return el.offsetParent !== null || cs.position === 'fixed' || cs.position === 'absolute';
    },
    isElementInteractive(el) {
      if (!el) return false;
      if (el.disabled) return false;
      if (el.matches('button, input, select, textarea, a[href]')) return true;
      if (el.getAttribute('role') === 'button') return true;
      if (el.getAttribute('data-focusable') === 'true') return true;
      if (el.matches('[data-type="button"], [data-type="input"]')) return true;
      if (el.tagName === 'IMG' && el.id === 'imgsetting') return true;
      if (el.hasAttribute('onclick')) return true;
      return false;
    },
    buildFocusableList(container) {
      const allWithIds = Array.from(container.querySelectorAll('[id]'));
      const preferred = allWithIds.filter((el) => this.isElementInteractive(el) && this.isElementVisible(el));
      const fallback = allWithIds.filter((el) => this.isElementVisible(el));
      return preferred.length > 0 ? preferred : fallback;
    },
    /**
     * Initialise the engine for a new route. Prefer interactive
     * elements and fall back to visible IDs if needed. Tabindex
     * attributes are set programmatically and the last focused
     * element for the route is restored if known.
     */
    initForRoute(route) {
      this.currentRoute = route;
      const container = document.getElementById('app');
      this.focusables = this.buildFocusableList(container);
      // assign tabindex and focusable class only to navigable elements
      this.focusables.forEach((el) => {
        el.setAttribute('tabindex', '0');
        el.classList.add('focusable');
      });
      // restore last focus or use route-specific default, then first focusable
      const lastId = this.lastFocused[route];
      const preferredByRoute = {
        '/login': 'edit_username',
        '/settings': 'radia_0',
        '/home': 'listViewPlaylists',
        '/player': 'txtTokenId',
        '/splash': 'imgsetting'
      };
      let toFocus = null;
      if (lastId) {
        toFocus = container.querySelector('#' + lastId);
      }
      if (!toFocus && preferredByRoute[route]) {
        const preferredEl = container.querySelector('#' + preferredByRoute[route]);
        if (preferredEl && this.isElementVisible(preferredEl)) {
          toFocus = preferredEl;
        }
      }
      if (!toFocus && this.focusables.length > 0) {
        toFocus = this.focusables[0];
      }
      if (toFocus) {
        toFocus.focus();
        this.lastFocused[route] = toFocus.id;
      }
    },
    /**
     * Handle keydown events for DPAD navigation and back handling.
     */
    isTypingContext(target) {
      if (!target) return false;
      if (target.isContentEditable) return true;
      const tag = (target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (typeof target.closest === 'function' && target.closest('[contenteditable="true"]')) return true;
      return false;
    },
    onKeyDown(event) {
      const key = event.key;
      const active = event.target || document.activeElement;

            // Login screen must preserve full physical keyboard behavior.
      if (this.currentRoute === '/login') {
        return;
      }

      // Never hijack normal typing/edit shortcuts.
      if (this.isTypingContext(active) || this.isTypingContext(document.activeElement)) {
        return;
      }

      // Keep host/browser shortcuts untouched.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // Back navigation
      if (key === 'Backspace' || key === 'Escape') {
        event.preventDefault();
        router.back();
        return;
      }

      // Activation
      if (key === 'Enter' || key === ' ') {
        if (active && typeof active.click === 'function') {
          active.click();
        }
        return;
      }

      // Directional navigation
      const directions = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!directions.includes(key)) return;

      event.preventDefault();
      if (!active || typeof active.getBoundingClientRect !== 'function') return;

      const currentRect = active.getBoundingClientRect();
      let bestCandidate = null;
      let bestDist = Infinity;
      for (const el of this.focusables) {
        if (el === active) continue;
        if (!el || typeof el.getBoundingClientRect !== 'function') continue;
        const rect = el.getBoundingClientRect();
        let dx = 0;
        let dy = 0;
        switch (key) {
          case 'ArrowUp':
            dy = currentRect.top - rect.bottom;
            dx = Math.abs(currentRect.left - rect.left);
            if (dy <= 0) continue;
            break;
          case 'ArrowDown':
            dy = rect.top - currentRect.bottom;
            dx = Math.abs(currentRect.left - rect.left);
            if (dy <= 0) continue;
            break;
          case 'ArrowLeft':
            dx = currentRect.left - rect.right;
            dy = Math.abs(currentRect.top - rect.top);
            if (dx <= 0) continue;
            break;
          case 'ArrowRight':
            dx = rect.left - currentRect.right;
            dy = Math.abs(currentRect.top - rect.top);
            if (dx <= 0) continue;
            break;
        }
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestCandidate = el;
        }
      }
      if (bestCandidate) {
        bestCandidate.focus();
        this.lastFocused[this.currentRoute] = bestCandidate.id;
      }
    },
  };

  // Listen for keydown events on the document
  document.addEventListener('keydown', (e) => focusEngine.onKeyDown(e));

  // Expose focus engine for testing purposes
  window.focusEngine = focusEngine;
})();










