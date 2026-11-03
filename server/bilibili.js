import { fetchJson } from './lib/http.js';

let cache = { key: '', at: 0, data: null };
const TTL = 10 * 60 * 1000;

const API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
};

function normalize(item) {
  const bvid = item.bvid || '';
  return {
    bvid,
    title: String(item.title || '').replace(/<[^>]*>/g, ''),
    cover: item.pic || '',
    owner: item.owner?.name || item.up_name || '',
    duration: Number(item.duration) || 0,
    view: Number(item.stat?.view) || 0,
    pubdate: Number(item.pubdate) || 0,
    link: bvid ? `https://www.bilibili.com/video/${bvid}` : '',
    embed: bvid
      ? `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=1&high_quality=1&danmaku=0`
      : '',
  };
}

async function fetchPopular(count) {
  const data = await fetchJson(
    `https://api.bilibili.com/x/web-interface/popular?ps=${Math.max(20, count * 3)}&pn=1`,
    { headers: API_HEADERS, timeout: 12_000 },
  );
  if (data.code !== 0) throw new Error(data.message || `B站接口返回 ${data.code}`);
  return (data.data?.list || []).map(normalize).filter((item) => item.bvid);
}

async function fetchRanking() {
  const data = await fetchJson('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all', {
    headers: API_HEADERS,
    timeout: 12_000,
  });
  if (data.code !== 0) throw new Error(data.message || `B站接口返回 ${data.code}`);
  return (data.data?.list || []).map(normalize).filter((item) => item.bvid);
}

export async function getShorts(config, { refresh = false } = {}) {
  if (!config.shorts.enabled) {
    return { ok: true, enabled: false, items: [] };
  }

  const key = JSON.stringify(config.shorts);
  if (!refresh && cache.data && cache.key === key && Date.now() - cache.at < TTL) return cache.data;

  let items;
  try {
    items = await fetchPopular(config.shorts.count);
  } catch (error) {
    try {
      items = await fetchRanking();
    } catch {
      const data = { ok: false, enabled: true, items: [], error: error.message };
      cache = { key, at: Date.now(), data };
      return data;
    }
  }

  const maxDuration = config.shorts.maxDuration;
  const shortEnough = items.filter((item) => item.duration <= maxDuration);
  const filtered = shortEnough.length >= 4 ? shortEnough : items;
  filtered.sort((a, b) => a.duration - b.duration);

  const data = {
    ok: true,
    enabled: true,
    items: filtered.slice(0, config.shorts.count),
    updatedAt: Date.now(),
  };
  cache = { key, at: Date.now(), data };
  return data;
}

export function clearShortsCache() {
  cache = { key: '', at: 0, data: null };
}
