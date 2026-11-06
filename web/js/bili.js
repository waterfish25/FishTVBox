/* FishTVBox · 哔哩哔哩热门 */
(() => {
  'use strict';

  const {
    $, $$, NAV, esc, api, toast, imageUrl, formatDuration, normalizeKey,
    loadConfig, createNav, bindKeys, connectEvents, startGamepadPolling, go,
  } = window.TV;

  const el = {
    biliView: $('#biliView'),
    shortGrid: $('#shortGrid'),
    shortEmpty: $('#shortEmpty'),
    shortEmptyText: $('#shortEmptyText'),
    playerModal: $('#playerModal'),
    modalTitle: $('#modalTitle'),
    modalSub: $('#modalSub'),
    modalIframe: $('#modalIframe'),
    modalClose: $('#modalClose'),
  };

  const state = {
    playerOpen: false,
    lastFocus: null,
  };

  const nav = createNav(() => (state.playerOpen ? el.playerModal : el.biliView));

  function renderSkeletons(container, count) {
    container.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const div = document.createElement('div');
      div.className = 'skeleton short';
      container.appendChild(div);
    }
    container.classList.add('is-loading');
  }

  async function loadShorts(refresh = false) {
    renderSkeletons(el.shortGrid, 4);
    el.shortEmpty.hidden = true;
    try {
      const data = await api(`/api/shorts${refresh ? '?refresh=1' : ''}`);
      el.shortGrid.classList.remove('is-loading');
      if (!data.enabled) {
        el.shortGrid.innerHTML = '';
        el.shortEmpty.hidden = false;
        el.shortEmptyText.textContent = 'B 站短视频已在配置中关闭。';
        return;
      }
      renderShorts(data.items || []);
    } catch (error) {
      el.shortGrid.classList.remove('is-loading');
      el.shortGrid.innerHTML = '';
      el.shortEmpty.hidden = false;
      el.shortEmptyText.textContent = `B 站接口暂时不可用：${error.message}`;
    }
  }

  function renderShorts(items) {
    el.shortGrid.innerHTML = '';
    if (!items.length) {
      el.shortEmpty.hidden = false;
      el.shortEmptyText.textContent = '暂时没有取到短视频，稍后换一批试试。';
      return;
    }
    el.shortEmpty.hidden = true;
    for (const item of items) {
      const button = document.createElement('button');
      button.className = 'short-card';
      button.dataset.nav = '';
      button.dataset.bvid = item.bvid;
      button.setAttribute('aria-label', item.title);
      button.innerHTML = `
        <span class="short-thumb">
          ${item.cover ? `<img src="${esc(imageUrl(item.cover))}" alt="" loading="lazy">` : ''}
          <span class="short-play">▶</span>
          <span class="short-duration">${esc(formatDuration(item.duration))}</span>
        </span>
        <span class="short-meta">
          <span class="short-title">${esc(item.title)}</span>
          <span class="short-owner">${esc(item.owner || 'B站')}</span>
        </span>`;
      const img = button.querySelector('img');
      if (img) img.addEventListener('error', () => img.classList.add('is-error'));
      button.addEventListener('click', () => openBiliPlayer(item));
      el.shortGrid.appendChild(button);
    }
  }

  function openBiliPlayer(item) {
    openPlayerModal({
      title: item.title,
      sub: `${item.owner || 'B站'} · ${formatDuration(item.duration)}`,
      iframe: item.embed,
    });
  }

  function openPlayerModal({ title, sub, iframe }) {
    if (!state.playerOpen) state.lastFocus = document.activeElement;
    state.playerOpen = true;
    el.playerModal.hidden = false;
    el.modalTitle.textContent = title || '播放中';
    el.modalSub.textContent = sub || '';
    el.modalIframe.hidden = false;
    el.modalIframe.innerHTML = `<iframe src="${esc(iframe)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    requestAnimationFrame(() => nav.focusNode(el.modalClose));
  }

  function closePlayerModal() {
    if (!state.playerOpen) return;
    el.modalIframe.hidden = true;
    el.modalIframe.innerHTML = '';
    el.playerModal.hidden = true;
    state.playerOpen = false;
    const target = state.lastFocus;
    if (target && target.isConnected && target !== document.body) nav.focusNode(target);
    else nav.focusFirst();
  }

  const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function goBack() {
    if (state.playerOpen) {
      closePlayerModal();
      return;
    }
    go('/');
  }

  function handleKey(rawKey) {
    const key = normalizeKey(rawKey);
    const active = document.activeElement;

    if (key === 'Escape' || key === 'Back') {
      goBack();
      return true;
    }
    if (key === 'Home') {
      go('/');
      return true;
    }
    if (state.playerOpen) {
      if (key === 'Enter' || key === ' ') {
        closePlayerModal();
        return true;
      }
      return false;
    }
    if (dirMap[key]) {
      nav.moveFocus(dirMap[key]);
      return true;
    }
    if (key === 'Enter' || key === ' ') {
      if (active && active.matches(NAV)) active.click();
      else nav.focusFirst();
      return true;
    }
    return false;
  }

  function handleRemote(command) {
    if (!command || typeof command !== 'object') return;
    if (command.key) {
      handleKey(command.key);
      return;
    }
    switch (command.action) {
      case 'home':
      case 'power':
      case 'live':
      case 'menu':
        go('/');
        break;
      case 'movies':
        go('/movies');
        break;
      case 'apps':
        go('/apps');
        break;
      case 'reload':
        loadShorts(true);
        break;
      case 'back':
        goBack();
        break;
      default:
        break;
    }
  }

  function bindStaticEvents() {
    $('#btnBiliRefresh').addEventListener('click', () => loadShorts(true));
    $('#btnBiliHome').addEventListener('click', () => go('/'));
    $('#btnShortsEmptyRefresh').addEventListener('click', () => loadShorts(true));
    el.modalClose.addEventListener('click', closePlayerModal);
    bindKeys(handleKey);
  }

  async function boot() {
    bindStaticEvents();
    connectEvents({
      onRemote: handleRemote,
      onConfig: () => {
        toast('配置已更新，正在刷新…');
        loadShorts(true);
      },
    });
    startGamepadPolling(handleKey);
    await loadConfig();
    await loadShorts();
    const first = $('.short-card', el.shortGrid);
    nav.focusNode(first || $('#btnBiliHome'));
  }

  boot();
})();
