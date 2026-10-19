// Rekko Recorder · Service worker: keeps the recording, captures the visible tab on every click.
const DEFAULT_REKKO = 'http://127.0.0.1:5173/';
const MAX_STEPS = 60;
const session = chrome.storage.session, local = chrome.storage.local;
const EMPTY = () => ({ recording: false, tabIds: [], viewTabs: [], count: 0, title: '', url: '' });

async function getState() {
  const { rec } = await session.get('rec');
  return { ...EMPTY(), ...(rec || {}) };
}
// Every change to the recording goes through this queue: read, change, write, one at a time.
// Without it, a click that is still capturing could write an old copy of the state and
// drop the tab that its own click just opened.
let lock = Promise.resolve();
function mutate(fn) {
  const run = lock.then(async () => {
    const rec = await getState();
    const out = await fn(rec);
    await session.set({ rec });
    badge(rec);
    return out === undefined ? rec : out;
  });
  lock = run.catch(() => {});
  return run;
}
const reset = rec => { for (const k of Object.keys(rec)) delete rec[k]; Object.assign(rec, EMPTY()); };

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
// Saves a step at the end of the recording. Returns false when the recording is over or full.
function saveStep(step, tabId) {
  return mutate(async rec => {
    if (!rec.recording || !rec.tabIds.includes(tabId) || rec.count >= MAX_STEPS) return false;
    await local.set({ [`step:${rec.count}`]: step });
    rec.count += 1;
    return true;
  });
}

async function start({ tabId, title, url }) {
  await clearSteps(); cache = null;
  const rec = await mutate(rec => { reset(rec); Object.assign(rec, { recording: true, tabIds: [tabId], title: title || '', url: url || '', startedAt: Date.now() }); });
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); } catch { }
  tell(tabId, { type: 'recording', on: true });
  return rec;
}
async function stop() {
  const rec = await mutate(rec => { rec.recording = false; rec.viewTabs = []; });
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
// If a click navigates away or opens a new tab faster than the capture, this frame shows the screen as it was.
let cache = null, busy = false, prevClickAt = 0, lastClick = { at: 0, tabId: null };
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
  lastClick = { at: clickAt, tabId: tab.id };
  queue = queue.then(async () => {
    const rec = await getState();
    if (!rec.recording || !rec.tabIds.includes(tab.id) || rec.count >= MAX_STEPS) return;
    const fresh = cache && cache.tabId === tab.id && cache.url === msg.url && cache.at <= clickAt && cache.at >= since;
    // If the click opened a new tab, that tab is now the visible one: a capture would show it instead of the click.
    const before = await chrome.tabs.get(tab.id).catch(() => null);
    let image;
    if (before && !before.active) { if (!fresh) return; image = cache.image; }
    else {
      const startedAt = Date.now();
      try { image = await capture(tab.windowId); } catch { return; }
      const now = await chrome.tabs.get(tab.id).catch(() => null);
      const left = !now || !now.active || now.status === 'loading' || now.url !== msg.url;   // the click navigated or switched away
      const late = startedAt - clickAt > 150;                                                   // waited for the rate limit
      if ((left || late) && fresh) image = cache.image;
    }
    await saveStep({ image, rect: msg.rect, point: msg.point, viewport: msg.viewport, label: msg.label, title: msg.title, url: msg.url }, tab.id);
  }).catch(() => {});
}

// ---------- Tabs opened from a recorded tab (reports, receipts, "view as" pages) ----------
// They join the recording, and once loaded they get their own step: the screen the viewer lands on.
function adopt(tabId) {
  return mutate(rec => {
    if (!rec.recording || rec.tabIds.includes(tabId)) return false;
    rec.tabIds.push(tabId); rec.viewTabs.push(tabId);
    return true;
  }).then(added => { if (added) { tell(tabId, { type: 'recording', on: true }); chrome.tabs.get(tabId).then(t => maybeView(t)).catch(() => {}); } });
}
const isBlank = url => !url || /^(about:blank|chrome:\/\/newtab|chrome-search:|edge:\/\/newtab)/.test(url);
const viewing = new Set();
async function maybeView(tab) {
  if (!tab || tab.status !== 'complete' || !tab.active || isBlank(tab.url) || viewing.has(tab.id)) return;
  const rec = await getState();
  if (!rec.recording || !rec.viewTabs.includes(tab.id)) return;
  viewing.add(tab.id);
  queue = queue.then(async () => {
    await wait(700);                                    // let the page paint (reports often render after load)
    const now = await chrome.tabs.get(tab.id).catch(() => null);
    if (!now || !now.active || now.status !== 'complete') return;
    const image = await capture(now.windowId);
    const done = await mutate(rec => { const had = rec.viewTabs.includes(tab.id); rec.viewTabs = rec.viewTabs.filter(id => id !== tab.id); return had; });
    if (done) await saveStep({ image, view: true, title: now.title || '', url: now.url || '' }, tab.id);
  }).catch(() => {}).finally(() => viewing.delete(tab.id));
}

chrome.tabs.onCreated.addListener(async tab => {
  const rec = await getState();
  if (!rec.recording || rec.tabIds.includes(tab.id)) return;
  if (tab.openerTabId && rec.tabIds.includes(tab.openerTabId)) return adopt(tab.id);
  // Some pages open their report without telling Chrome who opened it. A tab that appears right
  // after a recorded click, and is not an empty new tab, is taken as opened by that click.
  if (!tab.openerTabId && Date.now() - lastClick.at < 3000 && rec.tabIds.includes(lastClick.tabId) && !isBlank(tab.pendingUrl || tab.url)) return adopt(tab.id);
});
// Covers window.open, target="_blank" links and forms, also when they open in a new window.
chrome.webNavigation.onCreatedNavigationTarget.addListener(async d => {
  const rec = await getState();
  if (rec.recording && rec.tabIds.includes(d.sourceTabId)) adopt(d.tabId);
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete') {
    getState().then(rec => { if (rec.recording && rec.tabIds.includes(tabId)) { tell(tabId, { type: 'recording', on: true }); maybeView(tab); } });
  }
});
chrome.tabs.onActivated.addListener(({ tabId }) => { chrome.tabs.get(tabId).then(maybeView).catch(() => {}); });
chrome.tabs.onRemoved.addListener(tabId => {
  mutate(rec => { rec.tabIds = rec.tabIds.filter(id => id !== tabId); rec.viewTabs = rec.viewTabs.filter(id => id !== tabId); });
});

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
      case 'discard': await stop(); await clearSteps(); await mutate(reset); return true;
      case 'click': if (sender.tab) onClick(msg, sender.tab); return true;
      case 'prime': if (sender.tab && rec.recording && rec.tabIds.includes(sender.tab.id)) prime(sender.tab, msg.url); return true;
      case 'rekko-page': if (/^https?:/.test(msg.url || '')) await local.set({ rekkoUrl: msg.url }); return true;
      case 'set-rekko-url': await local.set({ rekkoUrl: msg.url }); return true;
      case 'take': {
        if (rec.recording || !rec.count) return null;
        await queue;
        const fresh = await getState();
        return { title: fresh.title, url: fresh.url, steps: await readSteps(fresh.count) };
      }
      case 'clear': await clearSteps(); await mutate(reset); return true;
    }
    return null;
  })().then(reply, () => reply(null));
  return true;
});

chrome.runtime.onStartup.addListener(async () => badge(await getState()));
