(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const statusNode = $('#remoteStatus');
  const chipNode = $('#remoteChip');
  const toastNode = $('#remoteToast');
  const numPad = $('#numPad');
  let toastTimer = null;

  function toast(message, bad = false) {
    toastNode.textContent = message;
    toastNode.className = `remote-toast${bad ? ' bad' : ''}`;
    toastNode.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastNode.hidden = true;
    }, 2200);
  }

  function setStatus(online) {
    statusNode.textContent = online ? '电视已连接' : '电视未连接';
    chipNode.classList.toggle('on', online);
    chipNode.classList.toggle('off', !online);
  }

  async function send(payload) {
    try {
      const res = await fetch('/api/remote/press', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || '发送失败');
      const online = data.clients > 0;
      setStatus(online);
      if (!online) toast('已发送，但电视端未连接', true);
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (error) {
      toast(`遥控发送失败：${error.message}`, true);
      setStatus(false);
    }
  }

  async function checkStatus() {
    try {
      const res = await fetch('/api/remote/status');
      const data = await res.json();
      setStatus(data.clients > 0);
    } catch {
      setStatus(false);
    }
  }

  function sendText() {
    const input = $('#searchText');
    const text = input.value.trim();
    if (!text) {
      toast('请输入要搜索的内容', true);
      return;
    }
    send({ action: 'text', text });
    toast(`已发送：${text}`);
    input.value = '';
  }

  function bind() {
    for (const button of $$('[data-key]')) {
      button.addEventListener('click', () => {
        send({ key: button.dataset.key });
        if (button.closest('.r-numpad')) {
          numPad.hidden = true;
          toast(`已发送：频道 ${button.dataset.key}`);
        }
      });
    }

    for (const button of $$('[data-action]')) {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        if (action === 'search') {
          send({ action: 'search' });
          toast('电视端已打开搜索');
          $('#searchText').focus();
          return;
        }
        send({ action });
        const labels = {
          power: '电源 / 主页',
          home: '主页',
          menu: '节目列表',
          live: '直播',
          movies: '电影',
          shorts: 'B 站',
          list: '节目列表',
          channelUp: '下一个频道',
          channelDown: '上一个频道',
          playpause: '播放/暂停',
          fullscreen: '全屏',
          volup: '音量 +',
          voldown: '音量 −',
          mute: '静音',
        };
        if (labels[action]) toast(`已发送：${labels[action]}`);
        if (action === 'list') numPad.hidden = true;
      });
    }

    $('#keypadToggle').addEventListener('click', () => {
      numPad.hidden = !numPad.hidden;
    });
    $('#numPadClose').addEventListener('click', () => {
      numPad.hidden = true;
    });

    $('#sendText').addEventListener('click', sendText);
    $('#searchText').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendText();
      }
    });

    const origin = location.origin;
    $('#tvUrl').textContent = origin;
    $('#tvUrl').addEventListener('click', () => {
      window.open(origin, '_blank', 'noopener');
    });

    checkStatus();
    setInterval(checkStatus, 8000);
  }

  bind();
})();
