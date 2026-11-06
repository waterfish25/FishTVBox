/* FishTVBox 在线演示 · 共享交互 */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const NAV = '[data-nav]';
  let toastTimer = null;

  function toast(message) {
    const node = $('#demoToast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 3200);
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function updateClock() {
    const now = new Date();
    const text = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const clock = $('#clock');
    const idle = $('#idleClock');
    const date = $('#dateText');
    if (clock) clock.textContent = text;
    if (idle) idle.textContent = text;
    if (date) date.textContent = `${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 周${'日一二三四五六'[now.getDay()]}`;
  }

  function focusNode(node) {
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  function focusables(scope = document) {
    return $$(NAV, scope).filter((node) => node.offsetParent !== null && !node.closest('[hidden]'));
  }

  function moveFocus(direction, scope = document) {
    const items = focusables(scope);
    if (!items.length) return;
    const current = document.activeElement;
    if (!items.includes(current)) {
      focusNode(items[0]);
      return;
    }
    const cr = current.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;
    const cy = cr.top + cr.height / 2;
    let best = null;
    let score = Infinity;
    for (const node of items) {
      if (node === current) continue;
      const r = node.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
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
      const nextScore = primary + cross * 2.15;
      if (nextScore < score) {
        score = nextScore;
        best = node;
      }
    }
    focusNode(best);
  }

  function focusFirst(selector = NAV, scope = document) {
    focusNode($(selector, scope));
  }

  function bindKeys(handler) {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const handled = handler(event.key);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  function bindDemoActions(root = document) {
    $$('[data-demo]', root).forEach((node) => {
      node.addEventListener('click', () => toast(node.dataset.demo));
    });
    $$('[data-back]', root).forEach((node) => {
      node.addEventListener('click', () => {
        location.href = node.dataset.back;
      });
    });
  }

  function renderQr(selector, url) {
    const node = $(selector);
    if (!node) return;
    if (typeof qrcode !== 'function') {
      node.innerHTML = '<span class="qr-placeholder">二维码组件未加载</span>';
      return;
    }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      node.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0 });
    } catch {
      node.innerHTML = '<span class="qr-placeholder">二维码生成失败</span>';
    }
  }

  function clock() {
    updateClock();
    setInterval(updateClock, 15000);
  }

  window.Demo = {
    $,
    $$,
    NAV,
    toast,
    pad,
    updateClock,
    clock,
    focusNode,
    focusables,
    moveFocus,
    focusFirst,
    bindKeys,
    bindDemoActions,
    renderQr,
  };
})();
