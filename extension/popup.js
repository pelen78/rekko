// Rekko Recorder · Popup: start, stop and hand the recording to Rekko.
const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);
const show = id => ['idle', 'blocked', 'live', 'done'].forEach(s => { $(s).hidden = s !== id; });
const plural = n => (n === 1 ? 'click' : 'clicks');
let tab = null, timer = null;

async function render() {
  const st = await send({ type: 'state' });
  $('rekko-url').value = st.rekkoUrl;
  clearInterval(timer);
  if (st.recording) {
    show('live'); $('count').textContent = st.count; $('count-label').textContent = plural(st.count);
    timer = setInterval(async () => { const s = await send({ type: 'state' }); $('count').textContent = s.count; $('count-label').textContent = plural(s.count); }, 700);
  } else if (st.count) {
    show('done'); $('done-count').textContent = st.count;
  } else if (!tab || !/^https?:|^file:/.test(tab.url || '')) {
    show('blocked');
  } else {
    show('idle'); $('page-title').textContent = tab.title || tab.url;
  }
}
async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('start').addEventListener('click', async () => { await send({ type: 'start', tabId: tab.id, title: tab.title, url: tab.url }); window.close(); });
  $('stop').addEventListener('click', async () => { await send({ type: 'stop', open: true, rekkoUrl: $('rekko-url').value }); window.close(); });
  $('open').addEventListener('click', async () => { await send({ type: 'stop', open: true, rekkoUrl: $('rekko-url').value }); window.close(); });
  for (const id of ['discard', 'discard-done']) $(id).addEventListener('click', async () => { await send({ type: 'discard' }); render(); });
  $('rekko-url').addEventListener('change', e => { try { const u = new URL(e.target.value); send({ type: 'set-rekko-url', url: u.href }); } catch { render(); } });
  render();
}
init();
