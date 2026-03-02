// Dev proxy with WebSocket support using http-proxy
// Usage:
//   cd tools
//   npm install
//   node proxy_server.js
// Listens on port 3000 by default. Endpoints:
//   GET/POST /proxy?url=<encoded_target>  -> proxied HTTP request
//   (WebSocket) /ws?url=<encoded_ws_target> -> proxied websocket

const http = require('http');
const url = require('url');
const httpProxy = require('http-proxy');

const PORT = process.env.PORT || 3000;
const proxy = httpProxy.createProxyServer({ changeOrigin: true, ws: true });

proxy.on('error', (err, req, res) => {
  if (!res || res.headersSent) return;
  res.writeHead(502, { 'Content-Type': 'text/plain' });
  res.end('Proxy error: ' + String(err));
});

proxy.on('proxyRes', (proxyRes, req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  } catch (e) {}
});

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/proxy') {
    const target = parsed.query.url;
    if (!target) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing url parameter');
      return;
    }
    // Allow OPTIONS preflight from browser
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
      });
      res.end();
      return;
    }
    // Proxy the request to the target
    proxy.web(req, res, { target: target, changeOrigin: true }, (err) => {
      // error handled in proxy.on('error')
    });
    return;
  }

  // Health
  if (parsed.pathname === '/' || parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.on('upgrade', (req, socket, head) => {
  const parsed = url.parse(req.url, true);
  // Accept upgrades on both /ws and /proxy so clients that use /proxy
  // for negotiation can still upgrade to WebSocket through the same
  // endpoint.
  if (parsed.pathname === '/ws' || parsed.pathname === '/proxy') {
    const target = parsed.query.url;
    if (!target) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\nMissing url');
      socket.destroy();
      return;
    }
    proxy.ws(req, socket, head, { target: target }, (err) => {
      // errors handled in proxy.on('error')
    });
    return;
  }
  // unknown upgrade
  socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
  socket.destroy();
});

server.listen(PORT, () => {
  console.log('Proxy server listening on http://localhost:' + PORT);
  console.log('HTTP proxy endpoint: http://localhost:' + PORT + '/proxy?url=<encoded_target>');
  console.log('WebSocket proxy endpoint: ws://localhost:' + PORT + '/ws?url=<encoded_ws_target>');
});
