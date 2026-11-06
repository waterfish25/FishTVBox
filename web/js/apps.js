/* FishTVBox · 全部应用 */
(() => {
  'use strict';

  const {
    $, NAV, normalizeKey, loadConfig, createNav, bindKeys, connectEvents, startGamepadPolling, go,
  } = window.TV;

  const el = { appsView: $('#appsView') };
  const nav = createNav(() => el.appsView);
  const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  const APPS = {
    biliAppTile: '/bili',
    searchAppTile: '/movies?search=1',
    settingsAppTile: '/settings',
  };

  function handleKey(rawKey) {
    const key = normalizeKey(rawKey);
    const active = document.activeElement;
    if (key === 'Escape' || key === 'Back' || key === 'Home') {
      go('/');
      return true;
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
      case 'apps':
      case 'back':
        go('/');
        break;
      case 'movies':
        go('/movies');
        break;
      case 'shorts':
        go('/bili');
        break;
      case 'settings':
        go('/settings');
        break;
      default:
        break;
    }
  }

  function bindStaticEvents() {
    $('#btnAppsHome').addEventListener('click', () => go('/'));
    for (const [id, path] of Object.entries(APPS)) {
      $(`#${id}`)?.addEventListener('click', () => go(path));
    }
    bindKeys(handleKey);
  }

  async function boot() {
    bindStaticEvents();
    connectEvents({ onRemote: handleRemote });
    startGamepadPolling(handleKey);
    await loadConfig();
    nav.focusNode($('#biliAppTile'));
  }

  boot();
})();
