/* FishTVBox · 电视回放 */
(() => {
  'use strict';

  const {
    $, $$, NAV, esc, api, toast, imageUrl, formatTime, normalizeKey,
    loadConfig, createNav, bindKeys, connectEvents, startGamepadPolling, go,
  } = window.TV;

  const el = {
    channels: $('#catchupChannels'),
    catchupDate: $('#catchupDate'),
    catchupHint: $('#catchupHint'),
    catchupList: $('#catchupList'),
    playerModal: $('#playerModal'),
    modalTitle: $('#modalTitle'),
    modalSub: $('#modalSub'),
    modalVideo: $('#modalVideo'),
    modalClose: $('#modalClose'),
  };

  const state = {
    live: null,
    currentChannel: null,
    epg: null,
    activeProgram: -1,
    playerOpen: false,
    lastFocus: null,
    modalHls: null,
  };

  const HlsCtor = window.Hls;

  const nav = createNav(() => (state.playerOpen ? el.playerModal : document));

  function savedChannelId() {
    try {
      return sessionStorage.getItem('fishtv:channel') || '';
    } catch {
      return '';
    }
  }

  function rememberChannel(channel) {
    if (!channel) return;
    try {
      sessionStorage.setItem('fishtv:channel', channel.id);
    } catch {
      // 忽略隐私模式下的存储失败
    }
  }

  async function loadChannels() {
    el.channels.innerHTML = '<div class="skeleton" style="height:58px"></div>'.repeat(4);
    try {
      const data = await api('/api/iptv/channels');
      state.live = data;
      if (!data.channels.length) {
        el.channels.innerHTML = '';
        el.catchupHint.textContent = data.error || '直播源暂无频道';
        return;
      }
      renderChannels();
      const keep = savedChannelId() && data.channels.find((channel) => channel.id === savedChannelId());
      selectChannel(keep || data.channels[0]);
    } catch (error) {
      state.live = { channels: [] };
      el.channels.innerHTML = '';
      el.catchupHint.textContent = `直播源请求失败：${error.message}`;
    }
  }

  function renderChannels() {
    el.channels.innerHTML = '';
    for (const channel of state.live.channels) {
      const button = document.createElement('button');
      button.className = `quick-channel${state.currentChannel?.id === channel.id ? ' is-active' : ''}`;
      button.dataset.nav = '';
      button.dataset.channelId = channel.id;
      button.setAttribute('aria-label', channel.name);
      const logo = channel.logo
        ? `<img src="${esc(imageUrl(channel.logo))}" alt="" loading="lazy">`
        : esc(channel.name.slice(0, 2));
      button.innerHTML = `<span class="quick-logo">${logo}</span><span class="quick-name">${esc(channel.name)}</span>`;
      const img = button.querySelector('img');
      if (img) img.addEventListener('error', () => img.remove());
      button.addEventListener('click', () => selectChannel(channel));
      el.channels.appendChild(button);
    }
  }

  function selectChannel(channel) {
    if (!channel) return;
    state.currentChannel = channel;
    rememberChannel(channel);
    $$('.quick-channel', el.channels).forEach((node) => {
      node.classList.toggle('is-active', node.dataset.channelId === channel.id);
    });
    loadEpg(channel);
  }

  function clearList(hint) {
    state.epg = null;
    state.activeProgram = -1;
    el.catchupList.innerHTML = '';
    el.catchupHint.textContent = hint || '选择频道后显示今日节目单';
    el.catchupDate.textContent = '';
  }

  async function loadEpg(channel) {
    clearList('正在加载今日节目单…');
    try {
      const data = await api(`/api/iptv/epg?id=${encodeURIComponent(channel.id)}`);
      if (!state.currentChannel || state.currentChannel.id !== channel.id) return;
      state.epg = data;
      renderCatchup(data);
    } catch (error) {
      if (state.currentChannel?.id !== channel.id) return;
      clearList(`节目单加载失败：${error.message}`);
    }
  }

  function renderCatchup(data) {
    el.catchupDate.textContent = data.date || '';
    el.catchupHint.textContent = data.catchup
      ? data.epg
        ? '今日节目单 · 可回看'
        : '今日时段回看（源未提供节目单）'
      : '当前频道未提供回看地址';

    el.catchupList.innerHTML = '';
    if (!data.programs.length) {
      el.catchupList.innerHTML = '<div class="catchup-empty">今天还没有可回看的节目</div>';
      return;
    }

    data.programs.forEach((program, index) => {
      const button = document.createElement('button');
      button.className = `catchup-item${program.state === 'live' ? ' is-live' : ''}${
        program.state === 'future' ? ' is-future' : ''
      }${state.activeProgram === index ? ' is-active' : ''}`;
      button.dataset.programIndex = index;
      if (program.state !== 'future') button.dataset.nav = '';
      const time = `${formatTime(program.start)} - ${formatTime(program.stop)}`;
      button.innerHTML = `<span class="ci-time">${esc(time)}</span><span class="ci-title">${esc(program.title)}</span>`;
      button.addEventListener('click', () => playCatchup(program, index));
      el.catchupList.appendChild(button);
    });
  }

  /* ---------------- 播放器 ---------------- */

  function destroyHls() {
    if (!state.modalHls) return;
    try {
      state.modalHls.destroy();
    } catch {
      // 忽略销毁异常
    }
    state.modalHls = null;
  }

  async function safePlay(video) {
    try {
      await video.play();
    } catch {
      video.muted = true;
      try {
        await video.play();
        toast('浏览器限制了自动播放，已静音播放，可按静音键恢复声音');
      } catch {
        // 由用户再次确认播放
      }
    }
  }

  function loadMedia(video, rawUrl) {
    destroyHls();
    const url = `/api/stream?url=${encodeURIComponent(rawUrl)}`;
    const cleanPath = rawUrl.split('?')[0].toLowerCase();
    const looksHls = cleanPath.endsWith('.m3u8') || rawUrl.includes('.m3u8');

    if (HlsCtor && HlsCtor.isSupported() && looksHls) {
      let retries = 0;
      const hls = new HlsCtor({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        backBufferLength: 60,
        manifestLoadingTimeOut: 15000,
        levelLoadingTimeOut: 15000,
        fragLoadingTimeOut: 25000,
      });
      state.modalHls = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => safePlay(video));
      hls.on(HlsCtor.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && retries < 2) {
          retries += 1;
          hls.startLoad();
          return;
        }
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        toast(`回看播放失败：${data.details || '媒体错误'}`, true);
        destroyHls();
      });
      return;
    }

    video.src = url;
    video.load();
    safePlay(video);
  }

  function openPlayerModal({ title, sub, url }) {
    if (!state.playerOpen) state.lastFocus = document.activeElement;
    state.playerOpen = true;
    el.playerModal.hidden = false;
    el.modalTitle.textContent = title || '回看播放';
    el.modalSub.textContent = sub || '';
    loadMedia(el.modalVideo, url);
    requestAnimationFrame(() => nav.focusNode(el.modalClose));
  }

  function closePlayerModal() {
    if (!state.playerOpen) return;
    destroyHls();
    el.modalVideo.pause();
    el.modalVideo.removeAttribute('src');
    el.modalVideo.load();
    el.playerModal.hidden = true;
    state.playerOpen = false;
    const target = state.lastFocus;
    if (target && target.isConnected) nav.focusNode(target);
    else nav.focusFirst();
  }

  function playCatchup(program, index) {
    if (!program.url) {
      toast(program.state === 'future' ? '该节目还没开始' : '该直播源未提供回看地址', true);
      return;
    }
    if (!state.currentChannel) return;
    state.activeProgram = index;
    $$('.catchup-item').forEach((node, i) => {
      node.classList.toggle('is-active', i === index);
    });
    openPlayerModal({
      title: `${state.currentChannel.name} · 回看`,
      sub: `${formatTime(program.start)} - ${formatTime(program.stop)} · ${program.title}`,
      url: program.url,
    });
  }

  function togglePlayback() {
    if (!state.playerOpen) return;
    if (el.modalVideo.paused) safePlay(el.modalVideo);
    else el.modalVideo.pause();
  }

  /* ---------------- 交互 ---------------- */

  const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function goBack() {
    if (state.playerOpen) {
      closePlayerModal();
      return;
    }
    go('/');
  }

  function stepChannel(delta) {
    const list = state.live?.channels || [];
    if (!list.length) return;
    const index = Math.max(0, list.findIndex((channel) => channel.id === state.currentChannel?.id));
    selectChannel(list[(index + delta + list.length) % list.length]);
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
        togglePlayback();
        return true;
      }
      if (key === 'AudioVolumeUp') {
        el.modalVideo.muted = false;
        el.modalVideo.volume = Math.min(1, el.modalVideo.volume + 0.1);
        return true;
      }
      if (key === 'AudioVolumeDown') {
        el.modalVideo.muted = false;
        el.modalVideo.volume = Math.max(0, el.modalVideo.volume - 0.1);
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
    if (key === 'MediaPlayPause' || key === 'MediaPlay' || key === 'MediaPause') {
      togglePlayback();
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
        go('/');
        break;
      case 'movies':
        go('/movies');
        break;
      case 'shorts':
        go('/bili');
        break;
      case 'apps':
        go('/apps');
        break;
      case 'search':
      case 'text':
        go('/movies?search=1');
        break;
      case 'channelUp':
      case 'prev':
        stepChannel(-1);
        break;
      case 'channelDown':
      case 'next':
        stepChannel(1);
        break;
      case 'playpause':
        togglePlayback();
        break;
      case 'back':
        goBack();
        break;
      case 'fullscreen':
        if (state.playerOpen) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
        break;
      default:
        break;
    }
  }

  function bindStaticEvents() {
    $('#btnCatchupHome').addEventListener('click', () => go('/'));
    el.modalClose.addEventListener('click', closePlayerModal);
    el.modalVideo.addEventListener('volumechange', () => {});
    bindKeys(handleKey);
  }

  async function boot() {
    bindStaticEvents();
    connectEvents({
      onRemote: handleRemote,
      onConfig: () => {
        toast('配置已更新，正在刷新…');
        loadChannels();
      },
    });
    startGamepadPolling(handleKey);
    await loadConfig();
    await loadChannels();
    const first = $('.quick-channel', el.channels);
    if (first) nav.focusNode(first);
  }

  boot();
})();
