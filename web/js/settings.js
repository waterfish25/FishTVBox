(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    config: null,
    info: null,
    shortsEnabled: true,
    toastTimer: null,
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function api(path, options = {}) {
    const res = await fetch(path, options);
    let data = null;
    try {
      data = await res.json();
    } catch {
      throw new Error(`服务返回异常（HTTP ${res.status}）`);
    }
    if (!res.ok || data.ok === false) throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
    return data;
  }

  function toast(message, bad = false) {
    const node = $('#toast');
    node.textContent = message;
    node.className = `toast${bad ? ' bad' : ''}`;
    node.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 2600);
  }

  function setSaveState(text, kind = '') {
    const node = $('#saveState');
    node.textContent = text;
    node.className = `save-state${kind ? ` ${kind}` : ''}`;
  }

  function addIptvRow(source = { name: '', url: '' }) {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `
      <input class="input" data-field="name" placeholder="名称，如：咪咕视频" value="${esc(source.name)}">
      <input class="input" data-field="url" placeholder="https://... 或 builtin:demo" value="${esc(source.url)}">
      <button class="remove-btn" type="button" title="删除">✕</button>`;
    row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
    $('#iptvSources').appendChild(row);
  }

  function addMovieRow(source = { name: '', api: '', enabled: true }) {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `
      <input class="input" data-field="name" placeholder="名称，如：主力采集站" value="${esc(source.name)}">
      <input class="input" data-field="api" placeholder="https://.../api.php/provide/vod" value="${esc(source.api)}">
      <button class="remove-btn" type="button" title="删除">✕</button>`;
    row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
    $('#movieSources').appendChild(row);
  }

  function rowValues(containerId, fields) {
    return $$(`#${containerId} .source-row`)
      .map((row) => {
        const item = {};
        for (const field of fields) {
          item[field === 'api' ? 'api' : field] = row.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
        }
        return item;
      })
      .filter((item) => item.url || item.api);
  }

  function renderAddressCards() {
    const info = state.info || {};
    const base =
      (info.addresses || []).find((address) => !address.includes('127.0.0.1')) ||
      info.addresses?.[0] ||
      location.origin;
    const cards = [
      { label: '电视端', url: base, hint: '电视浏览器全屏打开' },
      { label: '电脑配置', url: `${base}/settings`, hint: '当前页面' },
      { label: '手机遥控', url: `${base}/remote`, hint: '同一局域网' },
    ];
    const mount = $('#addressCards');
    mount.innerHTML = cards
      .map(
        (card) => `
        <div class="address-card">
          <h4>${esc(card.label)}</h4>
          <code>${esc(card.url)}</code>
          <button type="button" data-copy="${esc(card.url)}">复制地址</button>
        </div>`,
      )
      .join('');
    $$('[data-copy]', mount).forEach((button) => {
      button.addEventListener('click', () => copyText(button.dataset.copy));
    });
    $('#remoteHint').textContent = `${base}/remote`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('地址已复制');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        toast('地址已复制');
      } catch {
        toast('复制失败，请手动选择地址', true);
      }
      area.remove();
    }
  }

  function setShortsEnabled(enabled) {
    state.shortsEnabled = Boolean(enabled);
    $('#shortsToggle').classList.toggle('is-on', state.shortsEnabled);
    $('#shortsToggleLabel').textContent = state.shortsEnabled ? '已开启' : '已关闭';
  }

  function renderConfig(config) {
    $('#siteTitle').value = config.site.title;
    $('#siteSubtitle').value = config.site.subtitle || '';
    $('#iptvCache').value = config.iptv.cacheMinutes;
    $('#shortsCount').value = config.shorts.count;
    $('#shortsDuration').value = config.shorts.maxDuration;
    setShortsEnabled(config.shorts.enabled);

    $('#iptvSources').innerHTML = '';
    for (const source of config.iptv.sources) addIptvRow(source);
    $('#movieSources').innerHTML = '';
    for (const source of config.movies.sources) addMovieRow(source);

    document.title = `${config.site.title} · 电脑配置`;
  }

  async function load() {
    try {
      const [configData, info] = await Promise.all([api('/api/config'), api('/api/info').catch(() => null)]);
      state.config = configData.config;
      state.info = info;
      renderConfig(configData.config);
      renderAddressCards();
      $('#runtimeInfo').textContent = `版本 v${configData.version} · 端口 ${info?.port || '—'} · 数据目录 ${configData.dataDir}`;
      setSaveState('修改后点击保存');
    } catch (error) {
      setSaveState(`读取配置失败：${error.message}`, 'bad');
      toast(`读取配置失败：${error.message}`, true);
    }
  }

  function collectConfig() {
    const iptvSources = rowValues('iptvSources', ['name', 'url']).map((item, index) => ({
      name: item.name || `直播源 ${index + 1}`,
      url: item.url,
    }));
    const movieSources = rowValues('movieSources', ['name', 'api']).map((item, index) => ({
      name: item.name || `电影源 ${index + 1}`,
      api: item.api,
      enabled: true,
    }));

    return {
      site: {
        title: $('#siteTitle').value.trim() || 'FishTVBox',
        subtitle: $('#siteSubtitle').value.trim(),
      },
      iptv: {
        cacheMinutes: Number($('#iptvCache').value) || 10,
        sources: iptvSources,
      },
      movies: {
        sources: movieSources,
      },
      shorts: {
        enabled: state.shortsEnabled,
        count: Number($('#shortsCount').value) || 8,
        maxDuration: Number($('#shortsDuration').value) || 300,
      },
    };
  }

  async function save() {
    const button = $('#saveBtn');
    button.disabled = true;
    setSaveState('正在保存…');
    try {
      const data = await api('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectConfig()),
      });
      state.config = data.config;
      renderConfig(data.config);
      setSaveState('已保存，电视端将自动刷新', 'ok');
      toast('配置已保存');
    } catch (error) {
      setSaveState(`保存失败：${error.message}`, 'bad');
      toast(`保存失败：${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  async function testIptv() {
    const row = $('#iptvSources .source-row');
    const url = row?.querySelector('[data-field="url"]')?.value.trim();
    const result = $('#iptvTestResult');
    if (!url) {
      result.textContent = '请先填写直播源地址';
      result.className = 'test-result bad';
      return;
    }
    result.textContent = '测试中…';
    result.className = 'test-result';
    try {
      const data = await api(`/api/iptv/test?url=${encodeURIComponent(url)}`);
      result.textContent = `可用：${data.channels} 个频道${data.groups.length ? ` · ${data.groups.slice(0, 3).join(' / ')}` : ''}`;
      result.className = 'test-result ok';
    } catch (error) {
      result.textContent = `不可用：${error.message}`;
      result.className = 'test-result bad';
    }
  }

  async function testMovie() {
    const row = $('#movieSources .source-row');
    const apiUrl = row?.querySelector('[data-field="api"]')?.value.trim();
    const result = $('#movieTestResult');
    if (!apiUrl) {
      result.textContent = '请先填写电影接口地址';
      result.className = 'test-result bad';
      return;
    }
    result.textContent = '测试中…';
    result.className = 'test-result';
    try {
      const data = await api(`/api/movies/test?api=${encodeURIComponent(apiUrl)}`);
      result.textContent = `可用：本次 ${data.items} 条，共 ${data.total} 条`;
      result.className = 'test-result ok';
    } catch (error) {
      result.textContent = `不可用：${error.message}`;
      result.className = 'test-result bad';
    }
  }

  function bind() {
    $('#addIptvSource').addEventListener('click', () => addIptvRow());
    $('#addMovieSource').addEventListener('click', () => addMovieRow());
    $('#shortsToggle').addEventListener('click', () => setShortsEnabled(!state.shortsEnabled));
    $('#saveBtn').addEventListener('click', save);
    $('#testIptvBtn').addEventListener('click', testIptv);
    $('#testMovieBtn').addEventListener('click', testMovie);

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    });
  }

  bind();
  load();
})();
