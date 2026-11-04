/* FishTVBox TV UI */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const el = {
    siteTitle: $('#siteTitle'),
    siteSubtitle: $('#siteSubtitle'),
    liveStatus: $('#liveStatus'),
    clock: $('#clock'),
    dateText: $('#dateText'),
    idleClock: $('#idleClock'),
    stage: $('#stage'),
    stageIdle: $('#stageIdle'),
    stageTopline: $('#stageTopline'),
    stageControls: $('#stageControls'),
    stageError: $('#stageError'),
    nowBadge: $('#nowBadge'),
    nowTitle: $('#nowTitle'),
    nowProgram: $('#nowProgram'),
    tvVideo: $('#tvVideo'),
    playerState: $('#playerState'),
    btnPlay: $('#btnPlay'),
    btnMute: $('#btnMute'),
    btnFullscreen: $('#btnFullscreen'),
    iptvSourceName: $('#iptvSourceName'),
    iptvAddress: $('#iptvAddress'),
    iptvEmpty: $('#iptvEmpty'),
    iptvEmptyText: $('#iptvEmptyText'),
    catchupDate: $('#catchupDate'),
    catchupHint: $('#catchupHint'),
    catchupList: $('#catchupList'),
    homeChannelGrid: $('#homeChannelGrid'),
    catchupView: $('#catchupView'),
    catchupEntry: $('#catchupEntry'),
    videoEntry: $('#videoEntry'),
    btnCatchupHome: $('#btnCatchupHome'),
    categories: $('#categories'),
    channelGrid: $('#homeChannelGrid'),
    movieGrid: $('#movieGrid'),
    movieEmpty: $('#movieEmpty'),
    movieEmptyText: $('#movieEmptyText'),
    movieSourceName: $('#movieSourceName'),
    shortGrid: $('#shortGrid'),
    shortEmpty: $('#shortEmpty'),
    shortEmptyText: $('#shortEmptyText'),
    remoteUrl: $('#remoteUrl'),
    sourceFooter: $('#sourceFooter'),
    connState: $('#connState'),
    qrCode: $('#qrCode'),
    qrUrl: $('#qrUrl'),
    qrConn: $('#qrConn'),
    liveFullscreen: $('#liveFullscreen'),
    fsVideo: $('#fsVideo'),
    fsBadge: $('#fsBadge'),
    fsTitle: $('#fsTitle'),
    fsProgram: $('#fsProgram'),
    fsClock: $('#fsClock'),
    fsOsd: $('#fsOsd'),
    fsHints: $('#fsHints'),
    channelSwitcher: $('#channelSwitcher'),
    channelSwitcherGrid: $('#channelSwitcherGrid'),
    csMeta: $('#csMeta'),
    biliView: $('#biliView'),
    biliAppTile: $('#biliAppTile'),
    btnBiliRefresh: $('#btnBiliRefresh'),
    btnBiliHome: $('#btnBiliHome'),
    btnShortsEmptyRefresh: $('#btnShortsEmptyRefresh'),
    movieEntry: $('#movieEntry'),
    appsEntry: $('#appsEntry'),
    remoteEntry: $('#remoteEntry'),
    moviesView: $('#moviesView'),
    appsView: $('#appsView'),
    remoteView: $('#remoteView'),
    btnMoviesHome: $('#btnMoviesHome'),
    btnAppsHome: $('#btnAppsHome'),
    btnRemoteHome: $('#btnRemoteHome'),
    overlay: $('#overlay'),
    overlayBody: $('#overlayBody'),
    overlayClose: $('#overlayClose'),
    overlayBackdrop: $('#overlayBackdrop'),
    overlayCard: $('#overlayCard'),
    playerModal: $('#playerModal'),
    modalTitle: $('#modalTitle'),
    modalSub: $('#modalSub'),
    modalVideo: $('#modalVideo'),
    modalIframe: $('#modalIframe'),
    modalClose: $('#modalClose'),
    toast: $('#toast'),
  };

  const state = {
    config: null,
    info: null,
    live: null,
    category: 'all',
    currentChannel: null,
    epg: null,
    movies: [],
    movieSource: null,
    playerOpen: false,
    overlayOpen: false,
    lastFocus: null,
    tvHls: null,
    modalHls: null,
    fsHls: null,
    fullscreenOpen: false,
    channelSwitchOpen: false,
    biliOpen: false,
    moviesOpen: false,
    appsOpen: false,
    remoteOpen: false,
    catchupOpen: false,
    digitBuffer: '',
    digitTimer: null,
    osdTimer: null,
    dimTimer: null,
    toastTimer: null,
    lastSearch: '',
    initialFocus: false,
    activeProgram: -1,
    events: null,
    gpPrev: {},
  };

  const HlsCtor = window.Hls;

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
    el.toast.textContent = message;
    el.toast.className = `toast${bad ? ' bad' : ''}`;
    el.toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      el.toast.hidden = true;
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

  function setLiveStatus(text, kind = '') {
    const span = el.liveStatus.querySelector('span') || el.liveStatus;
    span.textContent = text;
    el.liveStatus.className = `status-pill${kind ? ` ${kind}` : ''}`;
  }

  function updateClock() {
    const now = new Date();
    const text = formatClock(now);
    el.clock.textContent = text;
    el.idleClock.textContent = text;
    if (el.dateText) {
      el.dateText.textContent = `${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 周${'日一二三四五六'[now.getDay()]}`;
    }
  }

  /* ---------------- navigation ---------------- */

  const NAV = '[data-nav]';

  function navScope() {
    if (state.playerOpen) return el.playerModal;
    if (state.fullscreenOpen) return el.liveFullscreen;
    if (state.biliOpen) return el.biliView;
    if (state.overlayOpen) return el.overlayCard;
    if (state.catchupOpen) return el.catchupView;
    if (state.appsOpen) return el.appsView;
    if (state.moviesOpen) return el.moviesView;
    if (state.remoteOpen) return el.remoteView;
    return document;
  }

  function focusables() {
    return $$(NAV, navScope()).filter(
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
    let current = document.activeElement;
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

  function focusFirst(selector, root = navScope()) {
    const node = $(selector, root);
    if (node) focusNode(node);
  }

  function focusFirstChannel() {
    const node = $('.quick-channel', el.homeChannelGrid) || el.stage;
    if (node) focusNode(node);
  }

  /* ---------------- data loading ---------------- */

  async function loadConfig() {
    try {
      const data = await api('/api/config');
      state.config = data.config;
      el.siteTitle.textContent = data.config.site.title;
      el.siteSubtitle.textContent = data.config.site.subtitle || '家庭电视盒';
      document.title = `${data.config.site.title} · 家庭电视盒`;
    } catch {
      // 配置不可用时仍可展示内容
    }
  }

  async function loadInfo() {
    try {
      const data = await api('/api/info');
      state.info = data;
      const origin = location.origin;
      el.remoteUrl.textContent = `${origin}/remote`;
    } catch {
      state.info = { addresses: [location.origin], remote: '/remote', settings: '/settings' };
      el.remoteUrl.textContent = `${location.origin}/remote`;
    }
  }

  async function loadChannels(refresh = false) {
    setLiveStatus('直播源加载中');
    el.iptvEmpty.hidden = true;
    if (!state.live) {
      el.homeChannelGrid.innerHTML = '<div class="skeleton" style="height:44px"></div>'.repeat(3);
    }
    try {
      const data = await api(`/api/iptv/channels${refresh ? '?refresh=1' : ''}`);
      state.live = data;
      renderLiveSource(data);
      renderChannels();

      if (data.channels.length) {
        const keep = state.currentChannel && data.channels.find((c) => c.id === state.currentChannel.id);
        const target = keep || data.channels[0];
        selectChannel(target, { play: true });
        setLiveStatus(`已加载 ${data.total} 个频道`, 'ok');
        if (!state.initialFocus) {
          state.initialFocus = true;
          focusFirstChannel();
        }
      } else {
        el.homeChannelGrid.innerHTML = '';
        el.iptvEmpty.hidden = false;
        el.iptvEmptyText.textContent =
          data.error || '请到电脑端配置页更换直播源地址，或使用带频道的 M3U / TXT 地址。';
        setLiveStatus('直播源暂无频道', 'bad');
        clearCatchup('直播源暂无频道');
        el.stageIdle.hidden = false;
      }
    } catch (error) {
      state.live = { ok: false, channels: [], categories: [], error: error.message };
      el.homeChannelGrid.innerHTML = '';
      el.iptvEmpty.hidden = false;
      el.iptvEmptyText.textContent = `直播源请求失败：${error.message}`;
      setLiveStatus('直播源不可用', 'bad');
      clearCatchup('直播源不可用');
    }
  }

  function renderLiveSource(data) {
    const source = data.source || {};
    const name = source.name || '直播源';
    el.iptvSourceName.textContent = name;
    const url = source.url === 'builtin:demo' ? '内置演示源 · 可在电脑端更换' : source.resolvedUrl || source.url || '';
    el.iptvAddress.textContent = url;
    el.iptvAddress.title = url;
    el.sourceFooter.textContent = `直播源：${name}`;
  }

  function renderChannels() {
    if (!state.live) return;
    const list = state.live.channels.slice(0, 3);

    el.homeChannelGrid.innerHTML = '';
    for (const channel of list) {
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
      button.addEventListener('click', () => {
        selectChannel(channel, { play: false });
        openLiveFullscreen();
      });
      el.homeChannelGrid.appendChild(button);
    }
  }

  function clearCatchup(hint) {
    state.epg = null;
    state.activeProgram = -1;
    el.catchupList.innerHTML = '';
    el.catchupHint.textContent = hint || '选择频道后显示今日节目单';
    el.catchupDate.textContent = '';
    el.nowProgram.textContent = '';
  }

  function selectChannel(channel, { play = false } = {}) {
    if (!channel) return;
    state.currentChannel = channel;
    $$('.quick-channel', el.homeChannelGrid).forEach((node) => {
      node.classList.toggle('is-active', node.dataset.channelId === channel.id);
    });

    if (!play) {
      el.nowTitle.textContent = channel.name;
      el.nowProgram.textContent = '按确认键观看直播';
    }
    loadEpg(channel);

    if (play) {
      playLive(channel);
    }
  }

  async function loadEpg(channel) {
    clearCatchup('正在加载今日节目单…');
    el.catchupDate.textContent = '';
    try {
      const data = await api(`/api/iptv/epg?id=${encodeURIComponent(channel.id)}`);
      if (!state.currentChannel || state.currentChannel.id !== channel.id) return;
      state.epg = data;
      renderCatchup(data);
      const current = data.programs.find((program) => program.state === 'live');
      if (current) {
        el.nowProgram.textContent = `正在播 · ${current.title}`;
      } else if (!data.catchup) {
        el.nowProgram.textContent = '该直播源未提供今日回看';
      }
    } catch (error) {
      if (state.currentChannel?.id !== channel.id) return;
      clearCatchup(`节目单加载失败：${error.message}`);
    }
  }

  function renderCatchup(data) {
    el.catchupDate.textContent = data.date || '';
    el.catchupHint.textContent = data.catchup
      ? data.epg
        ? '今日节目单 · 可回看'
        : '今日时段回看（源未提供节目单）'
      : '当前频道未提供回看地址';
    if (!data.catchup) {
      el.catchupHint.textContent = '当前频道未提供回看地址';
    }

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
      if (program.state === 'live') {
        setTimeout(() => {
          const target = button;
          const list = el.catchupList;
          const left = target.offsetLeft - list.clientWidth / 2 + target.clientWidth / 2;
          list.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
        }, 100);
      }
    });
  }

  /* ---------------- players ---------------- */

  function setPlayerState(text) {
    el.playerState.textContent = text || '';
  }

  function showStreamError(message) {
    el.stageError.hidden = false;
    el.stageError.textContent = message;
    setPlayerState('播放失败');
  }

  function clearStreamError() {
    el.stageError.hidden = true;
    el.stageError.textContent = '';
  }

  function destroyHls(which) {
    const key = which === 'modal' ? 'modalHls' : which === 'fs' ? 'fsHls' : 'tvHls';
    if (state[key]) {
      try {
        state[key].destroy();
      } catch {
        // ignore
      }
      state[key] = null;
    }
  }

  async function safePlay(video) {
    try {
      await video.play();
      return true;
    } catch {
      video.muted = true;
      updateMuteLabel();
      try {
        await video.play();
        toast('浏览器限制了自动播放，已静音播放，按“静音”键恢复声音');
      } catch {
        setPlayerState('按确认键播放');
      }
      return false;
    }
  }

  function loadMedia(video, rawUrl, which) {
    destroyHls(which);
    const hlsKey = which === 'modal' ? 'modalHls' : which === 'fs' ? 'fsHls' : 'tvHls';
    const url = proxied(rawUrl);
    const cleanPath = rawUrl.split('?')[0].toLowerCase();
    const looksHls = cleanPath.endsWith('.m3u8') || rawUrl.includes('.m3u8');

    if (which === 'tv') {
      clearStreamError();
      setPlayerState('加载中…');
    }

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
      state[hlsKey] = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        setPlayerState(which === 'tv' && state.activeProgram >= 0 ? '回看中' : '直播中');
        safePlay(video);
      });
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
        if (which === 'tv') showStreamError(`播放失败：${data.details || '媒体错误'}`);
        else toast(`视频播放失败：${data.details || '媒体错误'}`, true);
        destroyHls(which);
      });
      return;
    }

    video.src = url;
    video.addEventListener(
      'loadedmetadata',
      () => {
        setPlayerState('视频就绪');
        safePlay(video);
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      () => {
        if (which === 'tv') showStreamError('该视频地址无法播放');
        else toast('该视频地址无法播放', true);
      },
      { once: true },
    );
    video.load();
    safePlay(video);
  }

  function stopLive() {
    destroyHls('tv');
    el.tvVideo.pause();
    el.tvVideo.removeAttribute('src');
    el.tvVideo.load();
    el.stage.classList.remove('is-playing');
    el.stageTopline.hidden = true;
    el.stageControls.hidden = true;
    clearStreamError();
    el.stageIdle.hidden = false;
    state.activeProgram = -1;
    setPlayerState('');
    $$('.catchup-item.is-active').forEach((node) => node.classList.remove('is-active'));
    el.nowBadge.className = 'now-badge';
    updateMuteLabel();
  }

  function playLive(channel) {
    state.currentChannel = channel;
    state.activeProgram = -1;
    el.stage.classList.add('is-playing');
    el.stageIdle.hidden = true;
    el.stageTopline.hidden = false;
    el.stageControls.hidden = false;
    el.nowBadge.className = 'now-badge';
    el.nowBadge.textContent = 'LIVE';
    el.nowTitle.textContent = channel.name;
    el.nowProgram.textContent = '准备播放';
    $$('.quick-channel', el.homeChannelGrid).forEach((node) => {
      node.classList.toggle('is-active', node.dataset.channelId === channel.id);
    });
    $$('.catchup-item.is-active').forEach((node) => node.classList.remove('is-active'));
    clearStreamError();
    loadMedia(el.tvVideo, channel.url, 'tv');
    updateMuteLabel();
  }

  function playCatchup(program, index) {
    if (!program.url) {
      toast(
        program.state === 'future' ? '该节目还没开始' : '该直播源未提供回看地址',
        true,
      );
      return;
    }
    if (!state.currentChannel) return;
    state.activeProgram = index;
    el.stage.classList.add('is-playing');
    el.stageIdle.hidden = true;
    el.stageTopline.hidden = false;
    el.stageControls.hidden = false;
    el.nowBadge.className = 'now-badge catchup';
    el.nowBadge.textContent = '回看';
    el.nowTitle.textContent = state.currentChannel.name;
    el.nowProgram.textContent = program.title;
    $$('.catchup-item').forEach((node, i) => {
      node.classList.toggle('is-active', i === index);
    });
    clearStreamError();
    loadMedia(el.tvVideo, program.url, 'tv');
    updateMuteLabel();
    if (state.catchupOpen) closeCatchupView();
    focusNode(el.stage);
  }

  function togglePlayback(video = el.tvVideo) {
    if (!video.currentSrc && !video.src) {
      if (state.currentChannel) playLive(state.currentChannel);
      return;
    }
    if (video.paused) {
      safePlay(video);
      setPlayerState('播放中');
    } else {
      video.pause();
      setPlayerState('已暂停');
    }
    updatePlayLabel();
  }

  function activeVideo() {
    if (state.playerOpen) return el.modalVideo;
    if (state.fullscreenOpen) return el.fsVideo;
    return el.tvVideo;
  }

  function updatePlayLabel() {
    const video = activeVideo();
    el.btnPlay.textContent = video && !video.paused ? '暂停' : '播放';
  }

  function updateMuteLabel() {
    const video = activeVideo();
    el.btnMute.textContent = video?.muted ? '取消静音' : '静音';
  }

  function toggleMute(video = activeVideo()) {
    if (!video) return;
    video.muted = !video.muted;
    updateMuteLabel();
    toast(video.muted ? '已静音' : '已恢复声音');
  }

  function changeVolume(delta) {
    const video = activeVideo();
    if (!video) return;
    video.muted = false;
    video.volume = Math.min(1, Math.max(0, video.volume + delta));
    const percent = Math.round(video.volume * 100);
    if (state.fullscreenOpen) showVolumeOsd(percent);
    else toast(`音量 ${percent}%`);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast('当前浏览器不支持全屏，请按 F11', true);
    }
  }

  function nextChannel(delta) {
    if (!state.live?.channels?.length) return;
    const list = state.live.channels;
    const index = Math.max(0, list.findIndex((channel) => channel.id === state.currentChannel?.id));
    const next = list[(index + delta + list.length) % list.length];
    selectChannel(next, { play: true });
    const node = $$('.quick-channel', el.homeChannelGrid).find((item) => item.dataset.channelId === next.id);
    if (node) focusNode(node);
  }

  /* ---------------- fullscreen live / apps ---------------- */

  function channelNumber(channel) {
    const list = state.live?.channels || [];
    const index = list.findIndex((item) => item.id === channel?.id);
    return index >= 0 ? index + 1 : 0;
  }

  function showChannelOsd(text, timeout = 2200) {
    if (!el.fsOsd) return;
    el.fsOsd.className = 'fs-osd is-channel';
    el.fsOsd.textContent = String(text);
    el.fsOsd.hidden = false;
    clearTimeout(state.osdTimer);
    state.osdTimer = setTimeout(() => { el.fsOsd.hidden = true; }, timeout);
  }

  function showVolumeOsd(percent) {
    if (!el.fsOsd) return;
    el.fsOsd.className = 'fs-osd';
    el.fsOsd.innerHTML = `${esc(percent)}%<small>音量</small>`;
    el.fsOsd.hidden = false;
    clearTimeout(state.osdTimer);
    state.osdTimer = setTimeout(() => { el.fsOsd.hidden = true; }, 1400);
  }

  function resetFullscreenDim() {
    if (!el.liveFullscreen) return;
    el.liveFullscreen.classList.remove('is-dim');
    clearTimeout(state.dimTimer);
    state.dimTimer = setTimeout(() => {
      if (state.fullscreenOpen && !state.channelSwitchOpen) el.liveFullscreen.classList.add('is-dim');
    }, 4200);
  }

  function updateFullscreenInfo(programTitle) {
    const channel = state.currentChannel;
    if (!channel) return;
    const isCatchup = state.activeProgram >= 0;
    el.fsBadge.textContent = isCatchup ? '回看' : 'LIVE';
    el.fsBadge.className = isCatchup ? 'now-badge catchup' : 'now-badge';
    el.fsTitle.textContent = channel.name;
    el.fsProgram.textContent = programTitle || (isCatchup ? '今日回看' : '正在直播');
    el.fsClock.textContent = formatClock(new Date());
  }

  function openLiveFullscreen() {
    if (!state.live?.channels?.length) {
      toast('还没有可用频道，请先刷新直播源', true);
      return;
    }
    if (!state.currentChannel) state.currentChannel = state.live.channels[0];
    state.fullscreenOpen = true;
    state.channelSwitchOpen = false;
    el.liveFullscreen.hidden = false;
    el.channelSwitcher.hidden = true;
    el.liveFullscreen.classList.remove('is-dim');
    el.tvVideo.pause();
    updateFullscreenInfo();
    loadMedia(el.fsVideo, state.currentChannel.url, 'fs');
    const num = String(channelNumber(state.currentChannel)).padStart(3, '0');
    showChannelOsd(num);
    resetFullscreenDim();
  }

  function closeLiveFullscreen() {
    if (!state.fullscreenOpen) return;
    state.fullscreenOpen = false;
    state.channelSwitchOpen = false;
    el.liveFullscreen.hidden = true;
    el.liveFullscreen.classList.remove('is-dim');
    el.channelSwitcher.hidden = true;
    clearTimeout(state.osdTimer);
    clearTimeout(state.dimTimer);
    el.fsOsd.hidden = true;
    destroyHls('fs');
    el.fsVideo.pause();
    el.fsVideo.removeAttribute('src');
    el.fsVideo.load();
    if (state.currentChannel) {
      playLive(state.currentChannel);
    } else {
      focusFirstChannel();
    }
  }

  function renderChannelSwitcher() {
    const channels = state.live?.channels || [];
    el.channelSwitcherGrid.innerHTML = '';
    channels.forEach((channel, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cs-item${channel.id === state.currentChannel?.id ? ' is-active' : ''}`;
      button.dataset.nav = '';
      button.dataset.channelId = channel.id;
      const logo = channel.logo
        ? `<img src="${esc(imageUrl(channel.logo))}" alt="" loading="lazy" onerror="this.remove()">`
        : esc(channel.name.slice(0, 1));
      button.innerHTML = `
        <span class="cs-num">${String(index + 1).padStart(3, '0')}</span>
        <span class="cs-logo">${logo}</span>
        <span class="cs-name">${esc(channel.name)}</span>
      `;
      button.addEventListener('click', () => switchFullscreenChannel(channel));
      el.channelSwitcherGrid.appendChild(button);
    });
    el.csMeta.textContent = `${channels.length} 个频道 · 方向键选择 · OK 播放 · 返回键收起`;
  }

  function openChannelSwitcher() {
    if (!state.fullscreenOpen) return;
    if (!state.live?.channels?.length) {
      showChannelOsd('—', 1200);
      return;
    }
    state.channelSwitchOpen = true;
    el.channelSwitcher.hidden = false;
    el.liveFullscreen.classList.remove('is-dim');
    clearTimeout(state.dimTimer);
    renderChannelSwitcher();
    const active = $('.cs-item.is-active', el.channelSwitcherGrid) || $('.cs-item', el.channelSwitcherGrid);
    if (active) focusNode(active);
  }

  function closeChannelSwitcher() {
    state.channelSwitchOpen = false;
    el.channelSwitcher.hidden = true;
    resetFullscreenDim();
  }

  function switchFullscreenChannel(channel, keepSwitcher = false) {
    if (!channel) return;
    selectChannel(channel, { play: false });
    state.digitBuffer = '';
    clearTimeout(state.digitTimer);
    updateFullscreenInfo();
    loadMedia(el.fsVideo, channel.url, 'fs');
    showChannelOsd(String(channelNumber(channel)).padStart(3, '0'));
    if (!keepSwitcher) closeChannelSwitcher();
    resetFullscreenDim();
  }

  function stepFullscreenChannel(delta) {
    const list = state.live?.channels || [];
    if (!list.length) return;
    const index = Math.max(0, list.findIndex((channel) => channel.id === state.currentChannel?.id));
    const next = list[(index + delta + list.length) % list.length];
    switchFullscreenChannel(next);
  }

  function switchToChannelNumber(number) {
    const list = state.live?.channels || [];
    const channel = list[number - 1];
    if (!channel) {
      showChannelOsd(String(number), 1600);
      toast('未找到该频道', true);
      return false;
    }
    switchFullscreenChannel(channel);
    return true;
  }

  function handleChannelDigit(digit) {
    if (!state.fullscreenOpen) return false;
    state.digitBuffer = `${state.digitBuffer}${digit}`.slice(-3);
    clearTimeout(state.digitTimer);
    showChannelOsd(state.digitBuffer, 1400);
    state.digitTimer = setTimeout(() => {
      const number = Number(state.digitBuffer);
      state.digitBuffer = '';
      if (number) switchToChannelNumber(number);
    }, 1500);
    return true;
  }

  function openBiliView() {
    state.biliOpen = true;
    el.biliView.hidden = false;
    if (!el.shortGrid.children.length) loadShorts();
    const first = $('.short-card', el.shortGrid);
    if (first) focusNode(first);
    else focusNode($('#btnBiliHome'));
  }

  function closeBiliView() {
    if (!state.biliOpen) return;
    state.biliOpen = false;
    el.biliView.hidden = true;
    focusNode(state.appsOpen ? el.biliAppTile : el.appsEntry);
  }

  function openMoviesView() {
    state.moviesOpen = true;
    el.moviesView.hidden = false;
    if (!state.movies.length) loadMovies();
    const first = $('.poster-card', el.movieGrid);
    if (first) focusNode(first);
    else focusNode(el.btnMoviesHome);
  }

  function closeMoviesView() {
    if (!state.moviesOpen) return;
    state.moviesOpen = false;
    el.moviesView.hidden = true;
    focusNode(el.movieEntry);
  }

  function openAppsView() {
    state.appsOpen = true;
    el.appsView.hidden = false;
    focusNode(el.biliAppTile);
  }

  function closeAppsView() {
    if (!state.appsOpen) return;
    state.appsOpen = false;
    el.appsView.hidden = true;
    if (state.biliOpen) closeBiliView();
    focusNode(el.appsEntry);
  }

  function openRemoteView() {
    state.remoteOpen = true;
    el.remoteView.hidden = false;
    renderQrCode();
    focusNode(el.btnRemoteHome);
  }

  function closeRemoteView() {
    if (!state.remoteOpen) return;
    state.remoteOpen = false;
    el.remoteView.hidden = true;
    focusNode(el.remoteEntry);
  }

  function openCatchupView() {
    state.catchupOpen = true;
    el.catchupView.hidden = false;
    if (state.currentChannel) loadEpg(state.currentChannel);
    const item = $('.catchup-item', el.catchupList);
    if (item) focusNode(item);
    else focusNode(el.btnCatchupHome);
  }

  function closeCatchupView() {
    if (!state.catchupOpen) return;
    state.catchupOpen = false;
    el.catchupView.hidden = true;
    focusNode(el.catchupEntry);
  }

  function closeAllViews() {
    if (state.biliOpen) closeBiliView();
    if (state.appsOpen) closeAppsView();
    if (state.moviesOpen) closeMoviesView();
    if (state.remoteOpen) closeRemoteView();
    if (state.catchupOpen) closeCatchupView();
  }

  function renderQrCode() {
    if (!el.qrCode) return;
    const base = state.info?.addresses?.find((address) => !address.includes('127.0.0.1'))
      || state.info?.addresses?.[0]
      || location.origin;
    const url = `${base}${state.info?.remote || '/remote'}`;
    el.qrUrl.textContent = url;
    if (typeof qrcode !== 'function') {
      el.qrCode.innerHTML = '<span class="qr-placeholder">二维码组件未加载<br>请直接访问 /remote</span>';
      return;
    }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      el.qrCode.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0 });
    } catch {
      el.qrCode.innerHTML = '<span class="qr-placeholder">二维码生成失败<br>请直接访问 /remote</span>';
    }
  }

  /* ---------------- movies ---------------- */

  function renderSkeletons(container, count, className) {
    container.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const div = document.createElement('div');
      div.className = `skeleton ${className}`;
      container.appendChild(div);
    }
    container.classList.add('is-loading');
  }

  async function loadMovies(refresh = false) {
    renderSkeletons(el.movieGrid, 8, 'poster-skeleton');
    el.movieEmpty.hidden = true;
    try {
      const data = await api(`/api/movies?pg=1${refresh ? `&_=${Date.now()}` : ''}`);
      state.movies = data.items || [];
      state.movieSource = data.source || null;
      el.movieGrid.classList.remove('is-loading');
      el.movieSourceName.textContent = data.source?.name || '未配置';
      if (data.needSource) {
        el.movieGrid.innerHTML = '';
        el.movieEmpty.hidden = false;
        el.movieEmptyText.textContent = data.message || '在电脑打开配置页，添加苹果 CMS 接口即可。';
        return;
      }
      renderMovies();
    } catch (error) {
      el.movieGrid.classList.remove('is-loading');
      el.movieGrid.innerHTML = '';
      el.movieEmpty.hidden = false;
      el.movieEmptyText.textContent = `电影源暂时不可用：${error.message}`;
      el.movieSourceName.textContent = '加载失败';
    }
  }

  function renderMovies() {
    el.movieGrid.innerHTML = '';
    if (!state.movies.length) {
      el.movieEmpty.hidden = false;
      el.movieEmptyText.textContent = '电影源没有返回影片，请稍后刷新或在电脑端检查接口。';
      return;
    }
    for (const movie of state.movies) {
      const button = document.createElement('button');
      button.className = 'poster-card';
      button.dataset.nav = '';
      button.dataset.movieId = movie.id;
      button.setAttribute('aria-label', movie.name);
      const pic = movie.pic
        ? `<img src="${esc(imageUrl(movie.pic))}" alt="" loading="lazy">`
        : '';
      button.innerHTML = `
        ${pic}
        <span class="poster-fallback">${esc(movie.name)}</span>
        <span class="poster-shade"></span>
        ${movie.remarks ? `<span class="poster-remark">${esc(movie.remarks)}</span>` : ''}
        <span class="poster-meta">
          <span class="poster-name">${esc(movie.name)}</span>
          <span class="poster-note">${esc([movie.year, movie.type].filter(Boolean).join(' · ') || '影片')}</span>
        </span>`;
      const img = button.querySelector('img');
      if (img) img.addEventListener('error', () => img.classList.add('is-error'));
      button.addEventListener('click', () => openMovieDetail(movie.id, movie.source ?? state.movieSource?.index));
      el.movieGrid.appendChild(button);
    }
  }

  /* ---------------- shorts ---------------- */

  async function loadShorts(refresh = false) {
    renderSkeletons(el.shortGrid, 4, 'short');
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

  /* ---------------- overlay ---------------- */

  function showOverlay(html, focusSelector = '[data-nav]') {
    if (!state.overlayOpen) state.lastFocus = document.activeElement;
    el.overlay.hidden = false;
    el.overlayBody.innerHTML = html;
    state.overlayOpen = true;
    requestAnimationFrame(() => {
      const target = $(focusSelector, el.overlayCard) || $(NAV, el.overlayCard);
      if (target) focusNode(target);
    });
  }

  function closeOverlay(restore = true) {
    if (!state.overlayOpen) return;
    el.overlay.hidden = true;
    el.overlayBody.innerHTML = '';
    state.overlayOpen = false;
    if (restore && state.lastFocus && typeof state.lastFocus.focus === 'function') {
      focusNode(state.lastFocus);
    }
  }

  function guideHtml() {
    const base = state.info?.addresses?.find((address) => !address.includes('127.0.0.1')) || state.info?.addresses?.[0] || location.origin;
    const settingsUrl = `${base}/settings`;
    const remoteUrl = `${base}/remote`;
    const tvUrl = base;
    const liveSource = state.live?.source?.url === 'builtin:demo'
      ? '内置演示源（公共测试流）'
      : state.live?.source?.resolvedUrl || state.live?.source?.url || '未加载';
    const movieSource = state.movieSource
      ? `${state.movieSource.name}`
      : '未配置电影源';

    return `
      <div class="overlay-eyebrow">REMOTE & ACCESS</div>
      <h2 class="overlay-title">电视、电脑与手机</h2>
      <p class="overlay-sub">电脑完成配置后，电视端只需打开下面的地址；手机遥控与电视在同一局域网即可。</p>
      <div class="guide-stack">
        <div class="guide-block">
          <h4>访问地址</h4>
          <div class="address-list">
            <div class="address-row"><span>电视端</span><code>${esc(tvUrl)}</code></div>
            <div class="address-row"><span>电脑配置</span><code>${esc(settingsUrl)}</code></div>
            <div class="address-row"><span>手机遥控</span><code>${esc(remoteUrl)}</code></div>
          </div>
        </div>
        <div class="guide-block">
          <h4>遥控按键</h4>
          <div class="key-list">
            <div><b>方向键</b>移动焦点</div>
            <div><b>确认 / OK</b>播放、进入</div>
            <div><b>返回 / Esc</b>上一层</div>
            <div><b>媒体键</b>播放 / 暂停</div>
            <div><b>M</b>静音</div>
            <div><b>F</b>全屏</div>
          </div>
        </div>
        <div class="guide-block">
          <h4>当前内容</h4>
          <div class="address-list">
            <div class="address-row"><span>直播源</span><code>${esc(liveSource)}</code></div>
            <div class="address-row"><span>电影源</span><code>${esc(movieSource)}</code></div>
          </div>
        </div>
      </div>
      <div class="guide-actions"><button class="solid-btn" data-nav id="guideCloseBtn">关闭</button></div>`;
  }

  function openGuide() {
    showOverlay(guideHtml());
    $('#guideCloseBtn', el.overlayCard)?.addEventListener('click', () => closeOverlay());
  }

  function openSearchOverlay(prefill = '', autoSearch = false) {
    const value = typeof prefill === 'string' ? prefill : '';
    showOverlay(
      `
      <div class="overlay-eyebrow">SEARCH</div>
      <h2 class="overlay-title">搜索电影</h2>
      <p class="overlay-sub">输入片名后按确认键；也可以让手机遥控发送文字。</p>
      <div class="search-box">
        <input id="searchInput" class="input" placeholder="输入片名，例如：流浪地球" autocomplete="off" value="${esc(value)}">
        <button class="solid-btn" data-nav id="searchSubmit">搜索</button>
      </div>
      <div class="test-result" id="searchState"></div>
      <div class="search-results" id="searchResults"></div>
      <div class="guide-actions">
        <button class="pill-btn" data-nav id="searchCloseBtn">关闭</button>
      </div>`,
      '#searchInput',
    );

    const input = $('#searchInput', el.overlayCard);
    const submit = $('#searchSubmit', el.overlayCard);
    $('#searchCloseBtn', el.overlayCard)?.addEventListener('click', () => closeOverlay());
    submit?.addEventListener('click', () => runSearch(input?.value || ''));
    input?.addEventListener('focus', () => {
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
    });
    state.lastSearch = value;
    if (autoSearch && value) runSearch(value);
  }

  async function runSearch(query) {
    const keyword = String(query || '').trim();
    state.lastSearch = keyword;
    const box = $('#searchResults', el.overlayCard);
    const status = $('#searchState', el.overlayCard);
    if (!box || !status) return;
    if (!keyword) {
      status.textContent = '请输入要搜索的片名';
      status.className = 'test-result bad';
      return;
    }
    status.textContent = '正在搜索…';
    status.className = 'test-result';
    box.innerHTML = '';
    try {
      const data = await api(`/api/movies?wd=${encodeURIComponent(keyword)}`);
      if (!data.items?.length) {
        status.textContent = data.needSource ? '尚未配置电影源，请到电脑配置页添加。' : '没有找到相关影片';
        status.className = 'test-result bad';
        return;
      }
      status.textContent = `找到 ${data.items.length} 个结果${data.source ? ` · ${data.source.name}` : ''}`;
      status.className = 'test-result ok';
      for (const movie of data.items) {
        const row = document.createElement('button');
        row.className = 'result-row';
        row.dataset.nav = '';
        row.innerHTML = `
          <span class="result-pic">${movie.pic ? `<img src="${esc(imageUrl(movie.pic))}" alt="" loading="lazy">` : ''}</span>
          <span class="result-info">
            <span class="result-name">${esc(movie.name)}</span>
            <span class="result-meta">${esc([movie.year, movie.type, movie.remarks].filter(Boolean).join(' · ') || '影片')}</span>
          </span>`;
        const img = row.querySelector('img');
        if (img) img.addEventListener('error', () => img.classList.add('is-error'));
        row.addEventListener('click', () => openMovieDetail(movie.id, movie.source ?? data.source?.index, true));
        box.appendChild(row);
      }
      focusNode($(NAV, box));
    } catch (error) {
      status.textContent = `搜索失败：${error.message}`;
      status.className = 'test-result bad';
    }
  }

  async function openMovieDetail(id, source = '', fromSearch = false) {
    showOverlay(
      `<div class="overlay-eyebrow">MOVIE</div><h2 class="overlay-title">正在获取影片详情…</h2><p class="overlay-sub">${esc(id)}</p>`,
      '#overlayClose',
    );
    try {
      const data = await api(`/api/movies/detail?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source ?? '')}`);
      showMovieDetail(data.movie, data.source, fromSearch);
    } catch (error) {
      showOverlay(
        `<div class="overlay-eyebrow">MOVIE</div><h2 class="overlay-title">影片详情加载失败</h2>
         <p class="overlay-sub">${esc(error.message)}</p>
         <div class="guide-actions"><button class="pill-btn" data-nav id="detailCloseBtn">关闭</button></div>`,
      );
      $('#detailCloseBtn', el.overlayCard)?.addEventListener('click', () => closeOverlay());
    }
  }

  function showMovieDetail(movie, source, fromSearch = false, groupIndex = 0) {
    const groups = movie.groups?.length ? movie.groups : [{ name: '默认线路', episodes: movie.episodes || [] }];
    const group = groups[Math.min(groupIndex, groups.length - 1)] || groups[0];
    const episodes = group?.episodes || [];
    const chips = [movie.year, movie.type, movie.area, movie.remarks].filter(Boolean);

    showOverlay(
      `
      <div class="overlay-eyebrow">MOVIE · ${esc(source?.name || '电影源')}</div>
      <h2 class="overlay-title">${esc(movie.name)}</h2>
      <div class="detail-grid">
        <div class="detail-poster">
          ${movie.pic ? `<img src="${esc(imageUrl(movie.pic))}" alt="">` : `<span class="poster-fallback">${esc(movie.name)}</span>`}
        </div>
        <div>
          <div class="detail-meta">${chips.map((chip) => `<span class="meta-chip">${esc(chip)}</span>`).join('')}</div>
          <div class="detail-desc">${esc(movie.content || '暂无简介')}</div>
          ${groups.length > 1 ? `<div class="episode-title">播放线路</div><div class="episode-list" id="groupList">${groups.map((g, i) => `<button class="episode-btn" data-nav data-group="${i}">${esc(g.name)} (${g.episodes.length})</button>`).join('')}</div>` : ''}
          <div class="episode-title">选集播放 · ${esc(group?.name || '')}</div>
          <div class="episode-list" id="episodeList">${episodes.map((episode, index) => `<button class="episode-btn" data-nav data-episode="${index}">${esc(episode.name)}</button>`).join('') || '<div class="hint">该影片没有可播放地址。</div>'}</div>
        </div>
      </div>
      ${fromSearch ? '<button class="detail-back" data-nav id="detailBackBtn">返回搜索结果</button>' : ''}
      <div class="guide-actions"><button class="pill-btn" data-nav id="detailCloseBtn">关闭</button></div>`,
      episodes.length ? '[data-episode]' : '#detailCloseBtn',
    );

    const poster = $('.detail-poster img', el.overlayCard);
    if (poster) poster.addEventListener('error', () => poster.classList.add('is-error'));

    $$('[data-group]', el.overlayCard).forEach((button) => {
      button.addEventListener('click', () => showMovieDetail(movie, source, fromSearch, Number(button.dataset.group)));
    });

    $$('[data-episode]', el.overlayCard).forEach((button) => {
      button.addEventListener('click', () => {
        const episode = episodes[Number(button.dataset.episode)];
        if (!episode) return;
        closeOverlay(false);
        openPlayerModal({
          title: movie.name,
          sub: `${episode.name} · ${[movie.year, movie.type, movie.area].filter(Boolean).join(' · ')}`,
          url: episode.url,
        });
      });
    });

    $('#detailBackBtn', el.overlayCard)?.addEventListener('click', () => {
      openSearchOverlay(state.lastSearch, true);
    });
    $('#detailCloseBtn', el.overlayCard)?.addEventListener('click', () => closeOverlay());
  }

  /* ---------------- full screen player ---------------- */

  function openPlayerModal({ title, sub, url, iframe = '' }) {
    if (!state.playerOpen) state.lastFocus = document.activeElement;
    state.playerOpen = true;
    el.playerModal.hidden = false;
    el.modalTitle.textContent = title || '播放中';
    el.modalSub.textContent = sub || '';

    if (iframe) {
      destroyHls('modal');
      el.modalVideo.pause();
      el.modalVideo.hidden = true;
      el.modalIframe.hidden = false;
      el.modalIframe.innerHTML = `<iframe src="${esc(iframe)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    } else {
      el.modalIframe.hidden = true;
      el.modalIframe.innerHTML = '';
      el.modalVideo.hidden = false;
      loadMedia(el.modalVideo, url, 'modal');
    }
    updateMuteLabel();
    requestAnimationFrame(() => focusNode(el.modalClose));
  }

  function closePlayerModal() {
    if (!state.playerOpen) return;
    destroyHls('modal');
    el.modalVideo.pause();
    el.modalVideo.removeAttribute('src');
    el.modalVideo.load();
    el.modalVideo.hidden = false;
    el.modalIframe.hidden = true;
    el.modalIframe.innerHTML = '';
    el.playerModal.hidden = true;
    state.playerOpen = false;
    updateMuteLabel();
    const target = state.lastFocus;
    if (target && target.isConnected && target !== document.body) focusNode(target);
    else focusFirstChannel();
  }

  function openBiliPlayer(item) {
    openPlayerModal({
      title: item.title,
      sub: `${item.owner || 'B站'} · ${formatDuration(item.duration)}`,
      iframe: item.embed,
    });
  }

  /* ---------------- keyboard & remote ---------------- */

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

  function goBack() {
    if (state.playerOpen) {
      closePlayerModal();
      return;
    }
    if (state.fullscreenOpen) {
      if (state.channelSwitchOpen) closeChannelSwitcher();
      else closeLiveFullscreen();
      return;
    }
    if (state.biliOpen) {
      closeBiliView();
      return;
    }
    if (state.overlayOpen) {
      closeOverlay();
      return;
    }
    if (state.appsOpen) {
      closeAppsView();
      return;
    }
    if (state.catchupOpen) {
      closeCatchupView();
      return;
    }
    if (state.moviesOpen) {
      closeMoviesView();
      return;
    }
    if (state.remoteOpen) {
      closeRemoteView();
      return;
    }
    if (el.stage.classList.contains('is-playing')) {
      stopLive();
      focusFirstChannel();
    }
  }

  function handleKey(rawKey) {
    const key = normalizeKey(rawKey);
    const active = document.activeElement;

    if (key === 'Escape' || key === 'Back') {
      goBack();
      return true;
    }

    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (typing) {
      if (key === 'Enter') {
        if (active.id === 'searchInput') runSearch(active.value);
        return true;
      }
      if (key === 'ArrowDown') {
        focusNode($('#searchSubmit', el.overlayCard));
        return true;
      }
      return false;
    }

    const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

    if (state.fullscreenOpen) {
      if (key === 'Home') {
        closeLiveFullscreen();
        return true;
      }
      if (state.channelSwitchOpen) {
        if (dirMap[key]) {
          moveFocus(dirMap[key]);
          return true;
        }
        if (key === 'Enter' || key === ' ') {
          const target = document.activeElement;
          if (target && target.matches('.cs-item')) target.click();
          return true;
        }
        if (/^[0-9]$/.test(key)) {
          closeChannelSwitcher();
          handleChannelDigit(key);
          return true;
        }
        return true;
      }
      if (key === 'Enter' || key === ' ') {
        openChannelSwitcher();
        return true;
      }
      if (key === 'ArrowUp') {
        stepFullscreenChannel(-1);
        return true;
      }
      if (key === 'ArrowDown') {
        stepFullscreenChannel(1);
        return true;
      }
      if (key === 'ArrowLeft' || key === '-' || key === '_') {
        changeVolume(-0.1);
        return true;
      }
      if (key === 'ArrowRight' || key === '+' || key === '=') {
        changeVolume(0.1);
        return true;
      }
      if (/^[0-9]$/.test(key)) {
        handleChannelDigit(key);
        return true;
      }
      if (key === 'm' || key === 'M' || key === 'MediaVolumeMute') {
        toggleMute();
        return true;
      }
      resetFullscreenDim();
      return key === 'f' || key === 'F';
    }

    if (state.biliOpen) {
      if (key === 'Home') {
        closeAllViews();
        focusFirstChannel();
        return true;
      }
      if (dirMap[key]) {
        moveFocus(dirMap[key]);
        return true;
      }
      if (key === 'Enter' || key === ' ') {
        const target = document.activeElement;
        if (target && target.matches(NAV)) target.click();
        else focusFirst($('.short-card', el.shortGrid));
        return true;
      }
      return false;
    }

    if (state.appsOpen || state.moviesOpen || state.remoteOpen || state.catchupOpen) {
      if (key === 'Home') {
        closeAllViews();
        focusFirstChannel();
        return true;
      }
      if (dirMap[key]) {
        moveFocus(dirMap[key]);
        return true;
      }
      if (key === 'Enter' || key === ' ') {
        const target = document.activeElement;
        if (target && target.matches(NAV)) {
          target.click();
        } else {
          const root = state.appsOpen
            ? el.appsView
            : state.moviesOpen
              ? el.moviesView
              : state.catchupOpen
                ? el.catchupView
                : el.remoteView;
          focusFirst(NAV, root);
        }
        return true;
      }
      return false;
    }

    if (key === 'Home') {
      closeAllViews();
      if (state.currentChannel) playLive(state.currentChannel);
      focusFirstChannel();
      return true;
    }

    if (dirMap[key]) {
      moveFocus(dirMap[key]);
      return true;
    }

    if (key === 'Enter' || key === ' ') {
      if (state.playerOpen) {
        if (!el.modalVideo.hidden) togglePlayback(el.modalVideo);
        return true;
      }
      if (state.overlayOpen) {
        if (active && active.matches(NAV)) active.click();
        return true;
      }
      if (active === el.stage) {
        openLiveFullscreen();
      } else if (active && active.matches(NAV)) {
        active.click();
      } else {
        focusFirstChannel();
      }
      return true;
    }

    if (/^[0-9]$/.test(key) && el.stage.classList.contains('is-playing')) {
      const list = state.live?.channels || [];
      const channel = list[Number(key) - 1];
      if (channel) {
        selectChannel(channel, { play: true });
        toast(`切换到 ${channel.name}`);
      } else {
        toast(`没有第 ${key} 个频道`, true);
      }
      return true;
    }

    if (key === 'MediaPlayPause' || key === 'MediaPlay' || key === 'MediaPause') {
      togglePlayback(state.playerOpen ? el.modalVideo : el.tvVideo);
      return true;
    }
    if (key === 'MediaStop') {
      if (state.playerOpen) closePlayerModal();
      else stopLive();
      return true;
    }
    if (key === 'MediaTrackNext') {
      if (state.fullscreenOpen) stepFullscreenChannel(1);
      else nextChannel(1);
      return true;
    }
    if (key === 'MediaTrackPrevious') {
      if (state.fullscreenOpen) stepFullscreenChannel(-1);
      else nextChannel(-1);
      return true;
    }
    if (key === 'AudioVolumeUp') {
      changeVolume(0.1);
      return true;
    }
    if (key === 'AudioVolumeDown') {
      changeVolume(-0.1);
      return true;
    }
    if (key === 'AudioVolumeMute') {
      toggleMute();
      return true;
    }
    if (key === 'm' || key === 'M') {
      toggleMute();
      return true;
    }
    if (key === 'f' || key === 'F') {
      toggleFullscreen();
      return true;
    }
    if (key === 'Home') {
      closePlayerModal();
      closeOverlay(false);
      if (state.fullscreenOpen) closeLiveFullscreen();
      if (state.biliOpen) closeBiliView();
      focusFirstChannel();
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
    if (!command.action) return;

    switch (command.action) {
      case 'home':
      case 'power':
        closePlayerModal();
        closeOverlay(false);
        if (state.fullscreenOpen) closeLiveFullscreen();
        closeAllViews();
        focusFirstChannel();
        break;
      case 'live':
        closePlayerModal();
        closeOverlay(false);
        if (state.fullscreenOpen) closeLiveFullscreen();
        closeAllViews();
        focusFirstChannel();
        break;
      case 'movies':
        closePlayerModal();
        closeOverlay(false);
        if (state.fullscreenOpen) closeLiveFullscreen();
        closeAllViews();
        openMoviesView();
        break;
      case 'shorts':
        closePlayerModal();
        closeOverlay(false);
        if (state.fullscreenOpen) closeLiveFullscreen();
        closeAllViews();
        openAppsView();
        openBiliView();
        break;
      case 'apps':
        closePlayerModal();
        closeOverlay(false);
        if (state.fullscreenOpen) closeLiveFullscreen();
        closeAllViews();
        openAppsView();
        break;
      case 'list':
      case 'ok':
        if (state.fullscreenOpen) {
          if (state.channelSwitchOpen) {
            const target = document.activeElement;
            if (target && target.matches('.cs-item')) target.click();
          } else {
            openChannelSwitcher();
          }
        }
        break;
      case 'channelUp':
        if (state.fullscreenOpen) stepFullscreenChannel(-1);
        else nextChannel(-1);
        break;
      case 'channelDown':
        if (state.fullscreenOpen) stepFullscreenChannel(1);
        else nextChannel(1);
        break;
      case 'menu':
        closePlayerModal();
        closeOverlay(false);
        closeAllViews();
        openLiveFullscreen();
        break;
      case 'search':
        closePlayerModal();
        openSearchOverlay(command.text || '', Boolean(command.text));
        break;
      case 'text':
        closePlayerModal();
        openSearchOverlay(command.text || '', Boolean(command.text));
        break;
      case 'playpause':
        togglePlayback(activeVideo());
        break;
      case 'volup':
        changeVolume(0.1);
        break;
      case 'voldown':
        changeVolume(-0.1);
        break;
      case 'mute':
        toggleMute();
        break;
      case 'fullscreen':
        if (state.fullscreenOpen) closeLiveFullscreen();
        else openLiveFullscreen();
        break;
      case 'settings':
        closePlayerModal();
        closeAllViews();
        openGuide();
        break;
      case 'reload':
        refreshAll();
        break;
      case 'next':
        if (state.fullscreenOpen) stepFullscreenChannel(1);
        else nextChannel(1);
        break;
      case 'prev':
        if (state.fullscreenOpen) stepFullscreenChannel(-1);
        else nextChannel(-1);
        break;
      case 'back':
        goBack();
        break;
      default:
        break;
    }
  }

  function connectEvents() {
    if (!window.EventSource) return;
    const source = new EventSource('/api/events');
    state.events = source;
    source.addEventListener('open', () => {
      el.connState.classList.remove('bad');
      el.connState.textContent = '遥控就绪';
      el.qrConn?.classList.remove('bad');
      if (el.qrConn) el.qrConn.innerHTML = '<i></i>遥控服务就绪';
    });
    source.addEventListener('error', () => {
      el.connState.classList.add('bad');
      el.connState.textContent = '遥控重连中';
      el.qrConn?.classList.add('bad');
      if (el.qrConn) el.qrConn.innerHTML = '<i></i>遥控重连中';
    });
    source.addEventListener('remote', (event) => {
      try {
        handleRemote(JSON.parse(event.data));
      } catch {
        // ignore bad payload
      }
    });
    source.addEventListener('config', () => {
      toast('配置已更新，正在刷新…');
      refreshAll();
    });
  }

  function pollGamepads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      const id = pad.index;
      const prev = state.gpPrev[id] || {};
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
        if (pressed && !prev[index]) handleKey(key);
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
        if (active && !prev[key]) handleKey(key);
        now[key] = active;
      }
      state.gpPrev[id] = now;
    }
  }

  /* ---------------- boot ---------------- */

  async function refreshAll() {
    await Promise.allSettled([loadChannels(true), loadMovies(true), loadShorts(true)]);
  }

  function bindStaticEvents() {
    $('#btnGuide').addEventListener('click', openGuide);
    $('#btnReload').addEventListener('click', refreshAll);
    $('#btnSettings').addEventListener('click', openGuide);
    $('#btnIptvRefresh').addEventListener('click', () => loadChannels(true));
    $('#btnIptvEmptyRefresh').addEventListener('click', () => loadChannels(true));
    $('#btnMovieRefresh').addEventListener('click', () => loadMovies(true));
    $('#btnMovieSearch').addEventListener('click', () => openSearchOverlay(''));
    $('#btnMovieEmptyGuide').addEventListener('click', openGuide);
    $('#btnShortsEmptyRefresh').addEventListener('click', () => loadShorts(true));

    el.movieEntry.addEventListener('click', openMoviesView);
    el.videoEntry.addEventListener('click', openBiliView);
    el.catchupEntry.addEventListener('click', openCatchupView);
    el.btnCatchupHome.addEventListener('click', closeCatchupView);
    el.appsEntry.addEventListener('click', openAppsView);
    el.remoteEntry.addEventListener('click', openRemoteView);
    el.btnMoviesHome.addEventListener('click', closeMoviesView);
    el.btnAppsHome.addEventListener('click', closeAppsView);
    el.btnRemoteHome.addEventListener('click', closeRemoteView);

    $('#biliAppTile')?.addEventListener('click', openBiliView);
    $('#searchAppTile')?.addEventListener('click', () => openSearchOverlay(''));
    $('#settingsAppTile')?.addEventListener('click', openGuide);
    $('#btnBiliRefresh')?.addEventListener('click', () => loadShorts(true));
    $('#btnBiliHome')?.addEventListener('click', closeBiliView);

    el.btnPlay.addEventListener('click', () => togglePlayback(activeVideo()));
    el.btnMute.addEventListener('click', () => toggleMute());
    el.btnFullscreen.addEventListener('click', toggleFullscreen);
    el.overlayClose.addEventListener('click', () => closeOverlay());
    el.overlayBackdrop.addEventListener('click', () => closeOverlay());
    el.modalClose.addEventListener('click', closePlayerModal);

    el.stage.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      openLiveFullscreen();
    });

    el.tvVideo.addEventListener('volumechange', updateMuteLabel);
    el.modalVideo.addEventListener('volumechange', updateMuteLabel);
    el.fsVideo.addEventListener('volumechange', updateMuteLabel);
    el.tvVideo.addEventListener('play', () => updatePlayLabel());
    el.tvVideo.addEventListener('pause', () => updatePlayLabel());
    el.modalVideo.addEventListener('play', () => updatePlayLabel());
    el.modalVideo.addEventListener('pause', () => updatePlayLabel());
    el.fsVideo.addEventListener('play', () => updatePlayLabel());
    el.fsVideo.addEventListener('pause', () => updatePlayLabel());

    el.catchupList.addEventListener('click', (event) => {
      if (!event.target.closest('.catchup-item')) return;
    });

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const handled = handleKey(event.key);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    document.addEventListener('pointerdown', () => {
      // 鼠标操作时保持焦点与遥控一致
    });
  }

  async function boot() {
    updateClock();
    setInterval(updateClock, 15000);
    bindStaticEvents();
    connectEvents();
    setInterval(pollGamepads, 110);

    try {
      await loadInfo();
      await loadConfig();
      renderQrCode();
    } catch {
      // 继续加载内容
    }

    await Promise.allSettled([loadChannels(), loadMovies(), loadShorts()]);

    if (!state.initialFocus) {
      state.initialFocus = true;
      focusFirstChannel();
    }

    const now = new Date();
    el.catchupDate.textContent = `今天 ${now.getMonth() + 1}月${now.getDate()}日`;
  }

  boot();
})();
