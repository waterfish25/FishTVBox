/* FishTVBox · 电影 */
(() => {
  'use strict';

  const {
    $, $$, NAV, esc, api, toast, imageUrl, normalizeKey,
    loadConfig, createNav, bindKeys, connectEvents, startGamepadPolling, go,
  } = window.TV;

  const el = {
    moviesView: $('#moviesView'),
    movieGrid: $('#movieGrid'),
    movieEmpty: $('#movieEmpty'),
    movieEmptyText: $('#movieEmptyText'),
    movieSourceName: $('#movieSourceName'),
    overlay: $('#overlay'),
    overlayBody: $('#overlayBody'),
    overlayClose: $('#overlayClose'),
    overlayBackdrop: $('#overlayBackdrop'),
    overlayCard: $('#overlayCard'),
    playerModal: $('#playerModal'),
    modalTitle: $('#modalTitle'),
    modalSub: $('#modalSub'),
    modalVideo: $('#modalVideo'),
    modalClose: $('#modalClose'),
  };

  const state = {
    movies: [],
    movieSource: null,
    overlayOpen: false,
    playerOpen: false,
    lastFocus: null,
    modalHls: null,
    lastSearch: '',
  };

  const HlsCtor = window.Hls;

  const nav = createNav(() => {
    if (state.playerOpen) return el.playerModal;
    if (state.overlayOpen) return el.overlayCard;
    return el.moviesView;
  });

  /* ---------------- 列表 ---------------- */

  function renderSkeletons(container, count) {
    container.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const div = document.createElement('div');
      div.className = 'skeleton poster-skeleton';
      container.appendChild(div);
    }
    container.classList.add('is-loading');
  }

  async function loadMovies(refresh = false) {
    renderSkeletons(el.movieGrid, 8);
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
    el.movieEmpty.hidden = true;
    for (const movie of state.movies) {
      const button = document.createElement('button');
      button.className = 'poster-card';
      button.dataset.nav = '';
      button.dataset.movieId = movie.id;
      button.setAttribute('aria-label', movie.name);
      const pic = movie.pic ? `<img src="${esc(imageUrl(movie.pic))}" alt="" loading="lazy">` : '';
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

  /* ---------------- 浮层 ---------------- */

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
      nav.focusFirst(NAV, box);
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

  /* ---------------- 播放 ---------------- */

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
        toast('浏览器限制了自动播放，已静音播放');
      } catch {
        // 等待用户确认
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
        toast(`影片播放失败：${data.details || '媒体错误'}`, true);
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
    el.modalTitle.textContent = title || '播放中';
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
    if (target && target.isConnected && target !== document.body) nav.focusNode(target);
    else nav.focusFirst();
  }

  function togglePlayback() {
    if (!state.playerOpen || !el.modalVideo) return;
    if (el.modalVideo.paused) safePlay(el.modalVideo);
    else el.modalVideo.pause();
  }

  function toggleMute() {
    if (!state.playerOpen) return;
    el.modalVideo.muted = !el.modalVideo.muted;
    toast(el.modalVideo.muted ? '已静音' : '已恢复声音');
  }

  /* ---------------- 按键与遥控 ---------------- */

  const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function goBack() {
    if (state.playerOpen) {
      closePlayerModal();
      return;
    }
    if (state.overlayOpen) {
      closeOverlay();
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

    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (typing) {
      if (key === 'Enter') {
        if (active.id === 'searchInput') runSearch(active.value);
        return true;
      }
      if (key === 'ArrowDown') {
        nav.focusNode($('#searchSubmit', el.overlayCard));
        return true;
      }
      return false;
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
      if (key === 'm' || key === 'M' || key === 'AudioVolumeMute') {
        toggleMute();
        return true;
      }
      return false;
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
    if (key === 'MediaStop') {
      closePlayerModal();
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
      case 'shorts':
        go('/bili');
        break;
      case 'apps':
        go('/apps');
        break;
      case 'search':
      case 'text':
        openSearchOverlay(command.text || '', Boolean(command.text));
        break;
      case 'playpause':
        togglePlayback();
        break;
      case 'mute':
        toggleMute();
        break;
      case 'volup':
        el.modalVideo.muted = false;
        el.modalVideo.volume = Math.min(1, el.modalVideo.volume + 0.1);
        break;
      case 'voldown':
        el.modalVideo.muted = false;
        el.modalVideo.volume = Math.max(0, el.modalVideo.volume - 0.1);
        break;
      case 'fullscreen':
        document.documentElement.requestFullscreen?.().catch(() => {});
        break;
      case 'reload':
        loadMovies(true);
        break;
      case 'back':
        goBack();
        break;
      default:
        break;
    }
  }

  function bindStaticEvents() {
    $('#btnMovieSearch').addEventListener('click', () => openSearchOverlay(''));
    $('#btnMovieRefresh').addEventListener('click', () => loadMovies(true));
    $('#btnMoviesHome').addEventListener('click', () => go('/'));
    $('#btnMovieEmptyGuide').addEventListener('click', () => go('/settings'));
    el.overlayClose.addEventListener('click', () => closeOverlay());
    el.overlayBackdrop.addEventListener('click', () => closeOverlay());
    el.modalClose.addEventListener('click', closePlayerModal);
    bindKeys(handleKey);
  }

  async function boot() {
    bindStaticEvents();
    connectEvents({
      onRemote: handleRemote,
      onConfig: () => {
        toast('配置已更新，正在刷新…');
        loadMovies(true);
      },
    });
    startGamepadPolling(handleKey);
    await loadConfig();
    await loadMovies();

    const params = new URLSearchParams(location.search);
    if (params.get('search') === '1' || params.get('q')) {
      openSearchOverlay(params.get('q') || '', Boolean(params.get('q')));
      return;
    }
    const first = $('.poster-card', el.movieGrid);
    if (first) nav.focusNode(first);
  }

  boot();
})();
