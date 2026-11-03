import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeXml,
  fetchText,
  isHttpUrl,
  mirrorCandidates,
  normalizeName,
  parseAttrs,
  splitExtInf,
} from './lib/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_FILE = path.join(__dirname, 'demo.m3u');
const TZ = 'Asia/Shanghai';

let liveCache = { key: '', at: 0, data: null };
let epgCache = { url: '', at: 0, data: null };

const timeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function timeParts(epochSeconds) {
  const out = {};
  for (const part of timeFormatter.formatToParts(new Date(epochSeconds * 1000))) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function formatEpoch(epochSeconds, pattern = 'yyyyMMddHHmmss') {
  const p = timeParts(epochSeconds);
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => {
    if (token === 'yyyy') return p.year;
    if (token === 'MM') return p.month;
    if (token === 'dd') return p.day;
    if (token === 'HH') return p.hour;
    if (token === 'mm') return p.minute;
    if (token === 'ss') return p.second;
    return token;
  });
}

/** 当天 00:00 ~ 24:00 的秒级时间戳（按 Asia/Shanghai，固定 +08:00） */
export function todayRange(nowMs = Date.now()) {
  const p = timeParts(Math.floor(nowMs / 1000));
  const start = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 1000 - 8 * 3600;
  return {
    start,
    end: start + 86400,
    key: `${p.year}-${p.month}-${p.day}`,
    now: Math.floor(nowMs / 1000),
  };
}

function parseHeader(text) {
  const firstLine = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith('#EXTM3U')) || '';
  const attrs = parseAttrs(firstLine);
  const epgUrls = String(attrs['x-tvg-url'] || attrs['url-tvg'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(isHttpUrl);
  return {
    catchup: String(attrs.catchup || '').toLowerCase(),
    catchupSource: attrs['catchup-source'] || '',
    epgUrls,
  };
}

function parseTxt(text) {
  const channels = [];
  const groups = new Map();
  let group = '未分组';

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const genre = line.match(/^(.+?),\s*#genre#\s*$/i);
    if (genre) {
      group = genre[1].trim() || '未分组';
      if (!groups.has(group)) groups.set(group, []);
      continue;
    }

    const comma = line.indexOf(',');
    if (comma <= 0) continue;
    const name = line.slice(0, comma).trim();
    const url = line.slice(comma + 1).trim().split('#')[0].trim();
    if (!name || !isHttpUrl(url)) continue;

    const channel = {
      id: '',
      name,
      logo: '',
      group,
      url,
      catchup: '',
      catchupSource: '',
    };
    channels.push(channel);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(channel);
  }

  return finalize(channels, groups, []);
}

function finalize(channels, groups, epgUrls) {
  const used = new Map();
  for (const channel of channels) {
    const base = channel.id || channel.name;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    channel.id = count ? `${base}#${count + 1}` : base;
    if (!groups.has(channel.group)) groups.set(channel.group, []);
    if (!groups.get(channel.group).includes(channel)) groups.get(channel.group).push(channel);
  }

  return {
    channels,
    categories: [...groups.entries()]
      .filter(([, list]) => list.length > 0)
      .map(([name, list]) => ({ name, channels: list })),
    epgUrls,
  };
}

export function parsePlaylist(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  if (!/#EXTINF|#EXTM3U/i.test(clean)) return parseTxt(clean);

  const header = parseHeader(clean);
  const channels = [];
  const groups = new Map();
  let pending = null;

  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const attrs = parseAttrs(line);
      const [, name] = splitExtInf(line);
      pending = {
        attrs,
        name: (name || attrs['tvg-name'] || '').trim(),
      };
      continue;
    }

    if (line.startsWith('#')) continue;

    if (!pending || !isHttpUrl(line)) {
      pending = null;
      continue;
    }

    const attrs = pending.attrs;
    const group = (attrs['group-title'] || '未分组').trim() || '未分组';
    const channel = {
      id: attrs['tvg-id'] || '',
      name: pending.name || attrs['tvg-name'] || `频道 ${channels.length + 1}`,
      logo: attrs['tvg-logo'] || '',
      group,
      url: line,
      catchup: String(attrs.catchup || header.catchup || '').toLowerCase(),
      catchupSource: attrs['catchup-source'] || header.catchupSource || '',
    };
    channels.push(channel);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(channel);
    pending = null;
  }

  return finalize(channels, groups, header.epgUrls);
}

function readDemo() {
  try {
    return fs.readFileSync(DEMO_FILE, 'utf8');
  } catch {
    return '';
  }
}

async function loadSource(source) {
  if (source.url === 'builtin:demo') {
    const parsed = parsePlaylist(readDemo());
    if (parsed.channels.length) return { ok: true, parsed, url: source.url };
    return { ok: false, error: '内置演示源为空', url: source.url };
  }

  const candidates = [...new Set([source.url, ...mirrorCandidates(source.url)].filter(isHttpUrl))];
  const errors = [];
  for (const url of candidates) {
    try {
      const text = await fetchText(url, { timeout: 9000 });
      const parsed = parsePlaylist(text);
      if (parsed.channels.length > 0) return { ok: true, parsed, url };
      errors.push(`${url} 返回 0 个频道`);
    } catch (error) {
      errors.push(`${url} ${error.message}`);
    }
  }
  return {
    ok: false,
    url: candidates[0] || source.url,
    error: errors[0] || '直播源不可用',
  };
}

export async function getLiveData(config, { refresh = false } = {}) {
  const sources = config.iptv.sources;
  const key = JSON.stringify(sources);
  const ttl = Math.max(1, config.iptv.cacheMinutes) * 60 * 1000;
  if (!refresh && liveCache.data && liveCache.key === key && Date.now() - liveCache.at < (liveCache.data.ok ? ttl : 90_000)) {
    return liveCache.data;
  }

  let lastError = '';
  for (const source of sources) {
    const result = await loadSource(source);
    if (result.ok) {
      const data = {
        ok: true,
        source: { name: source.name, url: source.url, resolvedUrl: result.url },
        channels: result.parsed.channels,
        categories: result.parsed.categories,
        epgUrls: result.parsed.epgUrls,
        updatedAt: Date.now(),
        total: result.parsed.channels.length,
      };
      liveCache = { key, at: Date.now(), data };
      return data;
    }
    lastError = `${source.name}: ${result.error}`;
  }

  const data = {
    ok: false,
    source: sources[0] ? { name: sources[0].name, url: sources[0].url } : null,
    channels: [],
    categories: [],
    epgUrls: [],
    updatedAt: Date.now(),
    total: 0,
    error: lastError || '没有可用的直播源',
  };
  liveCache = { key, at: Date.now(), data };
  return data;
}

export function clearIptvCache() {
  liveCache = { key: '', at: 0, data: null };
  epgCache = { url: '', at: 0, data: null };
}

/** 将 catchup 模板里的时间占位符替换成真实时间 */
export function buildCatchupUrl(channel, start, end) {
  const template = channel.catchupSource;
  if (!template || channel.catchup === 'none') return null;

  const begin = Math.floor(start);
  const finish = Math.floor(end);
  let suffix = template
    .replace(/\$\{\((b|e)\)([^}]*)\}/g, (_, which, pattern) =>
      formatEpoch(which === 'b' ? begin : finish, pattern || 'yyyyMMddHHmmss'))
    .replace(/\$\{(b|e)\}/g, (_, which) => String(which === 'b' ? begin : finish))
    .replace(/\$\{start\}/g, String(begin))
    .replace(/\$\{end\}/g, String(finish))
    .replace(/\{utc\}/g, String(begin))
    .replace(/\{utcend\}/g, String(finish))
    .replace(/\{lutc\}/g, String(begin))
    .replace(/\{start\}/g, formatEpoch(begin))
    .replace(/\{end\}/g, formatEpoch(finish))
    .replace(/\{yyyy\}/g, timeParts(begin).year);

  let base = channel.url;
  let separator = '';
  if (suffix.startsWith('?') || suffix.startsWith('&')) {
    suffix = suffix.slice(1);
    if (!base.includes('?')) separator = base.endsWith('?') ? '' : '?';
  } else if (!base.includes('?') && suffix) {
    separator = '?';
  } else if (base.includes('?') && !base.endsWith('?') && !base.endsWith('&')) {
    separator = '&';
  }
  return `${base}${separator}${suffix}`;
}

function parseXmltvTime(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*([+-])(\d{2})(\d{2})?/.exec(String(value || '').trim());
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', sign, offHour, offMinute = '00'] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offset = (Number(offHour) * 60 + Number(offMinute)) * 60 * 1000;
  return (utc - (sign === '+' ? offset : -offset)) / 1000;
}

function parseXmltv(text) {
  const programs = new Map();
  const aliases = new Map();

  const channelRe = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/g;
  for (const match of text.matchAll(channelRe)) {
    const attrs = parseAttrs(match[1]);
    if (!attrs.id) continue;
    const key = normalizeName(attrs.id);
    aliases.set(key, key);
    for (const display of match[2].matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)) {
      const alias = normalizeName(decodeXml(display[1]));
      if (alias) aliases.set(alias, key);
    }
  }

  const programRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  for (const match of text.matchAll(programRe)) {
    const attrs = parseAttrs(match[1]);
    const start = parseXmltvTime(attrs.start);
    const stop = parseXmltvTime(attrs.stop);
    if (!attrs.channel || start == null || stop == null || stop <= start) continue;
    const title = decodeXml(match[2].match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '未命名节目');
    const key = normalizeName(attrs.channel);
    if (!programs.has(key)) programs.set(key, []);
    programs.get(key).push({ title, start, stop });
  }

  for (const list of programs.values()) list.sort((a, b) => a.start - b.start);
  return { programs, aliases };
}

async function loadEpg(urls) {
  if (!urls || !urls.length) return null;
  if (epgCache.data && epgCache.url === urls[0] && Date.now() - epgCache.at < 6 * 3600 * 1000) {
    return epgCache.data;
  }

  for (const url of urls) {
    const candidates = [...new Set([url, ...mirrorCandidates(url)].filter(isHttpUrl))];
    for (const candidate of candidates) {
      try {
        const text = await fetchText(candidate, { timeout: 20_000 });
        if (!/<programme|<channel/i.test(text)) continue;
        const parsed = parseXmltv(text);
        if (parsed.programs.size > 0) {
          epgCache = { url: urls[0], at: Date.now(), data: parsed };
          return parsed;
        }
      } catch {
        // 尝试下一个 EPG 镜像
      }
    }
  }
  return null;
}

function programsFor(epg, channel) {
  if (!epg) return [];
  const candidates = [channel.epgId, channel.id, channel.name, channel.group]
    .filter(Boolean)
    .map(normalizeName);
  const tried = new Set();
  for (const name of candidates) {
    const key = epg.aliases.get(name) || name;
    if (tried.has(key)) continue;
    tried.add(key);
    if (epg.programs.has(key)) return epg.programs.get(key);
  }
  return [];
}

function programState(program, now) {
  if (now >= program.start && now < program.stop) return 'live';
  if (program.stop <= now) return 'past';
  return 'future';
}

function buildHourlySlots(day, now, channel) {
  const slots = [];
  for (let cursor = day.start; cursor < day.end; cursor += 3600) {
    const start = cursor;
    const stop = Math.min(cursor + 3600, day.end);
    const state = now >= stop ? 'past' : now >= start ? 'live' : 'future';
    const p = timeParts(start);
    const e = timeParts(stop);
    slots.push({
      title: '回看节目',
      start,
      stop,
      state,
      url: state === 'future' ? null : buildCatchupUrl(channel, start, Math.min(stop, now)),
    });
  }
  return slots;
}

export async function getEpg(config, channelId) {
  const live = await getLiveData(config);
  if (!live.ok) throw new Error(live.error || '直播源不可用');
  const channel = live.channels.find((item) => item.id === channelId);
  if (!channel) throw new Error('频道不存在或直播源已刷新');

  const day = todayRange();
  const now = day.now;
  const epg = await loadEpg(live.epgUrls);
  let programs = [];
  let usedEpg = false;

  const raw = programsFor(epg, channel);
  if (raw.length) {
    programs = raw
      .filter((item) => item.stop > day.start && item.start < day.end)
      .map((item) => {
        const state = programState(item, now);
        return {
          title: item.title,
          start: item.start,
          stop: item.stop,
          state,
          url: state === 'future' ? null : buildCatchupUrl(channel, item.start, item.stop),
        };
      });
    usedEpg = programs.length >= 4;
  }

  if (!usedEpg) programs = buildHourlySlots(day, now, channel);

  return {
    channel: {
      id: channel.id,
      name: channel.name,
      logo: channel.logo,
      group: channel.group,
      url: channel.url,
    },
    date: day.key,
    now,
    epg: usedEpg,
    catchup: Boolean(channel.catchupSource),
    programs,
  };
}

export async function testSource(url) {
  const source = { name: '测试源', url: String(url || '').trim() };
  if (!source.url) throw new Error('请填写直播源地址');
  if (source.url !== 'builtin:demo' && !isHttpUrl(source.url)) throw new Error('仅支持 http/https 地址');
  const result = await loadSource(source);
  if (!result.ok) throw new Error(result.error || '无法解析直播源');
  return {
    ok: true,
    channels: result.parsed.channels.length,
    groups: result.parsed.categories.map((item) => `${item.name}(${item.channels.length})`).slice(0, 12),
    epgUrls: result.parsed.epgUrls,
    resolvedUrl: result.url,
  };
}
