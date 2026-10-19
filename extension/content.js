// Rekko Recorder · Content script.
// On normal pages: reports clicks while this tab is being recorded.
// On the Rekko app (marked with <meta name="rekko-app">): bridges the app and the extension.
(() => {
  if (window.__rekkoRecorder) return;
  window.__rekkoRecorder = true;
  const send = msg => new Promise(resolve => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; resolve(r); }); } catch { resolve(null); } });

  if (document.querySelector('meta[name="rekko-app"]')) return bridge();
  recorder();

  function recorder() {
    let active = false;
    let lastPrime = 0;
    const prime = () => { const now = Date.now(); if (!active || now - lastPrime < 350) return; lastPrime = now; send({ type: 'prime', url: location.href }); };
    send({ type: 'status' }).then(r => { active = !!r?.recording; prime(); });
    chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'recording') { active = !!msg.on; prime(); } });
    for (const type of ['pointerover', 'input', 'keyup', 'scroll', 'change']) document.addEventListener(type, prime, { capture: true, passive: true });
    const SELECTOR = 'button,a,input,select,textarea,label,summary,[role=button],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=link],[contenteditable]';
    document.addEventListener('pointerdown', e => {
      if (!active || e.button !== 0 || !e.isPrimary) return;
      const el = (e.target?.closest && e.target.closest(SELECTOR)) || e.target;
      if (!el?.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      const label = el.getAttribute?.('aria-label') || el.getAttribute?.('title') || el.getAttribute?.('placeholder') || (el.tagName === 'INPUT' ? '' : (el.innerText || el.textContent || ''));
      send({
        type: 'click',
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        point: { x: e.clientX, y: e.clientY },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        label: String(label).replace(/\s+/g, ' ').trim().slice(0, 80),
        title: document.title, url: location.href,
      });
    }, true);
  }

  function bridge() {
    const VERSION = chrome.runtime.getManifest().version;
    const post = msg => window.postMessage({ rekkoExt: 1, ...msg }, location.origin);
    send({ type: 'rekko-page', url: location.origin + location.pathname });
    post({ type: 'present', version: VERSION });
    window.addEventListener('message', async e => {
      const d = e.data;
      if (e.source !== window || !d || d.rekkoApp !== 1) return;
      if (d.type === 'hello') post({ type: 'present', version: VERSION });
      else if (d.type === 'pull') post({ type: 'recording', recording: await send({ type: 'take' }) });
      else if (d.type === 'imported') send({ type: 'clear' });
    });
  }
})();
