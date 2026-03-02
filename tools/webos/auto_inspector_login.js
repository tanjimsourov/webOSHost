#!/usr/bin/env node

/**
 * Automate LG webOS emulator app through Web Inspector (CDP).
 * - Navigates to settings and saves snapshot-like defaults.
 * - Navigates to login and types username/token visibly.
 * - Clicks login and waits for success.
 * - Streams app console events to terminal.
 */

function parseArgs(argv) {
  const out = {
    username: '',
    token: '',
    appId: 'com.smc.signage.player',
    inspectorJsonUrl: 'http://127.0.0.1:9998/json',
    monitorMs: 120000,
    noHooks: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--username' && typeof next === 'string') {
      out.username = next;
      i += 1;
    } else if (arg === '--token' && typeof next === 'string') {
      out.token = next;
      i += 1;
    } else if (arg === '--app-id' && typeof next === 'string') {
      out.appId = next;
      i += 1;
    } else if (arg === '--inspector-json-url' && typeof next === 'string') {
      out.inspectorJsonUrl = next;
      i += 1;
    } else if (arg === '--monitor-ms' && typeof next === 'string') {
      const v = Number(next);
      if (!Number.isNaN(v) && v >= 0) out.monitorMs = v;
      i += 1;
    } else if (arg === '--no-hooks') {
      out.noHooks = true;
    }
  }

  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRemoteObject(obj) {
  if (!obj) return '';
  if (Object.prototype.hasOwnProperty.call(obj, 'value')) return String(obj.value);
  if (Object.prototype.hasOwnProperty.call(obj, 'unserializableValue')) return String(obj.unserializableValue);
  if (obj.description) return String(obj.description);
  if (obj.type) return '[' + obj.type + ']';
  return '';
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.onEvent = null;
  }

  async connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('WebSocket API is not available in current Node runtime');
    }

    this.ws = new WebSocket(this.wsUrl);

    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (evt) => {
        cleanup();
        reject(new Error('Failed to connect inspector websocket'));
      };
      const cleanup = () => {
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });

    this.ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(String(evt.data));
      } catch (_err) {
        return;
      }

      if (msg && typeof msg.id === 'number') {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || 'CDP error'));
        } else {
          pending.resolve(msg.result || {});
        }
        return;
      }

      if (msg && msg.method && typeof this.onEvent === 'function') {
        try {
          this.onEvent(msg.method, msg.params || {});
        } catch (_err) {
          // ignore listener errors
        }
      }
    });

    this.ws.addEventListener('close', () => {
      for (const [id, pending] of this.pending.entries()) {
        pending.reject(new Error('Inspector websocket closed'));
      }
      this.pending.clear();
    });
  }

  async send(method, params, timeoutMs) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
      throw new Error('Inspector websocket is not open');
    }

    const id = this.nextId;
    this.nextId += 1;

    const payload = JSON.stringify({ id, method, params: params || {} });

    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout: ' + method));
      }, timeoutMs || 30000);

      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    this.ws.send(payload);
    return resultPromise;
  }

  async evaluate(expression, timeoutMs) {
    const result = await this.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true
      },
      timeoutMs || 60000
    );

    if (result && result.exceptionDetails) {
      const ex = result.exceptionDetails;
      const msg = ex.text || (ex.exception && ex.exception.description) || 'Runtime.evaluate exception';
      throw new Error(msg);
    }

    if (result && result.result && Object.prototype.hasOwnProperty.call(result.result, 'value')) {
      return result.result.value;
    }

    return undefined;
  }

  async close() {
    try {
      if (this.ws && this.ws.readyState === this.ws.OPEN) {
        this.ws.close();
      }
    } catch (_err) {
      // ignore
    }
  }
}

async function fetchInspectorTarget(inspectorJsonUrl, appId) {
  const resp = await fetch(inspectorJsonUrl, { method: 'GET' });
  if (!resp.ok) {
    throw new Error('Unable to query inspector targets: HTTP ' + resp.status);
  }

  const list = await resp.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('No inspector targets found');
  }

  const target = list.find((x) => {
    const title = String((x && x.title) || '').toLowerCase();
    const url = String((x && x.url) || '').toLowerCase();
    return title.includes('smc signage') || url.includes(appId.toLowerCase());
  }) || list[0];

  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error('Inspector target has no websocket URL');
  }

  return target;
}

function settingsScript() {
  return `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (id, timeoutMs) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.getElementById(id);
      if (el) return el;
      await sleep(100);
    }
    throw new Error('Element not found: ' + id);
  };

  if (window.router && typeof window.router.navigate === 'function') {
    window.router.navigate('/settings');
  } else {
    window.location.hash = '/settings';
  }

  await waitFor('btn_Submit1', 25000);

  const setChecked = (id, checked) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.focus();
    el.checked = !!checked;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  setChecked('radia_0', true);
  await sleep(220);
  setChecked('radio_manual', true);
  await sleep(220);
  setChecked('checkBoxStorageApp', true);
  await sleep(180);
  setChecked('checkBoxAppsoverApps', false);
  await sleep(240);

  const saveBtn = document.getElementById('btn_Submit1');
  if (saveBtn) {
    saveBtn.focus();
    await sleep(120);
    saveBtn.click();
  }

  await sleep(1200);
  return {
    ok: true,
    hash: String(window.location.hash || ''),
    saveButtonFound: !!saveBtn
  };
})();
`;
}

function resetStorageScript() {
  return `
(async () => {
  const result = {
    cachesDeleted: 0,
    dbCleared: false,
    localStorageCleared: false,
    sessionStorageCleared: false
  };

  try {
    if (window.caches && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      for (const key of keys) {
        try {
          const deleted = await caches.delete(key);
          if (deleted) result.cachesDeleted += 1;
        } catch (e) {}
      }
    }
  } catch (e) {
    result.cachesError = String((e && e.message) || e);
  }

  try {
    if (window.localStorage) {
      localStorage.clear();
      result.localStorageCleared = true;
    }
  } catch (e) {}

  try {
    if (window.sessionStorage) {
      sessionStorage.clear();
      result.sessionStorageCleared = true;
    }
  } catch (e) {}

  try {
    if (window.prefs && typeof window.prefs.setString === 'function') {
      window.prefs.setString('download_manager_state', '');
      window.prefs.setString('login', '');
      window.prefs.setString('playlist_data', '');
      window.prefs.setString('songs_data', '');
      window.prefs.setString('advertisement_data', '');
    }
  } catch (e) {}

  try {
    if (window.DB && typeof DB.withTransaction === 'function') {
      await DB.withTransaction(['playlist', 'songs', 'advertisement'], 'readwrite', (stores) => {
        if (stores.playlist && typeof stores.playlist.clear === 'function') stores.playlist.clear();
        if (stores.songs && typeof stores.songs.clear === 'function') stores.songs.clear();
        if (stores.advertisement && typeof stores.advertisement.clear === 'function') stores.advertisement.clear();
      });
      result.dbCleared = true;
    }
  } catch (e) {
    result.dbError = String((e && e.message) || e);
  }

  return result;
})();
`;
}
function hooksScript() {
  return `
(() => {
  if (window.__autoHooksInstalled) return 'hooks-already-installed';
  window.__autoHooksInstalled = true;

  const safeStringify = (value) => {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  };

  window.addEventListener('smc:download', (ev) => {
    console.log('[AUTO][DOWNLOAD]', safeStringify((ev && ev.detail) || {}));
  });

  window.addEventListener('smc:playback', (ev) => {
    console.log('[AUTO][PLAYBACK]', safeStringify((ev && ev.detail) || {}));
  });

  window.addEventListener('smc:sync', (ev) => {
    console.log('[AUTO][SYNC]', safeStringify((ev && ev.detail) || {}));
  });

  window.addEventListener('error', (ev) => {
    var msg = (ev && ev.message) ? ev.message : 'unknown-error';
    console.log('[AUTO][WINDOW_ERROR]', msg);
  });

  return 'hooks-installed';
})();
`;
}

function loginScript(username, token) {
  return `
(async () => {
  const userText = ${JSON.stringify(username)};
  const tokenText = ${JSON.stringify(token)};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (id, timeoutMs) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.getElementById(id);
      if (el) return el;
      await sleep(100);
    }
    throw new Error('Element not found: ' + id);
  };

  if (window.router && typeof window.router.navigate === 'function') {
    window.router.navigate('/login');
  } else {
    window.location.hash = '/login';
  }

  const usernameEl = await waitFor('edit_username', 25000);
  const tokenEl = await waitFor('edit_tokenNo', 25000);
  await waitFor('btn_Submit', 25000);

  const typeSlowly = async (el, text) => {
    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    for (const ch of String(text || '')) {
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(90);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  await typeSlowly(usernameEl, userText);
  await sleep(260);
  await typeSlowly(tokenEl, tokenText);
  await sleep(420);

  const submitBtn = document.getElementById('btn_Submit');
  submitBtn.focus();
  await sleep(120);
  submitBtn.click();

  return { submitted: true, hash: String(window.location.hash || '') };
})();
`;
}

function waitForLoginSuccessScript() {
  return `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const start = Date.now();

  const readLogin = () => {
    try {
      if (window.prefs && typeof window.prefs.getString === 'function') {
        return String(window.prefs.getString('login', '') || '');
      }
    } catch (e) {}
    try {
      return String(localStorage.getItem('login') || '');
    } catch (e) {}
    return '';
  };

  while (Date.now() - start < 120000) {
    const loginStatus = readLogin();
    const hash = String(window.location.hash || '');
    if (loginStatus === 'Permit') {
      return { ok: true, login: loginStatus, hash: hash, reason: 'permit' };
    }
    if (hash === '#/home' || hash === '#/player') {
      return { ok: true, login: loginStatus, hash: hash, reason: 'route' };
    }
    await sleep(1000);
  }

  return {
    ok: false,
    login: readLogin(),
    hash: String(window.location.hash || ''),
    reason: 'timeout'
  };
})();
`;
}

function snapshotScript() {
  return `
(() => {
  const getText = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.textContent || '') : '';
  };

  return {
    hash: String(window.location.hash || ''),
    login: (window.prefs && typeof window.prefs.getString === 'function')
      ? String(window.prefs.getString('login', '') || '')
      : String(localStorage.getItem('login') || ''),
    waiting: getText('txtWaitingContent'),
    writing: getText('txtWritingFile'),
    playbackState: getText('smcPlaybackState'),
    playbackTrack: getText('smcPlaybackTrack'),
    playbackQueue: getText('smcPlaybackQueue')
  };
})();
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.username || !args.token) {
    throw new Error('Missing --username or --token');
  }

  console.log('[AUTO] Querying inspector target:', args.inspectorJsonUrl);
  const target = await fetchInspectorTarget(args.inspectorJsonUrl, args.appId);
  console.log('[AUTO] Target:', target.title || '<no-title>', target.url || '<no-url>');
  console.log('[AUTO] WebSocket:', target.webSocketDebuggerUrl);

  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  console.log('[AUTO] Connected to inspector');

  client.onEvent = (method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      const type = params.type || 'log';
      const text = Array.isArray(params.args) ? params.args.map(formatRemoteObject).join(' ') : '';
      if (text) console.log('[APP.' + type + '] ' + text);
      return;
    }

    if (method === 'Log.entryAdded' && params.entry) {
      const lvl = params.entry.level || 'info';
      const txt = params.entry.text || '';
      console.log('[APP.LOG.' + lvl + '] ' + txt);
    }
  };

  await client.send('Runtime.enable', {}, 15000);
  await client.send('Log.enable', {}, 15000);
  await client.send('Page.enable', {}, 15000);

  console.log('[AUTO] Clearing app storage/cache before automation');
  const resetResult = await client.evaluate(resetStorageScript(), 90000);
  console.log('[AUTO] Storage reset result:', JSON.stringify(resetResult));

  console.log('[AUTO] Applying settings');
  const settingsResult = await client.evaluate(settingsScript(), 90000);
  console.log('[AUTO] Settings result:', JSON.stringify(settingsResult));

  if (!args.noHooks) {
    const hooksResult = await client.evaluate(hooksScript(), 30000);
    console.log('[AUTO] Hook result:', String(hooksResult));
  }

  var successResult = null;
  for (var attempt = 1; attempt <= 2; attempt += 1) {
    console.log('[AUTO] Performing visible login typing (attempt ' + attempt + ')');
    const loginResult = await client.evaluate(loginScript(args.username, args.token), 120000);
    console.log('[AUTO] Login submit result:', JSON.stringify(loginResult));

    console.log('[AUTO] Waiting for login success / route change');
    successResult = await client.evaluate(waitForLoginSuccessScript(), 140000);
    console.log('[AUTO] Login wait result:', JSON.stringify(successResult));

    if (successResult && successResult.ok) {
      break;
    }

    if (attempt < 2) {
      console.log('[AUTO] Login not confirmed, retrying once...');
      await sleep(1500);
    }
  }

  const snapshot = await client.evaluate(snapshotScript(), 30000);
  console.log('[AUTO] App snapshot:', JSON.stringify(snapshot));

  if (args.monitorMs > 0) {
    console.log('[AUTO] Monitoring app console/events for ' + args.monitorMs + ' ms ...');
    await sleep(args.monitorMs);
  }

  await client.close();
  console.log('[AUTO] Completed');
}

main().catch((err) => {
  const msg = (err && err.message) ? err.message : String(err);
  console.error('[AUTO][FAIL]', msg);
  process.exitCode = 1;
});

