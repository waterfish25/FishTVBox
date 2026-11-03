export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export async function request(url, options = {}) {
  const target = String(url || '').trim();
  if (!isHttpUrl(target)) throw new Error('仅支持 http/https 地址');

  const { timeout = 15000, headers = {}, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(target, {
      redirect: 'follow',
      ...rest,
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
        ...headers,
      },
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`请求超时（${Math.round(timeout / 1000)}s）`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, options = {}) {
  const res = await request(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

export async function fetchJson(url, options = {}) {
  const body = await fetchText(url, options);
  const clean = body.replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('接口返回的不是 JSON');
  }
}

/** 解析 #EXTINF 行中的 key="value" / key=value 属性 */
export function parseAttrs(line) {
  const attrs = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

/** 找到引号外的第一个逗号，用于拆 #EXTINF 的频道名 */
export function splitExtInf(line) {
  let quoted = false;
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === quote) quoted = false;
    } else if (char === '"' || char === "'") {
      quoted = true;
      quote = char;
    } else if (char === ',') {
      return [line.slice(0, i), line.slice(i + 1).trim()];
    }
  }
  return [line, ''];
}

export function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

export function stripTags(value) {
  return decodeXml(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
}

/** 对常见 GitHub 原始地址追加加速镜像 */
export function mirrorCandidates(url) {
  const list = [];
  if (/raw\.githubusercontent\.com/i.test(url)) {
    list.push(`https://gh-proxy.com/${url}`);
    list.push(url.replace('raw.githubusercontent.com', 'hk.gh-proxy.org/raw.githubusercontent.com'));
    list.push(url.replace('raw.githubusercontent.com', 'raw.githubusercontents.com'));
  }
  return list;
}

export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-_·:：|/\\()[\]（）【】.,，。'"]/g, '')
    .trim();
}
