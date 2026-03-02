// Simple media proxy to bypass CORS during local development
// Usage: node media_proxy.js
// Listens on port 3000 and proxies GET /proxy?url=<encoded_url>

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/proxy') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const target = parsed.query.url;
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing url parameter');
    return;
  }
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid url parameter');
    return;
  }

  const client = targetUrl.protocol === 'https:' ? https : http;
  const options = {
    method: 'GET',
    headers: {
      'User-Agent': req.headers['user-agent'] || 'media-proxy',
      'Accept': '*/*'
    }
  };

  const prox = client.request(targetUrl, options, (proxRes) => {
    // Propagate status and headers (but override CORS headers)
    const headers = Object.assign({}, proxRes.headers);
    headers['access-control-allow-origin'] = '*';
    headers['access-control-allow-methods'] = 'GET, OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type, Range';
    // Stream response
    res.writeHead(proxRes.statusCode || 200, headers);
    proxRes.pipe(res);
  });

  prox.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + String(err));
  });

  prox.end();
});

server.listen(PORT, () => {
  console.log(`Media proxy listening on http://localhost:${PORT}/proxy?url=<encoded_url>`);
});
