/* FishTVBox · 电视主页 / 直播 */
(() => {
  'use strict';

  const {
    $, $$, NAV, esc, api, toast, imageUrl, formatClock, normalizeKey,
    updateClock, loadConfig, loadInfo, setLiveStatus, createNav,
    bindKeys, connectEvents, startGamepadPolling, go,
  } = window.TV;

  const el = {
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
    homeChannelGrid: $('#homeChannelGrid'),
    sourceFooter: $('#sourceFooter'),
    remoteUrl: $('#remoteUrl'),
    connState: $('#connState'),
    liveFullscreen: $('#liveFullscreen'),
    fsVideo: $('#fsVideo'),
    fsBadge: $('#fsBadge'),
    fsTitle: $('#fsTitle'),
    fsProgram: $('#fsProgram'),
    fsClock: $('#fsClock'),
    fsOsd: $('#fsOsd'),
    channelSwitcher: $('#channelSwitcher'),
    channelSwitcherGrid: $('#channelSwitcherGrid'),
    csMeta: $('#csMeta'),
    overlay: $('#overlay'),
    overlayBody: $('#overlayBody'),
    overlayClose: $('#overlayClose'),
    overlayBackdrop: $('#overlayBackdrop'),
    overlayCard: $('#overlayCard'),
  };

  const state = {
    info: null,
    live: null,
    currentChannel: null,
    overlayOpen: false,
    lastFocus: null,
    tvHls: null,
    fsHls: null,
    fullscreenOpen: false,
    channelSwitchOpen: false,
    digitBuffer: '',
    digitTimer: null,
    osdTimer: null,
    dimTimer: null,
    initialFocus: false,
    activeProgram: -1,
  };

  const HlsCtor = window.Hls;

  const nav = createNav(() => {
    if (state.overlayOpen) return el.overlayCard;
    if (state.fullscreenOpen) return el.liveFullscreen;
    return document;
  });

  function rememberChannel(channel) {
    if (!channel) return;
    try {
      sessionStorage.setItem('fishtv:channel', channel.id);
    } catch {
      // 忽略隐私模式下的存储失败
    }
  }

  function focusFirstChannel() {
    const node = $('.quick-channel', el.homeChannelGrid) || el.stage;
    if (node) nav.focusNode(node);
  }

  /* ---------------- 直播数据 ---------------- */

  async function loadChannels(refresh = false) {
    setLiveStatus(el.liveStatus, '直播源加载中');
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
        const keep = state.currentChannel && data.channels.find((channel) => channel.id === state.currentChannel.id);
        const target = keep || data.channels[0];
        selectChannel(target, { play: true });
        setLiveStatus(el.liveStatus, `已加载 ${data.total} 个频道`, 'ok');
        if (!state.initialFocus) {
          state.initialFocus = true;
          focusFirstChannel();
        }
      } else {
        el.homeChannelGrid.innerHTML = '';
        el.iptvEmpty.hidden = false;
        el.iptvEmptyText.textContent =
          data.error || '请到电脑端配置页更换直播源地址，或使用带频道的 M3U / TXT 地址。';
        setLiveStatus(el.liveStatus, '直播源暂无频道', 'bad');
        el.stageIdle.hidden = false;
      }
    } catch (error) {
      state.live = { ok: false, channels: [], categories: [], error: error.message };
      el.homeChannelGrid.innerHTML = '';
      el.iptvEmpty.hidden = false;
      el.iptvEmptyText.textContent = `直播源请求失败：${error.message}`;
      setLiveStatus(el.liveStatus, '直播源不可用', 'bad');
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

  function selectChannel(channel, { play = false } = {}) {
    if (!channel) return;
    state.currentChannel = channel;
    rememberChannel(channel);
    $$('.quick-channel', el.homeChannelGrid).forEach((node) => {
      node.classList.toggle('is-active', node.dataset.channelId === channel.id);
    });

    if (!play) {
      el.nowTitle.textContent = channel.name;
      el.nowProgram.textContent = '按确认键观看直播';
    }
    loadEpg(channel);
    if (play) playLive(channel);
  }

  async function loadEpg(channel) {
    try {
      const data = await api(`/api/iptv/epg?id=${encodeURIComponent(channel.id)}`);
      if (!state.currentChannel || state.currentChannel.id !== channel.id) return;
      const current = data.programs?.find((program) => program.state === 'live');
      if (current) {
        el.nowProgram.textContent = `正在播 · ${current.title}`;
      } else if (!data.catchup) {
        el.nowProgram.textContent = '该直播源未提供今日回看';
      }
    } catch {
      if (state.currentChannel?.id === channel.id) el.nowProgram.textContent = '节目单暂不可用';
    }
  }

  /* ---------------- 播放器 ---------------- */

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
    const key = which === 'fs' ? 'fsHls' : 'tvHls';
    if (state[key]) {
      try {
        state[key].destroy();
      } catch {
        // 忽略销毁异常
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
    const hlsKey = which === 'fs' ? 'fsHls' : 'tvHls';
    const url = `/api/stream?url=${encodeURIComponent(rawUrl)}`;
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
        setPlayerState('直播中');
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
    el.nowBadge.className = 'now-badge';
    updateMuteLabel();
  }

  function playLive(channel) {
    state.currentChannel = channel;
    state.activeProgram = -1;
    rememberChannel(channel);
    el.stage.classList.add('is-playing');
    el.stageIdle.hidden = true;
    el.stageTopline.hidden = false;
    el.stageControls.hidden = false;
    el.nowBadge.className = 'now-badge';
    el.nowBadge.textContent = 'LIVE';
    el.nowTitle.textContent = channel.name;
    $$('.quick-channel', el.homeChannelGrid).forEach((node) => {
      node.classList.toggle('is-active', node.dataset.channelId === channel.id);
    });
    clearStreamError();
    loadMedia(el.tvVideo, channel.url, 'tv');
    updateMuteLabel();
  }

  function activeVideo() {
    return state.fullscreenOpen ? el.fsVideo : el.tvVideo;
  }

  function updatePlayLabel() {
    const video = activeVideo();
    el.btnPlay.textContent = video && !video.paused ? '暂停' : '播放';
  }

  function updateMuteLabel() {
    const video = activeVideo();
    el.btnMute.textContent = video?.muted ? '取消静音' : '静音';
  }

  function togglePlayback(video = activeVideo()) {
    if (!video) return;
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
    if (node) nav.focusNode(node);
  }

  /* ---------------- 全屏直播 ---------------- */

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
    state.osdTimer = setTimeout(() => {
      el.fsOsd.hidden = true;
    }, timeout);
  }

  function showVolumeOsd(percent) {
    if (!el.fsOsd) return;
    el.fsOsd.className = 'fs-osd';
    el.fsOsd.innerHTML = `${esc(percent)}%<small>音量</small>`;
    el.fsOsd.hidden = false;
    clearTimeout(state.osdTimer);
    state.osdTimer = setTimeout(() => {
      el.fsOsd.hidden = true;
    }, 1400);
  }

  function resetFullscreenDim() {
    if (!el.liveFullscreen) return;
    el.liveFullscreen.classList.remove('is-dim');
    clearTimeout(state.dimTimer);
    state.dimTimer = setTimeout(() => {
      if (state.fullscreenOpen && !state.channelSwitchOpen) el.liveFullscreen.classList.add('is-dim');
    }, 4200);
  }

  function updateFullscreenInfo() {
    const channel = state.currentChannel;
    if (!channel) return;
    el.fsBadge.textContent = 'LIVE';
    el.fsBadge.className = 'now-badge';
    el.fsTitle.textContent = channel.name;
    el.fsProgram.textContent = '正在直播';
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
    if (state.currentChannel) playLive(state.currentChannel);
    else focusFirstChannel();
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
    if (active) nav.focusNode(active);
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

  /* ---------------- 指南浮层 ---------------- */

  function showOverlay(html, focusSelector = NAV) {
    if (!state.overlayOpen) state.lastFocus = document.activeElement;
    el.overlay.hidden = false;
    el.overlayBody.innerHTML = html;
    state.overlayOpen = true;
    requestAnimationFrame(() => {
      const target = $(focusSelector, el.overlayCard) || $(NAV, el.overlayCard);
      if (target) nav.focusNode(target);
    });
  }

  function closeOverlay(restore = true) {
    if (!state.overlayOpen) return;
    el.overlay.hidden = true;
    el.overlayBody.innerHTML = '';
    state.overlayOpen = false;
    if (restore && state.lastFocus && typeof state.lastFocus.focus === 'function') {
      nav.focusNode(state.lastFocus);
    }
  }

  function openGuide() {
    const base = state.info?.addresses?.find((address) => !address.includes('127.0.0.1'))
      || state.info?.addresses?.[0]
      || location.origin;
    const settingsUrl = `${base}/settings`;
    const remoteUrl = `${base}/remote`;
    const liveSource = state.live?.source?.url === 'builtin:demo'
      ? '内置演示源（公共测试流）'
      : state.live?.source?.resolvedUrl || state.live?.source?.url || '未加载';

    showOverlay(`
      <div class="overlay-eyebrow">REMOTE & ACCESS</div>
      <h2 class="overlay-title">电视、电脑与手机</h2>
      <p class="overlay-sub">电脑完成配置后，电视端只需打开下面的地址；手机遥控与电视在同一局域网即可。</p>
      <div class="guide-stack">
        <div class="guide-block">
          <h4>访问地址</h4>
          <div class="address-list">
            <div class="address-row"><span>电视端</span><code>${esc(base)}</code></div>
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
            <div class="address-row"><span>电影</span><code>/movies</code></div>
            <div class="address-row"><span>视频</span><code>/bili</code></div>
          </div>
        </div>
      </div>
      <div class="guide-actions"><button class="solid-btn" data-nav id="guideCloseBtn">关闭</button></div>`);
    $('#guideCloseBtn', el.overlayCard)?.addEventListener('click', () => closeOverlay());
  }

  /* ---------------- 按键与遥控 ---------------- */

  const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function goBack() {
    if (state.overlayOpen) {
      closeOverlay();
      return;
    }
    if (state.fullscreenOpen) {
      if (state.channelSwitchOpen) closeChannelSwitcher();
      else closeLiveFullscreen();
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

    if (state.overlayOpen) {
      if (dirMap[key]) {
        nav.moveFocus(dirMap[key]);
        return true;
      }
      if (key === 'Enter' || key === ' ') {
        if (active && active.matches(NAV)) active.click();
        else nav.focusFirst(NAV, el.overlayCard);
        return true;
      }
      return true;
    }

    if (state.fullscreenOpen) {
      if (key === 'Home') {
        closeLiveFullscreen();
        return true;
      }
      if (state.channelSwitchOpen) {
        if (dirMap[key]) {
          nav.moveFocus(dirMap[key]);
          return true;
        }
        if (key === 'Enter' || key === ' ') {
          if (active && active.matches('.cs-item')) active.click();
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

    if (key === 'Home') {
      if (state.currentChannel) playLive(state.currentChannel);
      focusFirstChannel();
      return true;
    }

    if (dirMap[key]) {
      nav.moveFocus(dirMap[key]);
      return true;
    }

    if (key === 'Enter' || key === ' ') {
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
      togglePlayback(el.tvVideo);
      return true;
    }
    if (key === 'MediaStop') {
      stopLive();
      return true;
    }
    if (key === 'MediaTrackNext') {
      nextChannel(1);
      return true;
    }
    if (key === 'MediaTrackPrevious') {
      nextChannel(-1);
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
      case 'live':
        closeOverlay(false);
        if (state.fullscreenOpen) closeLiveFullscreen();
        focusFirstChannel();
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
      case 'menu':
        closeOverlay(false);
        openLiveFullscreen();
        break;
      case 'search':
      case 'text':
        go(`/movies?search=1&q=${encodeURIComponent(command.text || '')}`);
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
        openGuide();
        break;
      case 'reload':
        loadChannels(true);
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

  /* ---------------- 绑定 ---------------- */

  function bindStaticEvents() {
    $('#btnGuide').addEventListener('click', openGuide);
    $('#btnReload').addEventListener('click', () => loadChannels(true));
    $('#btnSettings').addEventListener('click', () => go('/settings'));
    $('#btnIptvRefresh').addEventListener('click', () => loadChannels(true));
    $('#btnIptvEmptyRefresh').addEventListener('click', () => loadChannels(true));

    $('#catchupEntry').addEventListener('click', () => go('/catchup'));
    $('#movieEntry').addEventListener('click', () => go('/movies'));
    $('#videoEntry').addEventListener('click', () => go('/bili'));
    $('#appsEntry').addEventListener('click', () => go('/apps'));
    $('#remoteEntry').addEventListener('click', () => go('/control'));

    el.btnPlay.addEventListener('click', () => togglePlayback(activeVideo()));
    el.btnMute.addEventListener('click', () => toggleMute());
    el.btnFullscreen.addEventListener('click', toggleFullscreen);
    el.overlayClose.addEventListener('click', () => closeOverlay());
    el.overlayBackdrop.addEventListener('click', () => closeOverlay());

    el.stage.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      openLiveFullscreen();
    });

    el.tvVideo.addEventListener('volumechange', updateMuteLabel);
    el.fsVideo.addEventListener('volumechange', updateMuteLabel);
    el.tvVideo.addEventListener('play', updatePlayLabel);
    el.tvVideo.addEventListener('pause', updatePlayLabel);
    el.fsVideo.addEventListener('play', updatePlayLabel);
    el.fsVideo.addEventListener('pause', updatePlayLabel);

    bindKeys(handleKey);
  }

  async function boot() {
    updateClock();
    setInterval(updateClock, 15000);
    bindStaticEvents();
    connectEvents({
      onRemote: handleRemote,
      onConfig: () => {
        toast('配置已更新，正在刷新…');
        loadChannels(true);
      },
    });
    startGamepadPolling(handleKey);

    try {
      await loadInfo();
      await loadConfig();
    } catch {
      // 配置不可用时继续加载频道
    }

    await loadChannels();
    if (!state.initialFocus) {
      state.initialFocus = true;
      focusFirstChannel();
    }
  }

  boot();
})();
