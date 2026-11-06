/* FishTVBox · 手机遥控二维码 */
(() => {
  'use strict';

  const {
    $, NAV, normalizeKey, loadInfo, createNav, bindKeys, connectEvents, go,
  } = window.TV;

  const el = {
    remoteView: $('#remoteView'),
    qrCode: $('#qrCode'),
    qrUrl: $('#qrUrl'),
    qrConn: $('#qrConn'),
  };

  const state = { info: null };
  const nav = createNav(() => el.remoteView);

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

  function handleKey(rawKey) {
    const key = normalizeKey(rawKey);
    if (key === 'Escape' || key === 'Back' || key === 'Home') {
      go('/');
      return true;
    }
    if (key === 'Enter' || key === ' ') {
      go('/');
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
    if (command.action === 'home' || command.action === 'power' || command.action === 'live' || command.action === 'back') {
      go('/');
    }
  }

  async function boot() {
    $('#btnRemoteHome').addEventListener('click', () => go('/'));
    bindKeys(handleKey);
    connectEvents({
      onRemote: handleRemote,
      onOpen: () => {
        if (el.qrConn) el.qrConn.classList.remove('bad');
      },
    });
    state.info = await loadInfo();
    renderQrCode();
    nav.focusNode($('#btnRemoteHome', el.remoteView) || $(NAV, el.remoteView));
  }

  boot();
})();
