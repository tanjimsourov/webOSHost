/**
 * SignalRClient implements server push commands with exact parity to Java SignalRClient.
 * Uses Microsoft SignalR JavaScript client for proper hub connection.
 *
 * Java reference: SignalRClient.java
 * Hub URL: https://api.applicationaddons.com/pushNotification
 *
 * Key behaviors:
 *   - S7-R1: Handlers call same actions as Java SignalRClient handlers
 *   - S7-R2: Exponential backoff reconnect; no reconnect storm
 *
 * Supported commands (matching Java):
 *   - WelcomeMethodName: Initial connection, sends token to server
 *   - privateMessageMethodName: Receives commands (Next, Playlist, Ads, Publish, restart)
 */
(function () {
  var TAG = '[SIGNALR]';

  // SignalR hub URL matching Java
  var HUB_URL = 'https://api.applicationaddons.com/pushNotification';

  // Reconnect settings (S7-R2: exponential backoff)
  var INITIAL_RECONNECT_DELAY_MS = 1000;
  var MAX_RECONNECT_DELAY_MS = 60000;
  var RECONNECT_MULTIPLIER = 2;
  var MAX_RECONNECT_ATTEMPTS_PER_WINDOW = 10;
  var RECONNECT_WINDOW_MS = 300000; // 5 minutes

  // State
  var hubConnection = null;
  var signalId = '';
  var isConnected = false;
  var isConnecting = false;
  var reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  var reconnectTimer = null;
  var reconnectAttempts = 0;
  var reconnectWindowStart = Date.now();

  // Callbacks for external handlers
  var onPlayNextCallback = null;
  var onPlayPlaylistCallback = null;
  var onPlayAdCallback = null;
  var onPlaySongCallback = null;
  var onPublishUpdateCallback = null;
  var onRestartCallback = null;
  var onConnectedCallback = null;
  var onDisconnectedCallback = null;

  /**
   * Get TokenId from preferences.
   */
  function getTokenId() {
    return prefs.getString('token_no', '') || prefs.getString('TokenId', '');
  }

  /**
   * Check if we've exceeded reconnect attempts in the current window.
   */
  function checkReconnectLimit() {
    var now = Date.now();
    if (now - reconnectWindowStart > RECONNECT_WINDOW_MS) {
      // Reset window
      reconnectWindowStart = now;
      reconnectAttempts = 0;
    }
    return reconnectAttempts < MAX_RECONNECT_ATTEMPTS_PER_WINDOW;
  }

  /**
   * Build SignalR connection using @microsoft/signalr library.
   * Falls back to WebSocket if SignalR library not available.
   */
  function buildConnection() {
    // Check if SignalR library is loaded
    if (typeof signalR !== 'undefined' && signalR.HubConnectionBuilder) {
      console.log(TAG, 'Using SignalR library');
      var hubUrlToUse = HUB_URL;
      try {
        if (window && window.PROXY_API_BASE && typeof window.PROXY_API_BASE === 'string') {
          hubUrlToUse = window.PROXY_API_BASE + encodeURIComponent(HUB_URL);
          console.log(TAG, 'Using proxied hub URL for dev:', hubUrlToUse);
        }
      } catch (e) {}

      return signalR.HubConnectionBuilder
        ? new signalR.HubConnectionBuilder()
            .withUrl(hubUrlToUse)
            .withAutomaticReconnect({
              nextRetryDelayInMilliseconds: function (retryContext) {
                if (retryContext.previousRetryCount >= 10) {
                  return null; // Stop retrying
                }
                return Math.min(
                  INITIAL_RECONNECT_DELAY_MS * Math.pow(RECONNECT_MULTIPLIER, retryContext.previousRetryCount),
                  MAX_RECONNECT_DELAY_MS
                );
              }
            })
            .build()
        : null;
    }

    // Fallback: Use raw WebSocket with SignalR protocol
    console.log(TAG, 'SignalR library not found, using WebSocket fallback');
    return null;
  }

  /**
   * Handle incoming messages matching Java privateMessageMethodName handler.
   */
  function handlePrivateMessage(data) {
    if (!data) {
      console.warn(TAG, 'Received null message');
      return;
    }

    console.log(TAG, 'Received message:', JSON.stringify(data));

    try {
      var msg = typeof data === 'string' ? JSON.parse(data) : data;

      var id = msg.id || msg.Id || '';
      var dataType = msg.type || msg.datatype || msg.dataType || '';
      var playType = msg.playType || msg.type || '';
      var url = msg.url || msg.Url || '';
      var albumId = msg.albumid || msg.albumId || msg.AlbumId || '';
      var repeat = parseInt(msg.repeat || '0', 10);
      var filesize = msg.filesize || msg.Filesize || '0';
      var titleName = msg.title || msg.titlename || msg.Title || '';
      var artistId = msg.artistid || msg.artistId || msg.ArtistId || '';
      var mediaType = msg.mediaType || msg.mediatype || '';
      var artistName = msg.artistname || msg.artistName || msg.ArtistName || '';
      var restart = msg.playerrestart || msg.restart || '0';

      console.log(TAG, 'Parsed - playType:', playType, 'dataType:', dataType, 'id:', id, 'restart:', restart);

      // Handle "Next" command - play next song immediately
      if (playType === 'Next') {
        console.log(TAG, 'Command: Play Next Song');
        if (onPlayNextCallback) {
          onPlayNextCallback({
            id: id,
            url: url,
            albumId: albumId,
            artistId: artistId,
            title: titleName,
            artistName: artistName,
            repeat: repeat,
            filesize: filesize,
            mediaType: mediaType
          });
        }
      }

      // Handle "Publish" + "UpdateNow" - refresh playlists and ads
      if (dataType === 'Publish' && playType === 'UpdateNow') {
        console.log(TAG, 'Command: Publish Update');
        if (onPublishUpdateCallback) {
          onPublishUpdateCallback();
        }
      }

      // Handle "Song" or "PlaySong" command - play specific song by index or ID
      if (playType === 'Song' || playType === 'PlaySong') {
        console.log(TAG, 'Command: Play Song', id, 'index:', msg.songIndex || msg.index);
        if (onPlaySongCallback) {
          onPlaySongCallback({
            songId: id,
            songIndex: msg.songIndex || msg.index || null,
            titleId: msg.titleId || msg.title_id || id,
            url: url,
            title: titleName,
            artistName: artistName
          });
        }
      }

      // Handle "Playlist" command - play specific playlist now
      if (playType === 'Playlist') {
        console.log(TAG, 'Command: Play Playlist', id);
        if (onPlayPlaylistCallback) {
          onPlayPlaylistCallback(id);
        }
      }

      // Handle "Ads" command - play specific advertisement now
      if (playType === 'Ads') {
        console.log(TAG, 'Command: Play Ad', id);
        if (onPlayAdCallback) {
          onPlayAdCallback(id);
        }
      }

      // Handle restart command
      if (restart === '1') {
        console.log(TAG, 'Command: Restart Player');
        if (onRestartCallback) {
          onRestartCallback();
        }
      }
    } catch (err) {
      console.error(TAG, 'Error handling message:', err);
    }
  }

  /**
   * Handle welcome message - send token to server.
   * Matches Java: hubConnection.on("WelcomeMethodName", ...)
   */
  function handleWelcome(data) {
    console.log(TAG, 'Welcome received:', data);
    if (data && typeof data === 'string' && data.length > 0) {
      signalId = data;
      var tokenId = getTokenId();
      console.log(TAG, 'Sending token to server. SignalId:', signalId, 'TokenId:', tokenId);

      // Send token to server (matches Java: hubConnection.invoke("GetDataFromClient", token, signalid))
      if (hubConnection && typeof hubConnection.invoke === 'function') {
        hubConnection.invoke('GetDataFromClient', tokenId, signalId)
          .then(function () {
            console.log(TAG, 'Token sent successfully');
          })
          .catch(function (err) {
            console.error(TAG, 'Failed to send token:', err);
          });
      }
    }
  }

  /**
   * Setup event handlers on the connection.
   */
  function setupHandlers() {
    if (!hubConnection) return;

    // Welcome handler (matches Java)
    hubConnection.on('WelcomeMethodName', function (data) {
      handleWelcome(data);
    });

    // Private message handler (matches Java)
    hubConnection.on('privateMessageMethodName', function (data) {
      handlePrivateMessage(data);
    });

    // Connection lifecycle events
    hubConnection.onclose(function (error) {
      console.log(TAG, 'Connection closed', error ? error.message : '');
      isConnected = false;
      if (onDisconnectedCallback) {
        onDisconnectedCallback(error);
      }
      scheduleReconnect();
    });

    hubConnection.onreconnecting(function (error) {
      console.log(TAG, 'Reconnecting...', error ? error.message : '');
      isConnected = false;
    });

    hubConnection.onreconnected(function (connectionId) {
      console.log(TAG, 'Reconnected. ConnectionId:', connectionId);
      isConnected = true;
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      if (onConnectedCallback) {
        onConnectedCallback();
      }
    });
  }

  /**
   * Schedule a reconnect attempt with exponential backoff.
   */
  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    if (!checkReconnectLimit()) {
      console.warn(TAG, 'Max reconnect attempts reached in window, waiting...');
      reconnectTimer = setTimeout(function () {
        reconnectWindowStart = Date.now();
        reconnectAttempts = 0;
        scheduleReconnect();
      }, RECONNECT_WINDOW_MS);
      return;
    }

    console.log(TAG, 'Scheduling reconnect in', reconnectDelay, 'ms');
    reconnectTimer = setTimeout(function () {
      reconnectAttempts++;
      connect();
      // Exponential backoff
      reconnectDelay = Math.min(reconnectDelay * RECONNECT_MULTIPLIER, MAX_RECONNECT_DELAY_MS);
    }, reconnectDelay);
  }

  /**
   * Connect to the SignalR hub.
   */
  async function connect() {
    if (isConnected || isConnecting) {
      console.log(TAG, 'Already connected or connecting');
      return;
    }

    var tokenId = getTokenId();
    if (!tokenId) {
      console.warn(TAG, 'No token ID available, cannot connect');
      return;
    }

    console.log(TAG, 'Connecting to hub:', HUB_URL);
    isConnecting = true;

    try {
      // Build connection if not exists
      if (!hubConnection) {
        hubConnection = buildConnection();

        if (!hubConnection || typeof hubConnection.start !== 'function') {
          // Fallback to WebSocket-based approach
          console.log(TAG, 'Using WebSocket fallback connection');
          hubConnection = null;
          connectWebSocketFallback();
          return;
        }

        setupHandlers();
      }

      if (!hubConnection || typeof hubConnection.start !== 'function') {
        console.log(TAG, 'Using WebSocket fallback connection');
        hubConnection = null;
        connectWebSocketFallback();
        return;
      }

      await hubConnection.start();
      console.log(TAG, 'Connected successfully');
      isConnected = true;
      isConnecting = false;
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

      if (onConnectedCallback) {
        onConnectedCallback();
      }
    } catch (err) {
      console.error(TAG, 'Connection failed:', err);
      isConnecting = false;
      isConnected = false;
      scheduleReconnect();
    }
  }

  /**
   * WebSocket fallback for environments without SignalR library.
   * Implements basic SignalR protocol over WebSocket.
   */
  function connectWebSocketFallback() {
    var wsUrl = HUB_URL.replace('https://', 'wss://').replace('http://', 'ws://');

    try {
      var ws = new WebSocket(wsUrl);

      ws.onopen = function () {
        console.log(TAG, 'WebSocket connected');
        isConnected = true;
        isConnecting = false;
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

        // Send handshake
        ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + '\x1e');

        if (onConnectedCallback) {
          onConnectedCallback();
        }
      };

      ws.onmessage = function (event) {
        var messages = event.data.split('\x1e').filter(function (m) { return m; });
        messages.forEach(function (msgStr) {
          try {
            var msg = JSON.parse(msgStr);
            if (msg.type === 1 && msg.target) {
              // Invocation message
              if (msg.target === 'WelcomeMethodName' && msg.arguments && msg.arguments[0]) {
                handleWelcome(msg.arguments[0]);
              } else if (msg.target === 'privateMessageMethodName' && msg.arguments && msg.arguments[0]) {
                handlePrivateMessage(msg.arguments[0]);
              }
            }
          } catch (e) {
            // Ignore parse errors for non-JSON messages
          }
        });
      };

      ws.onerror = function (err) {
        console.error(TAG, 'WebSocket error:', err);
      };

      ws.onclose = function () {
        console.log(TAG, 'WebSocket closed');
        isConnected = false;
        isConnecting = false;
        if (onDisconnectedCallback) {
          onDisconnectedCallback();
        }
        scheduleReconnect();
      };

      // Store for later use
      //
      // The fallback connection object intentionally mirrors the shape of
      // the `HubConnection` provided by the official SignalR client
      // library. In particular a no‑op `start()` method is defined to
      // prevent "hubConnection.start is not a function" errors when
      // consumers attempt to call `start()` regardless of the underlying
      // implementation. This method simply resolves immediately since
      // the WebSocket connection is already opened by the time this
      // object is created.
      hubConnection = {
        /**
         * Underlying WebSocket reference. Exposed primarily for
         * completeness; clients should not depend on this directly.
         */
        _ws: ws,
        /**
         * Mirror the SignalR HubConnection.start() signature. Returns
         * a resolved promise as the WebSocket is already open.
         *
         * @returns {Promise<void>}
         */
        start: function () {
          return Promise.resolve();
        },
        /**
         * Invoke a server method over the SignalR protocol. The
         * arguments after the method name are forwarded verbatim.
         *
         * @param {string} method The server method name
         * @param {...any} args Optional arguments to send
         * @returns {Promise<void>}
         */
        invoke: function (method) {
          var args = Array.prototype.slice.call(arguments, 1);
          var msg = {
            type: 1,
            target: method,
            arguments: args
          };
          ws.send(JSON.stringify(msg) + '\x1e');
          return Promise.resolve();
        },
        /**
         * Gracefully close the WebSocket connection.
         *
         * @returns {Promise<void>}
         */
        stop: function () {
          ws.close();
          return Promise.resolve();
        },
        /**
         * Placeholder for event registration when using the official
         * SignalR client. When using the WebSocket fallback the
         * handlers are wired up explicitly in `onmessage` above so
         * nothing is done here. Included to avoid undefined errors.
         */
        on: function () { /* Handlers set up separately */ },
        /**
         * Placeholder lifecycle callbacks. These are no‑ops on the
         * fallback connection but are defined so calling code can set
         * handlers without checking for existence.
         */
        onclose: function () {},
        onreconnecting: function () {},
        onreconnected: function () {}
      };
    } catch (err) {
      console.error(TAG, 'WebSocket fallback failed:', err);
      isConnecting = false;
      scheduleReconnect();
    }
  }

  /**
   * Disconnect from the hub.
   */
  async function disconnect() {
    console.log(TAG, 'Disconnecting');

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (hubConnection) {
      try {
        if (typeof hubConnection.stop === 'function') {
          await hubConnection.stop();
        } else if (hubConnection._ws) {
          hubConnection._ws.close();
        }
      } catch (err) {
        console.error(TAG, 'Error during disconnect:', err);
      }
    }

    isConnected = false;
    isConnecting = false;
    hubConnection = null;
    signalId = '';
    console.log(TAG, 'Disconnected');
  }

  /**
   * Check if connected.
   */
  function isHubConnected() {
    return isConnected;
  }

  /**
   * Set callback handlers.
   */
  function setCallbacks(callbacks) {
    callbacks = callbacks || {};
    onPlayNextCallback = callbacks.onPlayNext || null;
    onPlayPlaylistCallback = callbacks.onPlayPlaylist || null;
    onPlayAdCallback = callbacks.onPlayAd || null;
    onPlaySongCallback = callbacks.onPlaySong || null;
    onPublishUpdateCallback = callbacks.onPublishUpdate || null;
    onRestartCallback = callbacks.onRestart || null;
    onConnectedCallback = callbacks.onConnected || null;
    onDisconnectedCallback = callbacks.onDisconnected || null;
  }

  /**
   * Get connection status.
   */
  function getStatus() {
    return {
      isConnected: isConnected,
      isConnecting: isConnecting,
      signalId: signalId,
      reconnectDelay: reconnectDelay,
      reconnectAttempts: reconnectAttempts
    };
  }

  // Expose globally
  window.SignalRClient = {
    connect: connect,
    disconnect: disconnect,
    isConnected: isHubConnected,
    setCallbacks: setCallbacks,
    getStatus: getStatus,
    // Expose for testing
    handlePrivateMessage: handlePrivateMessage
  };
})();
