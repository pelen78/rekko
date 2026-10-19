// Rekko Recorder · Service worker: keeps the recording, captures the visible tab on every click.
const DEFAULT_REKKO = 'http://127.0.0.1:5173/';
const MAX_STEPS = 60;
const session = chrome.storage.session, local = chrome.storage.local;

async function getState() {
  const { rec } = await session.get('rec');
  return rec || { recording: false, tabIds: [], count: 0, title: '', url: '' };
}
const setState = rec => session.set({ rec });
async function rekkoUrl() { const { rekkoUrl } = await local.get('rekkoUrl'); return rekkoUrl || DEFAULT_REKKO; }
function badge(rec) {
  chrome.action.setBadgeBackgroundColor({ color: '#e5484d' });
  chrome.action.setBadgeText({ text: rec.recording ? (rec.count ? String(rec.count) : 'REC') : '' });
}
const tell = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => {});

async function clearSteps() {
  const all = await local.get(null);
  await local.remove(Object.keys(all).filter(k => k.startsWith('step:')));
}
async function readSteps(count) {
  const keys = Array.from({ length: count }, (_, i) => `step:${i}`);
  const got = await local.get(keys);
  return keys.map(k => got[k]).filter(Boolean);
}

async function start({ tabId, title, url }) {
  await clearSteps(); cache = null;
  const rec = { recording: true, tabIds: [tabId], count: 0, title: title || '', url: url || '', startedAt: Date.now() };
  await setState(rec); badge(rec);
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); } catch { }
  tell(tabId, { type: 'recording', on: true });
  return rec;
}
async function stop() {
  const rec = await getState();
  rec.recording = false; await setState(rec); badge(rec);
  rec.tabIds.forEach(id => tell(id, { type: 'recording', on: false }));
  return rec;
}

// Capture queue: one capture at a time, and Chrome allows only ~2 captures per second.
let queue = Promise.resolve(), last = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function capture(windowId) {
  const gap = 520 - (Date.now() - last);
  if (gap > 0) await wait(gap);
  for (let i = 0; i < 3; i++) {
    try { const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 88 }); last = Date.now(); return shot; }
    catch (e) { if (!/MAX_CAPTURE|quota|rate/i.test(String(e?.message))) throw e; await wait(500); }
  }
  throw new Error('Capture rate limit');
}
// A recent frame taken while the pointer moves over the page, before any click.
// If a click navigates away faster than the capture, this frame shows the screen as it was.
let cache = null, busy = false, prevClickAt = 0;
function prime(tab, url) {
  if (busy || Date.now() - last < 650) return;
  busy = true;
  queue = queue.then(async () => {
    const rec = await getState();
    if (!rec.recording || !rec.tabIds.includes(tab.id) || Date.now() - last < 650) return;
    const at = Date.now();
    const image = await capture(tab.windowId);
    cache = { image, at, url, tabId: tab.id };
  }).catch(() => {}).finally(() => { busy = false; });
}
function onClick(msg, tab) {
  const clickAt = Date.now(), since = prevClickAt; prevClickAt = clickAt;
  queue = queue.then(async () => {
    const rec = await getState();
    if (!rec.recording || !rec.tabIds.includes(tab.id) || rec.count >= MAX_STEPS) return;
    let image; const startedAt = Date.now();
    try { image = await capture(tab.windowId); } catch { return; }
    const now = await chrome.tabs.get(tab.id).catch(() => null);
    const left = !now || now.status === 'loading' || now.url !== msg.url;   // the click navigated away
    const late = startedAt - clickAt > 150;                                   // waited for the rate limit
    const fresh = cache && cache.tabId === tab.id && cache.url === msg.url && cache.at <= clickAt && cache.at >= since;
    if ((left || late) && fresh) image = cache.image;
    const step = { image, rect: msg.rect, point: msg.point, viewport: msg.viewport, label: msg.label, title: msg.title, url: msg.url };
    await local.set({ [`step:${rec.count}`]: step });
    rec.count += 1; await setState(rec); badge(rec);
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    const rec = await getState();
    switch (msg?.type) {
      case 'status': return { recording: rec.recording && rec.tabIds.includes(sender.tab?.id) };
      case 'state': return { ...rec, rekkoUrl: await rekkoUrl() };
      case 'start': return start(msg);
      case 'stop': {
        const done = await stop();
        if (msg.open && done.count) {
          const url = new URL(msg.rekkoUrl || await rekkoUrl()); url.hash = 'import-recording';
          await chrome.tabs.create({ url: url.href });
        }
        return done;
      }
      case 'discard': await stop(); await clearSteps(); { const r = { recording: false, tabIds: [], count: 0, title: '', url: '' }; await setState(r); badge(r); } return true;
      case 'click': if (sender.tab) onClick(msg, sender.tab); return true;
      case 'prime': if (sender.tab && rec.recording && rec.tabIds.includes(sender.tab.id)) prime(sender.tab, msg.url); return true;
      case 'rekko-page': if (/^https?:/.test(msg.url || '')) await local.set({ rekkoUrl: msg.url }); return true;
      case 'set-rekko-url': await local.set({ rekkoUrl: msg.url }); return true;
      case 'take': {
        if (rec.recording || !rec.count) return null;
        await queue;
        return { title: rec.title, url: rec.url, steps: await readSteps(rec.count) };
      }
      case 'clear': { await clearSteps(); const r = { recording: false, tabIds: [], count: 0, title: '', url: '' }; await setState(r); badge(r); return true; }
    }
    return null;
  })().then(reply, () => reply(null));
  return true;
});

// Tabs opened from a recorded tab are recorded too (reports, receipts, "view as" pages).
chrome.tabs.onCreated.addListener(async tab => {
  const rec = await getState();
  if (rec.recording && tab.openerTabId && rec.tabIds.includes(tab.openerTabId) && !rec.tabIds.includes(tab.id)) { rec.tabIds.push(tab.id); await setState(rec); }
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const rec = await getState();
  if (rec.tabIds.includes(tabId)) { rec.tabIds = rec.tabIds.filter(id => id !== tabId); await setState(rec); }
});
chrome.runtime.onStartup.addListener(async () => badge(await getState()));
