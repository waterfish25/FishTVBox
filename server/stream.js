import { Readable } from 'node:stream';
import { DEFAULT_UA, isHttpUrl } from './lib/http.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

function proxyUrl(uri, base) {
  const absolute = new URL(uri, base).toString();
  return `/api/stream?url=${encodeURIComponent(absolute)}`;
}

function rewritePlaylist(body, baseUrl) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxyUrl(uri, baseUrl)}"`);
      }
      return proxyUrl(trimmed, baseUrl);
    })
    .join('\n');
}

function baseHeaders(target) {
  const headers = {
    'User-Agent': DEFAULT_UA,
    Accept: '*/*',
    Referer: `${new URL(target).origin}/`,
  };
  if (/bilibili/i.test(target)) {
    headers.Referer = 'https://www.bilibili.com/';
    headers.Origin = 'https://www.bilibili.com';
  }
  return headers;
}

function isPlaylist(target, contentType) {
  const path = new URL(target).pathname.toLowerCase();
  return (
    path.endsWith('.m3u8') ||
    path.endsWith('.m3u') ||
    /application\/(vnd\.apple\.mpegurl|x-mpegurl|mpegurl)|audio\/mpegurl/i.test(contentType)
  );
}

export async function handleStream(req, res, target) {
  if (!isHttpUrl(target)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS });
    res.end('无效的播放地址');
    return;
  }

  const parsed = new URL(target);
  if (parsed.pathname === '/api/stream') {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS });
    res.end('不能代理自身');
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  res.on('close', () => controller.abort());

  try {
    const headers = baseHeaders(target);
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(target, {
      redirect: 'follow',
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const contentType = upstream.headers.get('content-type') || '';
    const finalUrl = upstream.url || target;

    if (isPlaylist(finalUrl, contentType) && req.method !== 'HEAD') {
      const body = await upstream.text();
      const rewritten = rewritePlaylist(body, finalUrl);
      res.writeHead(upstream.ok ? 200 : upstream.status, {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      });
      res.end(rewritten);
      return;
    }

    const outputHeaders = {
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': upstream.headers.get('cache-control') || 'no-store',
      ...CORS_HEADERS,
    };
    for (const name of ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const value = upstream.headers.get(name);
      if (value) outputHeaders[name.replace(/-(\w)/g, (_, c) => `-${c.toUpperCase()}`)] = value;
    }

    res.writeHead(upstream.status, outputHeaders);

    if (req.method === 'HEAD' || !upstream.body) {
      res.end();
      return;
    }

    const bodyStream = Readable.fromWeb(upstream.body);
    bodyStream.on('error', () => res.destroy());
    bodyStream.pipe(res);
  } catch (error) {
    clearTimeout(timer);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS });
      res.end(`播放地址拉取失败：${error.message}`);
    } else {
      res.destroy();
    }
  }
}

export async function handleImage(req, res, target) {
  if (!isHttpUrl(target)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('无效的图片地址');
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  res.on('close', () => controller.abort());

  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: baseHeaders(target),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !contentType.startsWith('image/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('图片不可用');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      ...CORS_HEADERS,
    });
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    clearTimeout(timer);
    if (!res.headersSent) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('图片拉取失败');
    } else {
      res.destroy();
    }
  }
}
