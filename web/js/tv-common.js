/* FishTVBox · 页面共享工具（无框架） */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const NAV = '[data-nav]';
  let toastTimer = null;
  const gpPrev = {};

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function proxied(url) {
    return `/api/stream?url=${encodeURIComponent(url)}`;
  }

  function imageUrl(url) {
    return url ? `/api/img?url=${encodeURIComponent(url)}` : '';
  }

  function formatClock(date = new Date()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatTime(epoch) {
    if (!epoch) return '--:--';
    const d = new Date(epoch * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function toast(message, bad = false) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message;
    node.className = `toast${bad ? ' bad' : ''}`;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 3200);
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

  async function loadConfig() {
    try {
      const data = await api('/api/config');
      const config = data.config || {};
      const site = config.site || {};
      const titleNode = $('#siteTitle');
      const subNode = $('#siteSubtitle');
      if (titleNode) titleNode.textContent = site.title || 'FishTVBox';
      if (subNode) subNode.textContent = site.subtitle || '家庭电视盒';
      document.title = `${site.title || 'FishTVBox'} · 家庭电视盒`;
      return config;
    } catch {
      return null;
    }
  }

  async function loadInfo() {
    try {
      const data = await api('/api/info');
      const remoteNode = $('#remoteUrl');
      if (remoteNode) remoteNode.textContent = `${location.origin}/remote`;
      return data;
    } catch {
      const fallback = { addresses: [location.origin], remote: '/remote', settings: '/settings' };
      const remoteNode = $('#remoteUrl');
      if (remoteNode) remoteNode.textContent = `${location.origin}/remote`;
      return fallback;
    }
  }

  function updateClock() {
    const now = new Date();
    const text = formatClock(now);
    const clockNode = $('#clock');
    const idleNode = $('#idleClock');
    const dateNode = $('#dateText');
    if (clockNode) clockNode.textContent = text;
    if (idleNode) idleNode.textContent = text;
    if (dateNode) {
      dateNode.textContent = `${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 周${'日一二三四五六'[now.getDay()]}`;
    }
  }

  function setLiveStatus(node, text, kind = '') {
    if (!node) return;
    const span = $('span', node) || node;
    span.textContent = text;
    node.className = `status-pill${kind ? ` ${kind}` : ''}`;
  }

  function normalizeKey(key) {
    const aliases = {
      Select: 'Enter',
      OK: 'Enter',
      NumpadEnter: 'Enter',
      GoBack: 'Escape',
      BrowserBack: 'Escape',
      Back: 'Escape',
      back: 'Escape',
      BrowserHome: 'Home',
      Home: 'Home',
      VolumeUp: 'AudioVolumeUp',
      VolumeDown: 'AudioVolumeDown',
      VolumeMute: 'AudioVolumeMute',
      MediaVolumeMute: 'AudioVolumeMute',
      MediaStop: 'MediaStop',
    };
    return aliases[key] || key;
  }

  function createNav(getScope) {
    function scope() {
      const node = getScope ? getScope() : document;
      return node || document;
    }

    function focusables() {
      return $$(NAV, scope()).filter(
        (node) =>
          node.offsetParent !== null &&
          !node.disabled &&
          !node.closest('[hidden]') &&
          getComputedStyle(node).visibility !== 'hidden',
      );
    }

    function focusNode(node) {
      if (!node) return;
      node.focus({ preventScroll: true });
      if (typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }

    function moveFocus(direction) {
      const items = focusables();
      if (!items.length) return;
      const current = document.activeElement;
      if (!items.includes(current)) {
        focusNode(items[0]);
        return;
      }

      const currentRect = current.getBoundingClientRect();
      const cx = currentRect.left + currentRect.width / 2;
      const cy = currentRect.top + currentRect.height / 2;
      let best = null;
      let bestScore = Infinity;

      for (const node of items) {
        if (node === current) continue;
        const rect = node.getBoundingClientRect();
        const nx = rect.left + rect.width / 2;
        const ny = rect.top + rect.height / 2;
        const dx = nx - cx;
        const dy = ny - cy;
        let primary;
        let cross;
        if (direction === 'right') {
          primary = dx;
          cross = Math.abs(dy);
        } else if (direction === 'left') {
          primary = -dx;
          cross = Math.abs(dy);
        } else if (direction === 'down') {
          primary = dy;
          cross = Math.abs(dx);
        } else {
          primary = -dy;
          cross = Math.abs(dx);
        }
        if (primary <= 3) continue;
        const score = primary + cross * 2.15;
        if (score < bestScore) {
          bestScore = score;
          best = node;
        }
      }
      if (best) focusNode(best);
    }

    function focusFirst(selector = NAV, root = scope()) {
      const node = $(selector, root);
      if (node) focusNode(node);
    }

    return { focusables, focusNode, moveFocus, focusFirst };
  }

  function bindKeys(handler) {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const handled = handler(event.key, event);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  function connectEvents(handlers = {}) {
    if (!window.EventSource) return null;
    const source = new EventSource('/api/events');
    const conn = $('#connState');
    const qrConn = $('#qrConn');
    source.addEventListener('open', () => {
      if (conn) {
        conn.classList.remove('bad');
        conn.textContent = '遥控就绪';
      }
      if (qrConn) {
        qrConn.classList.remove('bad');
        qrConn.innerHTML = '<i></i>遥控服务就绪';
      }
      handlers.onOpen?.();
    });
    source.addEventListener('error', () => {
      if (conn) {
        conn.classList.add('bad');
        conn.textContent = '遥控重连中';
      }
      if (qrConn) {
        qrConn.classList.add('bad');
        qrConn.innerHTML = '<i></i>遥控重连中';
      }
      handlers.onError?.();
    });
    source.addEventListener('remote', (event) => {
      try {
        handlers.onRemote?.(JSON.parse(event.data));
      } catch {
        // 忽略无效负载
      }
    });
    source.addEventListener('config', () => handlers.onConfig?.());
    return source;
  }

  function startGamepadPolling(handler) {
    if (!navigator.getGamepads) return;
    setInterval(() => {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (!pad) continue;
        const id = pad.index;
        const prev = gpPrev[id] || {};
        const now = {};
        const buttons = pad.buttons.map((button) => button.pressed);
        const map = {
          0: 'Enter',
          1: 'Escape',
          12: 'ArrowUp',
          13: 'ArrowDown',
          14: 'ArrowLeft',
          15: 'ArrowRight',
        };
        for (const [index, key] of Object.entries(map)) {
          const pressed = buttons[Number(index)];
          now[index] = pressed;
          if (pressed && !prev[index]) handler(key);
        }
        const axisX = pad.axes[0] || 0;
        const axisY = pad.axes[1] || 0;
        const directions = [
          [axisX < -0.55, 'ArrowLeft'],
          [axisX > 0.55, 'ArrowRight'],
          [axisY < -0.55, 'ArrowUp'],
          [axisY > 0.55, 'ArrowDown'],
        ];
        for (const [active, key] of directions) {
          if (active && !prev[key]) handler(key);
          now[key] = active;
        }
        gpPrev[id] = now;
      }
    }, 110);
  }

  function go(path) {
    location.assign(path);
  }

  window.TV = {
    $,
    $$,
    NAV,
    esc,
    proxied,
    imageUrl,
    formatClock,
    formatTime,
    formatDuration,
    toast,
    api,
    loadConfig,
    loadInfo,
    updateClock,
    setLiveStatus,
    normalizeKey,
    createNav,
    bindKeys,
    connectEvents,
    startGamepadPolling,
    go,
  };
})();
