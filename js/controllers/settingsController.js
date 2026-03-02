/**
 * Settings controller.
 *
 * Keeps the setup flow deterministic:
 * - Persist rotation/startup/permission flags.
 * - Mark setup complete.
 * - Route to /login for first-time setup, or back to splash when already logged in.
 */
(function () {
  var TAG = '[SETTINGS]';
  var log = (window.ControllerBase && window.ControllerBase.createLogger)
    ? window.ControllerBase.createLogger(TAG)
    : {
        info: console.log.bind(console, TAG),
        warn: console.warn.bind(console, TAG),
        error: console.error.bind(console, TAG)
      };

  var state = {
    handlers: [],
    saving: false
  };

  function bind(el, eventName, handler) {
    if (!el) return;
    el.addEventListener(eventName, handler);
    state.handlers.push({ el: el, eventName: eventName, handler: handler });
  }

  function unbindAll() {
    for (var i = 0; i < state.handlers.length; i++) {
      var h = state.handlers[i];
      try {
        h.el.removeEventListener(h.eventName, h.handler);
      } catch (e) {
        // ignore
      }
    }
    state.handlers = [];
  }

  function getElements() {
    return {
      r0: document.getElementById('radia_0'),
      r90: document.getElementById('radia_90'),
      r180: document.getElementById('radia_180'),
      r270: document.getElementById('radia_270'),
      auto: document.getElementById('radio_auto'),
      manual: document.getElementById('radio_manual'),
      overlay: document.getElementById('checkBoxAppsoverApps'),
      storage: document.getElementById('checkBoxStorageApp'),
      hideDownloadPopup: document.getElementById('checkBoxHideDownloadPopup'),
      saveBtn: document.getElementById('btn_Submit1') || document.getElementById('btn_save_settings'),
      loading: document.getElementById('txtloading'),
      progress: document.getElementById('progress_view1')
    };
  }

  function showSaving(isSaving) {
    var els = getElements();
    if (els.loading) {
      els.loading.textContent = isSaving ? 'Saving settings...' : '';
      els.loading.style.display = isSaving ? 'block' : 'none';
    }
    if (els.progress) {
      els.progress.style.display = isSaving ? 'block' : 'none';
    }
    if (els.saveBtn) {
      els.saveBtn.disabled = !!isSaving;
    }
  }

  function readForm() {
    var els = getElements();
    var rotation = '0';
    if (els.r90 && els.r90.checked) rotation = '90';
    else if (els.r180 && els.r180.checked) rotation = '180';
    else if (els.r270 && els.r270.checked) rotation = '270';

    var startup = (els.manual && els.manual.checked) ? 'manual' : 'auto';

    return {
      rotation: rotation,
      startup: startup,
      overlayPermission: !!(els.overlay && els.overlay.checked),
      storagePermission: !!(els.storage && els.storage.checked),
      hideDownloadPopup: !!(els.hideDownloadPopup && els.hideDownloadPopup.checked)
    };
  }

  function writeFormFromPrefs() {
    var els = getElements();

    var rotation = prefs.getRotation ? prefs.getRotation() : prefs.getString('rotation', '0');
    var startup = prefs.getStartup ? prefs.getStartup() : prefs.getString('startup', 'auto');
    var overlay = prefs.getString('overlay_permission', '') === 'granted';
    var storage = prefs.getString('storage_permission', '') === 'granted';
    var hideDownloadPopup = prefs.getString('hide_download_overlay', '0') === '1';

    if (els.r0) els.r0.checked = String(rotation) === '0';
    if (els.r90) els.r90.checked = String(rotation) === '90';
    if (els.r180) els.r180.checked = String(rotation) === '180';
    if (els.r270) els.r270.checked = String(rotation) === '270';

    if (els.auto) els.auto.checked = String(startup).toLowerCase() !== 'manual';
    if (els.manual) els.manual.checked = String(startup).toLowerCase() === 'manual';

    if (els.overlay) els.overlay.checked = overlay;
    if (els.storage) els.storage.checked = storage;
    if (els.hideDownloadPopup) els.hideDownloadPopup.checked = hideDownloadPopup;
  }

  function persistSettings(values) {
    if (prefs.setRotation) prefs.setRotation(values.rotation);
    else prefs.setString('rotation', values.rotation);

    if (prefs.setStartup) prefs.setStartup(values.startup);
    else prefs.setString('startup', values.startup);

    prefs.setString('overlay_permission', values.overlayPermission ? 'granted' : 'denied');
    prefs.setString('storage_permission', values.storagePermission ? 'granted' : 'denied');
    prefs.setString('hide_download_overlay', values.hideDownloadPopup ? '1' : '0');

    if (prefs.setSetupComplete) prefs.setSetupComplete(true);
    else prefs.setBool('setup_complete', true);
  }

  function routeAfterSave() {
    var loggedIn = prefs.isLoggedIn ? prefs.isLoggedIn() : prefs.getString('login', '') === 'Permit';
    if (loggedIn) {
      router.navigate('/splash');
      return;
    }
    router.navigate('/login');
  }

  function focusDefault() {
    var els = getElements();
    var first = els.r0 || els.auto || els.saveBtn;
    if (first && typeof first.focus === 'function') {
      setTimeout(function () {
        try {
          first.focus();
        } catch (e) {
          // ignore
        }
      }, 30);
    }
  }

  function mount(context) {
    log.info('mount', context && context.route ? ('route=' + context.route) : '');

    state.saving = false;
    showSaving(false);
    writeFormFromPrefs();
    focusDefault();

    var els = getElements();

    bind(els.saveBtn, 'click', function () {
      if (state.saving) return;

      state.saving = true;
      showSaving(true);

      try {
        var values = readForm();
        persistSettings(values);
        routeAfterSave();
      } catch (e) {
        log.error('save settings failed', e);
      } finally {
        state.saving = false;
        showSaving(false);
      }
    });

    var radios = [els.r0, els.r90, els.r180, els.r270, els.auto, els.manual, els.overlay, els.storage, els.hideDownloadPopup];
    for (var i = 0; i < radios.length; i++) {
      bind(radios[i], 'change', function () {
        // Keep a live persisted draft, so restart always restores latest selection.
        try {
          var values = readForm();
          persistSettings(values);
        } catch (e) {
          log.warn('draft settings update failed', e);
        }
      });
    }
  }

  function unmount(context) {
    log.info('unmount', context && context.route ? ('route=' + context.route) : '');
    unbindAll();
    showSaving(false);
    state.saving = false;
  }

  window.settingsController = {
    mount: mount,
    unmount: unmount
  };
})();
