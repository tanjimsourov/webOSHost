(function () {
  var MAX_LINES = 200;
  var lines = [];
  var isVisible = false;
  var overlayEl = null;
  var bodyEl = null;

  function safeToString(arg) {
    try {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.stack || arg.message || String(arg);
      return JSON.stringify(arg);
    } catch (e) {
      try {
        return String(arg);
      } catch (e2) {
        return '[unprintable]';
      }
    }
  }

  function formatArgs(args) {
    var out = [];
    for (var i = 0; i < args.length; i++) out.push(safeToString(args[i]));
    return out.join(' ');
  }

  function pushLine(level, text) {
    var ts = new Date();
    var stamp = ts.toISOString().slice(11, 19);
    var line = stamp + ' ' + level + ' ' + text;
    lines.push(line);
    if (lines.length > MAX_LINES) lines.shift();
    if (overlayEl) {
      overlayEl.textContent = lines.join('\n');
      overlayEl.scrollTop = overlayEl.scrollHeight;
    }
  }

  function ensureOverlay() {
    if (overlayEl) return;
    bodyEl = document.body;
    if (!bodyEl) return;

    var container = document.createElement('div');
    container.id = 'debugOverlayContainer';
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.right = '0';
    container.style.bottom = '0';
    container.style.height = '45%';
    container.style.background = 'rgba(0,0,0,0.85)';
    container.style.zIndex = '99999';
    container.style.display = 'none';
    container.style.borderTop = '2px solid rgba(255,255,255,0.2)';

    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '8px 10px';
    header.style.color = '#fff';
    header.style.fontFamily = 'monospace';
    header.style.fontSize = '12px';

    var title = document.createElement('div');
    title.textContent = 'Debug Console (toggle: Ctrl+D)';

    var buttons = document.createElement('div');

    var clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.marginRight = '8px';
    clearBtn.onclick = function () {
      lines = [];
      if (overlayEl) overlayEl.textContent = '';
    };

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = function () {
      setVisible(false);
    };

    buttons.appendChild(clearBtn);
    buttons.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(buttons);

    overlayEl = document.createElement('pre');
    overlayEl.id = 'debugOverlay';
    overlayEl.style.margin = '0';
    overlayEl.style.padding = '10px';
    overlayEl.style.height = 'calc(100% - 36px)';
    overlayEl.style.overflow = 'auto';
    overlayEl.style.color = '#fff';
    overlayEl.style.fontFamily = 'monospace';
    overlayEl.style.fontSize = '12px';
    overlayEl.style.whiteSpace = 'pre-wrap';

    container.appendChild(header);
    container.appendChild(overlayEl);
    bodyEl.appendChild(container);

    overlayEl.textContent = lines.join('\n');
  }

  function setVisible(next) {
    isVisible = !!next;
    ensureOverlay();
    var c = document.getElementById('debugOverlayContainer');
    if (c) c.style.display = isVisible ? 'block' : 'none';
  }

  function toggle() {
    setVisible(!isVisible);
  }

  function hookConsole() {
    var origLog = console.log;
    var origWarn = console.warn;
    var origErr = console.error;

    console.log = function () {
      pushLine('LOG', formatArgs(arguments));
      try { origLog.apply(console, arguments); } catch (e) {}
    };
    console.warn = function () {
      pushLine('WARN', formatArgs(arguments));
      try { origWarn.apply(console, arguments); } catch (e) {}
    };
    console.error = function () {
      pushLine('ERR', formatArgs(arguments));
      setVisible(true);
      try { origErr.apply(console, arguments); } catch (e) {}
    };
  }

  function hookErrors() {
    window.addEventListener('error', function (evt) {
      var msg = evt && (evt.message || (evt.error && (evt.error.stack || evt.error.message)));
      pushLine('ERR', msg || 'Unhandled error');
      setVisible(true);
    });
    window.addEventListener('unhandledrejection', function (evt) {
      var reason = evt && evt.reason;
      var msg = reason && (reason.stack || reason.message) || safeToString(reason);
      pushLine('ERR', 'Unhandled promise rejection: ' + msg);
      setVisible(true);
    });

    document.addEventListener('keydown', function (e) {
      if (e && e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        toggle();
      }
    });
  }

  function init() {
    hookConsole();
    hookErrors();
    pushLine('LOG', 'DebugOverlay init');
  }

  window.DebugOverlay = {
    init: init,
    toggle: toggle,
    show: function () { setVisible(true); },
    hide: function () { setVisible(false); }
  };
})();
