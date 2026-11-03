import fs from 'node:fs';
import path from 'node:path';

export const VERSION = '1.0.0';
export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const PORT = Number(process.env.PORT || 8686);

export const DEFAULT_CONFIG = {
  site: {
    title: 'FishTVBox',
    subtitle: '家庭电视盒',
  },
  iptv: {
    cacheMinutes: 10,
    sources: [
      {
        name: '咪咕视频 · 主地址',
        url: 'https://raw.githubusercontent.com/develop202/migu_video/refs/heads/main/interface.txt',
      },
      {
        name: '咪咕视频 · GH 加速',
        url: 'https://gh-proxy.com/https://raw.githubusercontent.com/develop202/migu_video/refs/heads/main/interface.txt',
      },
      {
        name: '咪咕视频 · Pages',
        url: 'https://develop202.github.io/migu_video/interface.txt',
      },
      {
        name: '演示频道 · 公共测试流',
        url: 'builtin:demo',
      },
    ],
  },
  movies: {
    sources: [
      {
        name: '电影天堂采集站',
        api: 'https://caiji.dyttzyapi.com/api.php/provide/vod',
        enabled: true,
      },
    ],
  },
  shorts: {
    enabled: true,
    count: 8,
    maxDuration: 300,
  },
};

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

export function normalizeConfig(input = {}) {
  const cfg = structuredClone(DEFAULT_CONFIG);
  if (!input || typeof input !== 'object') return cfg;

  cfg.site.title = text(input.site?.title, cfg.site.title).slice(0, 24) || cfg.site.title;
  cfg.site.subtitle = text(input.site?.subtitle, cfg.site.subtitle).slice(0, 30);

  cfg.iptv.cacheMinutes = clampNumber(input.iptv?.cacheMinutes, cfg.iptv.cacheMinutes, 1, 120);

  if (Array.isArray(input.iptv?.sources)) {
    const sources = input.iptv.sources
      .map((item, index) => ({
        name: text(item?.name, `直播源 ${index + 1}`).slice(0, 40),
        url: text(item?.url),
      }))
      .filter((item) => item.url && (isHttpUrl(item.url) || item.url === 'builtin:demo'))
      .slice(0, 12);
    if (sources.length) cfg.iptv.sources = sources;
  }

  if (Array.isArray(input.movies?.sources)) {
    const sources = input.movies.sources
      .map((item, index) => ({
        name: text(item?.name, `电影源 ${index + 1}`).slice(0, 40),
        api: text(item?.api),
        enabled: item?.enabled !== false,
      }))
      .filter((item) => isHttpUrl(item.api))
      .slice(0, 8);
    cfg.movies.sources = sources;
  }

  cfg.shorts.enabled = input.shorts?.enabled !== false;
  cfg.shorts.count = clampNumber(input.shorts?.count, cfg.shorts.count, 4, 20);
  cfg.shorts.maxDuration = clampNumber(input.shorts?.maxDuration, cfg.shorts.maxDuration, 30, 3600);

  return cfg;
}

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadConfig() {
  ensureDataDir();
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
    }
  } catch (error) {
    console.warn('[config] 读取失败，使用默认配置:', error.message);
  }
  const config = normalizeConfig(DEFAULT_CONFIG);
  saveConfig(config);
  return config;
}

export function saveConfig(input) {
  ensureDataDir();
  const config = normalizeConfig(input);
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
  return config;
}
