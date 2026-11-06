import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_PATH,
  DATA_DIR,
  PORT,
  VERSION,
  ensureDataDir,
  loadConfig,
  normalizeConfig,
  saveConfig,
} from './config.js';
import { getEpg, getLiveData, clearIptvCache, testSource } from './iptv.js';
import { clearMovieCache, getMovieDetail, listMovies, testMovieSource } from './movies.js';
import { clearShortsCache, getShorts } from './bilibili.js';
import { handleImage, handleStream } from './stream.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '../web');
const startedAt = Date.now();

ensureDataDir();
let config = loadConfig();
const sseClients = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function fail(res, status, message) {
  json(res, status, { ok: false, error: message });
}

function broadcast(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function readJson(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('JSON 格式错误');
  }
}

function lanAddresses(req) {
  const addresses = [];
  const host = req.headers.host;
  if (host) addresses.push(`http://${host}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) addresses.push(`http://${item.address}:${PORT}`);
    }
  }
  return [...new Set(addresses)];
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (pathname === '/api/info') {
    const addresses = lanAddresses(req);
    return json(res, 200, {
      ok: true,
      version: VERSION,
      port: PORT,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      addresses,
      origin: addresses[0] || `http://localhost:${PORT}`,
      remote: '/remote',
      settings: '/settings',
      tv: '/',
    });
  }

  if (pathname === '/api/config') {
    if (req.method === 'GET') {
      return json(res, 200, { ok: true, config, version: VERSION, dataDir: DATA_DIR });
    }
    if (req.method === 'PUT') {
      const input = await readJson(req);
      config = saveConfig(normalizeConfig({ ...input, site: { ...config.site, ...(input.site || {}) } }));
      clearIptvCache();
      clearMovieCache();
      clearShortsCache();
      broadcast('config', { version: VERSION, config });
      return json(res, 200, { ok: true, config });
    }
    return fail(res, 405, 'Method Not Allowed');
  }

  if (pathname === '/api/iptv/channels') {
    const data = await getLiveData(config, { refresh: searchParams.get('refresh') === '1' });
    return json(res, 200, data);
  }

  if (pathname === '/api/iptv/epg') {
    const id = searchParams.get('id');
    if (!id) return fail(res, 400, '缺少频道 id');
    const data = await getEpg(config, id);
    return json(res, 200, { ok: true, ...data });
  }

  if (pathname === '/api/iptv/test') {
    const data = await testSource(searchParams.get('url'));
    return json(res, 200, data);
  }

  if (pathname === '/api/movies') {
    const data = await listMovies(config, {
      wd: searchParams.get('wd') || '',
      pg: Math.max(1, Number(searchParams.get('pg')) || 1),
      source: searchParams.get('source') || '',
    });
    return json(res, 200, data);
  }

  if (pathname === '/api/movies/detail') {
    const data = await getMovieDetail(config, {
      id: searchParams.get('id'),
      source: searchParams.get('source') || '',
    });
    return json(res, 200, data);
  }

  if (pathname === '/api/movies/test') {
    const data = await testMovieSource(searchParams.get('api'));
    return json(res, 200, data);
  }

  if (pathname === '/api/shorts') {
    const data = await getShorts(config, { refresh: searchParams.get('refresh') === '1' });
    return json(res, 200, data);
  }

  if (pathname === '/api/stream') {
    return handleStream(req, res, searchParams.get('url'));
  }

  if (pathname === '/api/img') {
    return handleImage(req, res, searchParams.get('url'));
  }

  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\n\n`);
    res.write(`event: hello\ndata: ${JSON.stringify({ version: VERSION, uptime: Math.round((Date.now() - startedAt) / 1000) })}\n\n`);
    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  if (pathname === '/api/remote/status') {
    return json(res, 200, { ok: true, clients: sseClients.size });
  }

  if (pathname === '/api/remote/press' && req.method === 'POST') {
    const body = await readJson(req, 10_000);
    const event = {};
    if (body.key) event.key = String(body.key).slice(0, 30);
    else if (body.action) {
      event.action = String(body.action).slice(0, 20);
      if (body.text) event.text = String(body.text).slice(0, 120);
    } else {
      return fail(res, 400, '缺少遥控指令');
    }
    broadcast('remote', event);
    return json(res, 200, { ok: true, clients: sseClients.size, event });
  }

  return fail(res, 404, '接口不存在');
}

const PAGE_ROUTES = {
  '/': 'index.html',
  '/tv': 'index.html',
  '/catchup': 'catchup.html',
  '/movies': 'movies.html',
  '/apps': 'apps.html',
  '/bili': 'bili.html',
  '/control': 'control.html',
  '/settings': 'settings.html',
  '/remote': 'remote.html',
  '/favicon.ico': 'icon.svg',
};

function resolveStatic(pathname) {
  const clean = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (PAGE_ROUTES[clean]) return path.join(WEB_DIR, PAGE_ROUTES[clean]);

  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(1));
  } catch {
    return null;
  }
  if (relative.includes('\0')) return null;
  const filePath = path.resolve(WEB_DIR, relative);
  if (!filePath.startsWith(`${WEB_DIR}${path.sep}`)) return null;
  return filePath;
}

function serveStatic(req, res, pathname) {
  const filePath = resolveStatic(pathname);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const cache = pathname.startsWith('/vendor/')
      ? 'public, max-age=604800'
      : 'no-cache';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cache,
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    fail(res, 400, '无效的请求地址');
    return;
  }

  try {
    if (url.pathname === '/healthz') {
      return json(res, 200, { ok: true, version: VERSION, uptime: Math.round((Date.now() - startedAt) / 1000) });
    }
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(`[http] ${url.pathname}:`, error);
    if (!res.headersSent) fail(res, 500, error.message || '服务器内部错误');
    else res.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FishTVBox v${VERSION} 已启动`);
  console.log(`  电视端  http://<本机IP>:${PORT}`);
  console.log(`  配置页  http://<本机IP>:${PORT}/settings`);
  console.log(`  遥控页  http://<本机IP>:${PORT}/remote`);
  console.log(`  数据目录 ${DATA_DIR}（${CONFIG_PATH}）`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`收到 ${signal}，正在退出`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}
