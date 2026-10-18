const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3751);
const HOST = process.env.HOST || '127.0.0.1';
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 15000);
const UPSTREAM = process.env.PRODUCT_EXPIRY_UPSTREAM || 'http://47.245.92.187:3751';
const upstreamUrl = new URL(UPSTREAM);
const client = upstreamUrl.protocol === 'https:' ? https : http;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function tryServeLocalAsset(req, res) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) return false;

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  let pathname = decodeURIComponent(requestUrl.pathname || '/');
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
    'x-local-static': 'product-expiry-manager',
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/health')) {
    return writeJson(res, 200, {
      ok: true,
      service: 'product-expiry-manager-local-proxy',
      port: PORT,
      host: HOST,
      upstream: UPSTREAM,
    });
  }

  if ((req.url || '').startsWith('/api/runtime')) {
    return writeJson(res, 200, {
      ok: true,
      runtime: {
        role: 'local',
        mode: 'proxy',
        upstream: UPSTREAM,
        hostname: os.hostname(),
        port: PORT,
        host: HOST,
      },
    });
  }

  if (tryServeLocalAsset(req, res)) {
    return;
  }

  const target = new URL(req.url || '/', upstreamUrl);
  const headers = {
    ...req.headers,
    host: upstreamUrl.host,
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': 'http',
  };
  delete headers['accept-encoding'];

  const proxyReq = client.request({
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    method: req.method,
    path: target.pathname + target.search,
    headers,
  }, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders['content-encoding'];
    responseHeaders['x-local-proxy'] = 'product-expiry-manager';
    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    proxyReq.destroy(new Error(`upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`));
  });

  proxyReq.on('error', (error) => {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    writeJson(res, 502, {
      ok: false,
      error: '本地代理连接云端失败',
      detail: error.message,
      upstream: UPSTREAM,
      timeout_ms: UPSTREAM_TIMEOUT_MS,
    });
  });

  req.pipe(proxyReq);
});

server.listen(PORT, HOST, () => {
  console.log(`产品保质期本地代理已启动: http://${HOST}:${PORT} -> ${UPSTREAM}`);
});

server.on('error', (error) => {
  console.error('本地代理启动失败:', error.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭产品保质期本地代理...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
