import { fetchText, isHttpUrl, stripTags } from './lib/http.js';

const listCache = new Map();
const LIST_TTL = 5 * 60 * 1000;

function normalizeApi(api) {
  const clean = String(api || '').trim();
  if (!isHttpUrl(clean)) throw new Error('电影源地址必须是 http/https');
  return clean.replace(/#.*$/, '');
}

function joinQuery(api, params) {
  const base = normalizeApi(api);
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function cmsJson(api, params) {
  const url = joinQuery(api, params);
  const body = await fetchText(url, {
    timeout: 12_000,
    headers: { Accept: 'application/json,text/plain,*/*' },
  });
  const clean = body.replace(/^\uFEFF/, '').trim();
  if (!clean || clean.startsWith('<')) throw new Error('接口返回了网页而不是 JSON，请检查 CMS 地址');
  let data;
  try {
    data = JSON.parse(clean);
  } catch {
    throw new Error('电影源返回格式错误');
  }
  if (data.code !== 1 && data.code !== 200) throw new Error(data.msg || '电影源请求失败');
  return data;
}

function normalizeItem(item) {
  return {
    id: String(item.vod_id ?? item.id ?? ''),
    name: item.vod_name || item.name || '未命名',
    pic: item.vod_pic || item.pic || '',
    remarks: item.vod_remarks || '',
    year: item.vod_year || '',
    type: item.type_name || item.vod_class || '',
    area: item.vod_area || '',
    actor: item.vod_actor || '',
    director: item.vod_director || '',
    updatedAt: item.vod_time || '',
  };
}

function parsePlayGroups(item) {
  const froms = String(item.vod_play_from || '').split('$$$');
  const urls = String(item.vod_play_url || '').split('$$$');
  const groups = [];

  urls.forEach((raw, index) => {
    const episodes = raw
      .split('#')
      .map((segment, epIndex) => {
        const trimmed = segment.trim();
        if (!trimmed) return null;
        const dollar = trimmed.indexOf('$');
        const name = dollar > -1 ? trimmed.slice(0, dollar).trim() : `第${epIndex + 1}集`;
        const url = dollar > -1 ? trimmed.slice(dollar + 1).trim() : trimmed;
        if (!isHttpUrl(url)) return null;
        return { name: name || `第${epIndex + 1}集`, url };
      })
      .filter(Boolean);

    if (episodes.length) {
      groups.push({
        name: froms[index] || `线路 ${index + 1}`,
        episodes,
        hls: episodes.filter((episode) => /\.m3u8/i.test(episode.url)).length,
      });
    }
  });

  groups.sort((a, b) => b.hls - a.hls);
  return groups;
}

function sourceList(config) {
  return (config.movies.sources || [])
    .map((source, index) => ({ ...source, index }))
    .filter((source) => source.enabled !== false && isHttpUrl(source.api));
}

export async function listMovies(config, { wd = '', pg = 1, source = '' } = {}) {
  const sources = sourceList(config);
  if (!sources.length) {
    return {
      ok: true,
      items: [],
      total: 0,
      source: null,
      needSource: true,
      message: '尚未配置电影源，请在电脑打开 /settings 添加苹果 CMS 接口',
    };
  }

  const ordered = source === '' ? sources : [
    ...sources.filter((item) => String(item.index) === String(source)),
    ...sources.filter((item) => String(item.index) !== String(source)),
  ];

  const cacheKey = JSON.stringify([wd, pg, ordered.map((item) => item.api)]);
  const cached = listCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LIST_TTL) return cached.data;

  let lastError = '';
  for (const item of ordered) {
    try {
      const data = await cmsJson(item.api, { ac: 'videolist', pg, wd: String(wd).slice(0, 60) });
      const result = {
        ok: true,
        items: (data.list || []).map(normalizeItem).filter((movie) => movie.id),
        total: Number(data.total) || 0,
        page: Number(data.page) || pg,
        pagecount: Number(data.pagecount) || 1,
        source: { index: item.index, name: item.name, api: item.api },
        classes: (data.class || []).map((row) => ({ id: row.type_id, name: row.type_name })).slice(0, 20),
      };
      listCache.set(cacheKey, { at: Date.now(), data: result });
      if (listCache.size > 60) listCache.delete(listCache.keys().next().value);
      return result;
    } catch (error) {
      lastError = `${item.name}: ${error.message}`;
    }
  }

  return { ok: false, items: [], total: 0, error: lastError || '所有电影源均不可用' };
}

export async function getMovieDetail(config, { id, source = '' }) {
  if (!id) throw new Error('缺少影片 ID');
  const sources = sourceList(config);
  if (!sources.length) throw new Error('尚未配置电影源');

  const ordered = source === '' ? sources : [
    ...sources.filter((item) => String(item.index) === String(source)),
    ...sources.filter((item) => String(item.index) !== String(source)),
  ];

  let lastError = '';
  for (const item of ordered) {
    try {
      const data = await cmsJson(item.api, { ac: 'detail', ids: id });
      const itemData = (data.list || [])[0];
      if (!itemData) throw new Error('没有找到影片');
      const groups = parsePlayGroups(itemData);
      return {
        ok: true,
        source: { index: item.index, name: item.name },
        movie: {
          ...normalizeItem(itemData),
          content: stripTags(itemData.vod_content || itemData.vod_blurb || ''),
          groups,
          episodes: groups[0]?.episodes || [],
        },
      };
    } catch (error) {
      lastError = `${item.name}: ${error.message}`;
    }
  }
  throw new Error(lastError || '影片详情获取失败');
}

export async function testMovieSource(api) {
  const data = await cmsJson(api, { ac: 'videolist', pg: 1 });
  return {
    ok: true,
    items: (data.list || []).length,
    total: Number(data.total) || 0,
    pagecount: Number(data.pagecount) || 1,
  };
}

export function clearMovieCache() {
  listCache.clear();
}
