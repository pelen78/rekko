// Rekko · UI: demo library, step editor and preview.
import { createDemo, setLanguage, demoLanguage, addStep, removeStep, moveStep, duplicateStep, updateStep, setHotspot, rectFromDrag, normalizeHotspot, pointInHotspot, fitRect, placeTooltip, setTitle, updateSettings, updateTheme, validateDemo, playableDemo, clamp, newId, setStepScreen, describeEdits, strings } from './model.mjs';
import { openScreenEditor, initScreenEditor, screenEditorOpen } from './screen-editor.mjs';
import { saveDemo, loadDemo, deleteDemo, listDemos } from './store.mjs';
import { imageFromFile, blobToDataUrl, dataUrlToBlob, stepSrc, loadBitmap, normalizeImage } from './images.mjs';
import { canCapture, canFloat, startCapture, openFloatingButton } from './capture.mjs';
import { readLabel } from './ocr.mjs';
import { mountPlayer, PLAYER_CSS } from './player.mjs';
import { buildHtml, embedSnippet, slug, backupJson } from './export.mjs';
import { hotspotFromMessage, tooltipFor, bookmarkletCode, stepsFromRecording } from './remote.mjs';

const $ = s => document.querySelector(s);
const state = { demo: null, selected: null, capture: null, floating: null, player: null, saveTimer: null, urls: new Map(), shots: 0, remote: null, tab: 'step', ext: null, importing: false };

function toast(message, ms = 2800, action = null) {
  const el = $('#toast'); el.textContent = message; el.hidden = false;
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-action'; b.textContent = action.label;
    b.addEventListener('click', () => { el.hidden = true; action.run(); }, { once: true });
    el.append(b);
  }
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, ms);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = ts => new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
function urlFor(step) {
  if (step.image.dataUrl) return step.image.dataUrl;
  let c = state.urls.get(step.id);
  if (c && c.blob !== step.image.blob) { URL.revokeObjectURL(c.url); c = null; }
  if (!c) { c = { blob: step.image.blob, url: URL.createObjectURL(step.image.blob) }; state.urls.set(step.id, c); }
  return c.url;
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }

// ---------- Biblioteca ----------
async function showLibrary() {
  stopCapture();
  $('#view-editor').hidden = true; $('#view-library').hidden = false;
  state.demo = null; state.selected = null;
  const demos = await listDemos().catch(e => { toast(e.message); return []; });
  $('#demo-count').textContent = demos.length;
  const grid = $('#demo-grid');
  grid.innerHTML = demos.length ? '' : '<div class="demo-empty"><span class="empty-icon"><svg class="i"><use href="#i-image"/></svg></span><strong>No demos yet</strong><span>Create your first one with “New demo”.</span></div>';
  for (const d of demos) {
    const card = document.createElement('div'); card.className = 'demo-card'; card.dataset.open = d.id; card.tabIndex = 0; card.setAttribute('role', 'button');
    const first = d.steps[0];
    const thumb = first ? `style="background-image:url('${first.image.dataUrl || URL.createObjectURL(first.image.blob)}')"` : '';
    card.innerHTML = `<div class="thumb" ${thumb}>${first ? '' : 'No screens'}</div><div class="meta"><strong></strong><small>${d.steps.length} step${d.steps.length === 1 ? '' : 's'} · ${when(d.updatedAt)}</small></div><button type="button" class="card-delete" data-delete="${d.id}" title="Delete demo" aria-label="Delete demo"><svg class="i"><use href="#i-trash"/></svg></button>`;
    card.querySelector('strong').textContent = d.title;
    grid.append(card);
  }
}
async function openDemo(id) {
  const raw = await loadDemo(id);
  if (!raw) return toast('That demo could not be found.');
  state.demo = validateDemo(raw); state.selected = state.demo.steps[0]?.id || null; state.tab = state.demo.steps.length ? 'step' : 'add';
  $('#view-library').hidden = true; $('#view-editor').hidden = false;
  renderEditor();
}
function preferredLanguage() { try { return localStorage.getItem('rekko-language') || 'en'; } catch { return 'en'; } }
async function newDemo() {
  const demo = createDemo('', preferredLanguage());
  await saveDemo(demo);
  await openDemo(demo.id);
  $('#demo-title').focus(); $('#demo-title').select();
}

// ---------- Estado y guardado ----------
function update(demo, { silent = false } = {}) {
  state.demo = demo;
  if (!silent) renderEditor();
  $('#save-state').textContent = 'Saving…';
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => { try { await saveDemo(state.demo); $('#save-state').textContent = 'Saved'; } catch (e) { $('#save-state').textContent = 'Could not save'; toast(e.name === 'QuotaExceededError' ? 'The browser is out of space. Remove some steps or demos.' : e.message); } }, 350);
}
const selectedStep = () => state.demo?.steps.find(s => s.id === state.selected) || null;

// ---------- Editor ----------
function renderEditor() {
  const d = state.demo; if (!d) return;
  if (!d.steps.some(s => s.id === state.selected)) state.selected = d.steps[0]?.id || null;
  $('#demo-title').value = d.title;
  $('#steps-count').textContent = d.steps.length;
  // Lista de pasos
  const list = $('#step-list'); list.innerHTML = '';
  d.steps.forEach((s, i) => {
    const li = document.createElement('li'); li.className = `step-item ${s.id === state.selected ? 'selected' : ''}`; li.dataset.step = s.id; li.draggable = true;
    li.innerHTML = `<img alt="Step ${i + 1}"><span class="num">${i + 1}</span><span class="dot ${s.hotspot ? '' : 'none'}" title="${s.hotspot ? 'Has a click area' : 'No click area'}"></span><div class="tools tools-left"><button type="button" data-edit title="Edit screen" aria-label="Edit screen of step ${i + 1}"><svg class="i"><use href="#i-pencil"/></svg></button><button type="button" class="danger" data-remove title="Remove step" aria-label="Remove step ${i + 1}"><svg class="i"><use href="#i-trash"/></svg></button></div><div class="tools"><button type="button" data-up title="Move up" aria-label="Move step up"><svg class="i"><use href="#i-up"/></svg></button><button type="button" data-down title="Move down" aria-label="Move step down"><svg class="i"><use href="#i-down"/></svg></button></div>`;
    li.querySelector('img').src = urlFor(s);
    list.append(li);
  });
  // Lienzo
  const step = selectedStep();
  $('#canvas-empty').hidden = !!step; $('#canvas').hidden = !step; $('#canvas-hint').hidden = !step; $('#step-panel').hidden = !step; $('#step-empty').hidden = !!step; $('#canvas-edit').hidden = !step;
  if (step) {
    const img = $('#canvas-image');
    const src = urlFor(step); if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
    img.onload = layoutOverlay; layoutOverlay();
    $('#tip-title').value = step.tooltip.title; $('#tip-text').value = step.tooltip.text; $('#tip-placement').value = step.tooltip.placement;
    $('#advance-hotspot').checked = step.advance === 'hotspot'; $('#advance-button').checked = step.advance === 'button';
    $('#advance-hotspot').disabled = !step.hotspot; $('#hotspot-clear').disabled = !step.hotspot;
    $('#step-label').textContent = `Step ${d.steps.indexOf(step) + 1} of ${d.steps.length}`;
    $('#screen-edits').textContent = describeEdits(step.edits) || 'Original screenshot';
    $('#screen-restore').hidden = !step.original;
  }
  // Estilo y final
  $('#language').value = demoLanguage(d); $('#accent').value = d.theme.accent; $('#background').value = d.theme.background; $('#show-progress').checked = d.settings.showProgress;
  $('#final-title').value = d.settings.finalTitle; $('#final-text').value = d.settings.finalText; $('#final-link').value = d.settings.finalLink; $('#final-link-label').value = d.settings.finalLinkLabel;
  $('#embed-code').value = embedSnippet(`${slug(d.title)}.html`, d.title);
  $('#capture-start').hidden = !!state.capture; $('#capture-live').hidden = !state.capture;
  $('#capture-float').hidden = !canFloat();
  $('#remote-status').textContent = state.remote ? `Connected: ${state.remote.title}${state.capture ? ' · capturing on every click' : ' · share that tab to start'}` : 'No page connected.';
  $('#rec-chip').hidden = !state.capture;
  $('#capture-tab-warning').hidden = state.capture?.surface !== 'browser' || !!state.remote;
  applyTab();
}

// Panel tabs: Step, Add and Design.
// Without steps the Step tab has nothing to edit, so it is hidden and Add takes its place.
function applyTab() {
  const noSteps = !state.demo?.steps.length;
  $('#tab-step').hidden = noSteps;
  if (noSteps && state.tab === 'step') state.tab = 'add';
  document.querySelectorAll('[role=tab]').forEach(t => { const on = t.dataset.tab === state.tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  document.querySelectorAll('[role=tabpanel]').forEach(p => { p.hidden = p.id !== `pane-${state.tab}`; });
}
function setTab(name) { state.tab = name; applyTab(); }

// Superposición sobre la imagen: misma caja que la imagen mostrada.
function layoutOverlay() {
  const img = $('#canvas-image'), canvas = $('#canvas'), overlay = $('#overlay');
  if (!img.naturalWidth) return;
  const r = img.getBoundingClientRect(), c = canvas.getBoundingClientRect();
  Object.assign(overlay.style, { left: `${r.left - c.left}px`, top: `${r.top - c.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  drawHotspot();
}
function drawHotspot() {
  const step = selectedStep(), box = $('#hotspot'), ghost = $('#tooltip-ghost'), overlay = $('#overlay');
  const h = step?.hotspot;
  box.hidden = !h; ghost.hidden = !h;
  if (!h) return;
  const W = overlay.clientWidth, H = overlay.clientHeight;
  Object.assign(box.style, { left: `${h.x * W}px`, top: `${h.y * H}px`, width: `${h.w * W}px`, height: `${h.h * H}px` });
  ghost.innerHTML = `${step.tooltip.title ? `<strong>${esc(step.tooltip.title)}</strong>` : ''}${esc(step.tooltip.text || '')}`;
  const pos = placeTooltip({ hotspot: h, image: { x: 0, y: 0, w: W, h: H }, tooltip: { w: ghost.offsetWidth, h: ghost.offsetHeight }, box: { w: W, h: H }, placement: step.tooltip.placement, gap: 10, margin: 4 });
  ghost.style.left = `${pos.x}px`; ghost.style.top = `${pos.y}px`;
}
// Dibujar, mover y redimensionar la zona con el puntero.
let gesture = null;
function overlayPoint(e) { const r = $('#overlay').getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; }
function onOverlayDown(e) {
  const step = selectedStep(); if (!step || e.button !== 0) return;
  e.preventDefault(); $('#overlay').setPointerCapture(e.pointerId);
  const p = overlayPoint(e), h = step.hotspot;
  if (e.target.dataset.handle && h) gesture = { kind: 'resize', origin: { x: h.x, y: h.y } };
  else if (h && pointInHotspot(p, h)) gesture = { kind: 'move', start: p, from: { ...h } };
  else gesture = { kind: 'draw', start: p };
  gesture.moved = false;
}
function onOverlayMove(e) {
  if (!gesture) return;
  const p = overlayPoint(e), step = selectedStep(); if (!step) return;
  gesture.moved = true;
  let h;
  if (gesture.kind === 'draw') h = rectFromDrag(gesture.start, p);
  else if (gesture.kind === 'move') h = normalizeHotspot({ ...gesture.from, x: gesture.from.x + (p.x - gesture.start.x), y: gesture.from.y + (p.y - gesture.start.y) });
  else h = normalizeHotspot({ x: gesture.origin.x, y: gesture.origin.y, w: p.x - gesture.origin.x, h: p.y - gesture.origin.y });
  state.demo = setHotspot(state.demo, step.id, h); drawHotspot();
}
function onOverlayUp(e) {
  if (!gesture) return;
  const g = gesture; gesture = null;
  const step = selectedStep(); if (!step) return;
  if (g.kind === 'draw' && !g.moved) {
    // Un toque sin arrastrar crea una zona pequeña centrada ahí, cómoda para botones.
    const p = overlayPoint(e); const r = $('#overlay').getBoundingClientRect(); const w = clamp(120 / r.width, .03, .5), hh = clamp(44 / r.height, .03, .5);
    update(setHotspot(state.demo, step.id, { x: p.x - w / 2, y: p.y - hh / 2, w, h: hh }));
  } else update(state.demo);
}

// ---------- Agregar pantallas ----------
async function addImages(images, { select = true, hotspot = null, tooltip = null, quiet = false } = {}) {
  let demo = state.demo, added = 0;
  for (const image of images) {
    const before = demo.steps.length; demo = addStep(demo, image);
    if (demo.steps.length === before) continue;
    added += 1;
    const id = demo.steps[demo.steps.length - 1].id;
    if (hotspot) demo = setHotspot(demo, id, hotspot);
    if (tooltip) demo = updateStep(demo, id, { tooltip });
  }
  if (!added) return toast('No screens were added.');
  state.shots += added; state.floating?.setCount(state.shots);
  if (select) state.selected = demo.steps[demo.steps.length - 1].id;
  if (!state.capture && state.tab === 'add') state.tab = 'step';
  update(demo);
  if (!quiet) toast(added === 1 ? 'Screen added' : `${added} screens added`);
}
async function addFiles(files) {
  const images = [];
  for (const f of files) { try { images.push(await imageFromFile(f)); } catch (e) { toast(e.message); } }
  if (images.length) await addImages(images);
}
async function beginCapture(opts) {
  if (!canCapture()) return toast('This browser can’t share the screen. Use Chrome, Edge or Safari on a computer.');
  try { state.capture = await startCapture(); }
  catch (e) { if (e?.name !== 'NotAllowedError') toast(e.message || 'Could not share the screen.'); return; }
  $('#capture-label').textContent = `Sharing: ${state.capture.label}`;
  state.shots = 0;
  state.capture.ended.then(() => { if (state.capture) { const n = state.shots; stopCapture(); toast(n ? 'Screen sharing stopped.' : emptyCaptureMsg, n ? 2500 : 7000); renderEditor(); } });
  // Primera captura de lo que se compartió, para que nunca termine vacío.
  if (opts?.firstShot !== false) { try { await addCaptured(await state.capture.shot(), { quiet: true }); } catch { } }
  else { try { await state.capture.shot(); } catch { } } // solo para tener la referencia del próximo recuadro
  if ($('#auto-change').checked) startAutoChange();
  if (state.remote) { state.remote.source.postMessage({ rekko: 1, type: 'ready', sharing: true }, '*'); }
  renderEditor();
  if (state.capture.surface === 'browser' && !opts?.keepTab) return offerWindowShare();
  if (state.remote) toast(`Sharing. Go back to “${state.remote.title}”: every click will capture.`, 4000);
  else if (canFloat()) toast('Press “Floating button” to capture without coming back to this tab.', 4000);
}
// Una sola pestaña compartida no sigue a las pestañas nuevas (Chrome no lo permite desde una página).
// Se avisa de frente y se ofrece volver a compartir, ahora la ventana completa, sin perder lo ya capturado.
function offerWindowShare() {
  const dialog = $('#tab-dialog');
  $('#tab-dialog-name').textContent = state.capture?.label?.replace(/^(tab|pestaña):\s*/i, '') || 'this tab';
  if (typeof dialog.showModal !== 'function') { toast('You are sharing a single tab. If your app opens another tab, Rekko won’t see it. Use “Share the whole window instead”.', 8000); return; }
  dialog.showModal();
}
function closeTabDialog() { const d = $('#tab-dialog'); if (d.open) d.close(); }
// Al compartir pantalla no vemos los clics. Marcamos en la pantalla anterior la zona que cambió:
// suele ser donde se hizo clic (un menú que se abre, un botón que cambia). Si ya tiene recuadro, no se toca.
function markPreviousFromChange(box) {
  if (!box || !state.demo) return;
  const prev = state.demo.steps[state.demo.steps.length - 1];
  if (!prev || prev.hotspot) return;
  update(setHotspot(state.demo, prev.id, box), { silent: true });
  labelFromScreen(prev.id, box);
}
// Lee el texto del botón marcado y escribe el globo como la extensión («Haz clic en …»). Si el usuario ya cambió el texto, no lo toca.
async function labelFromScreen(id, box) {
  try {
    const step = state.demo.steps.find(s => s.id === id); if (!step) return;
    const blob = step.image.blob || (step.image.dataUrl ? await dataUrlToBlob(step.image.dataUrl) : null); if (!blob) return;
    const label = await readLabel(blob, box); if (!label || !state.demo) return;
    const now = state.demo.steps.find(s => s.id === id), t = strings(demoLanguage(state.demo));
    if (!now || (now.tooltip.text && now.tooltip.text !== t.clickHere)) return;
    update(updateStep(state.demo, id, { tooltip: { ...now.tooltip, text: t.clickOn(label) } }), { silent: state.selected !== id });
  } catch { }
}
async function addCaptured(image, opts) {
  const box = image.changeBox; delete image.changeBox;
  markPreviousFromChange(box);
  await addImages([image], opts);
}
async function takeShot() {
  if (!state.capture) return;
  try { await addCaptured(await state.capture.shot()); } catch (e) { toast(e.message); }
}
async function openFloat() {
  if (!state.capture) return;
  try { state.floating = await openFloatingButton({ accent: state.demo.theme.accent, onShot: takeShot, onClose: () => { state.floating = null; } }); }
  catch (e) { toast('Could not open the floating button: ' + (e.message || e)); }
}
const emptyCaptureMsg = 'No screens were captured. Sharing doesn’t record video: press Capture now, use the floating button or keep “Capture automatically” on.';
function stopCapture() { state.floating?.close(); state.floating = null; state.capture?.stop(); state.capture = null; }
function startAutoChange() {
  if (!state.capture) return;
  state.capture.startWatching(image => addCaptured(image, { quiet: true }), $('#auto-sensitivity').value);
  $('#auto-sensitivity-field').hidden = false;
}
function stopAutoChange() { state.capture?.stopWatching(); $('#auto-sensitivity-field').hidden = true; }
// Mensajes de páginas conectadas con el marcador «Rekko clics».
async function onRemoteMessage(e) {
  const d = e.data; if (!d || d.rekko !== 1 || !e.source) return;
  if (d.type === 'hello') {
    const same = state.remote && state.remote.source === e.source && state.remote.href === d.href;
    state.remote = { source: e.source, title: d.title || d.href || 'page', href: d.href };
    if (same) { e.source.postMessage({ rekko: 1, type: 'ready', sharing: !!state.capture }, '*'); renderEditor(); return; }
    if (!state.demo) { const demo = createDemo(String(d.title || '').slice(0, 80), preferredLanguage()); await saveDemo(demo); await openDemo(demo.id); }
    $('#bookmarklet-box').open = true; state.tab = 'add'; renderEditor();
    e.source.postMessage({ rekko: 1, type: 'ready', sharing: !!state.capture }, '*');
    if (d.child && state.capture?.surface === 'browser') toast(`Your page opened another tab (“${state.remote.title}”). You are sharing a single tab, so Rekko still sees the previous one. In Chrome’s bar press “Share this tab instead”, or share the whole window.`, 9000);
    else if (d.child) toast(`New tab connected: “${state.remote.title}”. Its clicks capture too.`, 4000);
    else toast(state.capture ? `Connected to “${state.remote.title}”. Every click will capture.` : `Connected to “${state.remote.title}”. Now share that tab with “Share window and capture”.`, 5000);
    return;
  }
  if (d.type === 'click' && state.capture && state.demo) {
    const hotspot = hotspotFromMessage(d, state.capture.surface);
    try {
      const image = await state.capture.shot({ before: 150 }); delete image.changeBox;
      await addImages([image], { hotspot, tooltip: { text: tooltipFor(d, demoLanguage(state.demo)) }, quiet: true });
      e.source.postMessage({ rekko: 1, type: 'captured', count: state.shots }, '*');
    } catch (err) { toast(err.message); }
  }
}

function saveScreen({ stepId, image, original, edits }) {
  if (!state.demo?.steps.some(s => s.id === stepId)) return;
  const before = state.demo.steps.find(s => s.id === stepId).hotspot;
  const demo = setStepScreen(state.demo, stepId, { image, original, edits });
  const after = demo.steps.find(s => s.id === stepId).hotspot;
  update(demo);
  toast(before && !after ? 'Screen saved. The click area was outside the crop, so it was removed.' : 'Screen saved');
}

// ---------- Modo noche ----------
// Claro por defecto; la elección se recuerda en este navegador.
function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-switch').setAttribute('aria-checked', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1020' : '#f5f6fb');
}
function initTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark');
  $('#theme-switch').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    applyTheme(dark);
    try { localStorage.setItem('rekko-theme', dark ? 'dark' : 'light'); } catch { }
  });
}

// ---------- Extensión Rekko Recorder ----------
const extPost = type => window.postMessage({ rekkoApp: 1, type }, location.origin);
function renderExt() { document.querySelectorAll('[data-ext]').forEach(el => { el.hidden = (el.dataset.ext === 'on') !== !!state.ext; }); }
function onExtMessage(e) {
  const d = e.data;
  if (e.source !== window || !d || d.rekkoExt !== 1) return;
  if (d.type === 'present') {
    state.ext = d.version || true; renderExt();
    if (location.hash === '#import-recording') { history.replaceState(null, '', location.pathname); extPost('pull'); }
  } else if (d.type === 'recording') importRecording(d.recording);
}
async function importRecording(rec) {
  if (!rec?.steps?.length) return toast('There is no recording to import. Start one from the Rekko icon in Chrome’s toolbar.', 4500);
  if (state.importing) return; state.importing = true;
  try {
    const language = preferredLanguage();
    let demo = createDemo(String(rec.title || '').slice(0, 80), language);
    for (const item of stepsFromRecording(rec, language)) {
      try {
        const before = demo.steps.length;
        demo = addStep(demo, await normalizeImage(await loadBitmap(item.dataUrl)));
        if (demo.steps.length === before) continue;
        const id = demo.steps[demo.steps.length - 1].id;
        if (item.hotspot) demo = setHotspot(demo, id, item.hotspot);
        demo = updateStep(demo, id, { tooltip: { text: item.text } });
      } catch { }
    }
    if (!demo.steps.length) return toast('Could not read the recording.');
    await saveDemo(demo);
    extPost('imported');
    await openDemo(demo.id);
    toast(`New demo with ${demo.steps.length} step${demo.steps.length === 1 ? '' : 's'} from “${demo.title}”`, 4000);
  } catch (e) { toast('Could not import the recording: ' + (e.message || e)); }
  finally { state.importing = false; }
}

// ---------- Vista previa y exportación ----------
async function playable() { const urls = await Promise.all(state.demo.steps.map(s => s.image.dataUrl || blobToDataUrl(s.image.blob))); return { demo: playableDemo(state.demo, urls), urls }; }
async function openPreview() {
  if (!state.demo.steps.length) return toast('Add at least one screen.');
  const { demo } = await playable();
  $('#preview-modal').hidden = false; $('#preview-title').textContent = demo.title;
  state.player?.destroy();
  const start = Math.max(0, state.demo.steps.findIndex(s => s.id === state.selected));
  state.player = mountPlayer($('#preview-player'), demo, { startAt: start, onStep: (i, n) => $('#preview-count').textContent = i >= n ? 'End' : `Step ${i + 1} of ${n}` });
  $('#preview-player').focus();
}
function closePreview() { $('#preview-modal').hidden = true; state.player?.destroy(); state.player = null; }
async function exportHtml() {
  if (!state.demo.steps.length) return toast('Add at least one screen.');
  const button = $('#export-html'); button.disabled = true;
  try {
    const [{ demo }, playerSource, modelSource] = await Promise.all([playable(), fetch('./player.mjs').then(r => r.text()), fetch('./model.mjs').then(r => r.text())]);
    const html = buildHtml({ demo, playerSource, playerCss: PLAYER_CSS, modelSource });
    download(new Blob([html], { type: 'text/html' }), `${slug(state.demo.title)}.html`);
    toast(`Done: ${slug(state.demo.title)}.html · ${(html.length / 1048576).toFixed(1)} MB`);
  } catch (e) { toast(e.message || 'Could not export.'); } finally { button.disabled = false; }
}
async function exportJson() {
  const { urls } = await playable();
  const originals = await Promise.all(state.demo.steps.map(s => s.original ? (s.original.dataUrl || blobToDataUrl(s.original.blob)) : null));
  download(new Blob([backupJson(state.demo, urls, originals)], { type: 'application/json' }), `${slug(state.demo.title)}.rekko.json`);
}
async function importJson(file) {
  try {
    const raw = JSON.parse(await file.text());
    const demo = validateDemo(raw); demo.id = newId('demo');
    for (const s of demo.steps) for (const im of [s.image, s.original]) { if (im?.dataUrl && !im.blob) { im.blob = await dataUrlToBlob(im.dataUrl); im.dataUrl = null; } }
    await saveDemo(demo); toast(`Imported “${demo.title}” with ${demo.steps.length} steps`); await showLibrary();
  } catch (e) { toast('Could not import: ' + (e.message || e)); }
}

// ---------- Enlaces ----------
function init() {
  const style = document.createElement('style'); style.textContent = PLAYER_CSS; document.head.append(style);
  $('#demo-new').addEventListener('click', newDemo);
  $('#demo-grid').addEventListener('click', async e => {
    const del = e.target.closest('[data-delete]');
    if (del) { e.stopPropagation(); const title = del.closest('.demo-card').querySelector('strong').textContent; if (!confirm(`Delete “${title}”? This can’t be undone. To keep it, download its HTML from the editor first.`)) return; await deleteDemo(del.dataset.delete); toast('Demo deleted'); return showLibrary(); }
    const c = e.target.closest('[data-open]'); if (c) openDemo(c.dataset.open);
  });
  $('#demo-grid').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open]')) { e.preventDefault(); openDemo(e.target.dataset.open); } });
  $('#back').addEventListener('click', showLibrary);
  $('#demo-title').addEventListener('change', e => update(setTitle(state.demo, e.target.value)));
  $('#preview').addEventListener('click', openPreview);
  $('#preview-close').addEventListener('click', closePreview);
  $('#export-html').addEventListener('click', exportHtml);
  $('#demo-delete').addEventListener('click', async () => { if (!confirm(`Delete “${state.demo.title}”? This can’t be undone.`)) return; await deleteDemo(state.demo.id); toast('Demo deleted'); showLibrary(); });
  // Pasos
  const list = $('#step-list'); let dragId = null;
  list.addEventListener('click', e => {
    const li = e.target.closest('[data-step]'); if (!li) return;
    const id = li.dataset.step, i = state.demo.steps.findIndex(s => s.id === id);
    if (e.target.closest('[data-up]')) return update(moveStep(state.demo, id, i - 1));
    if (e.target.closest('[data-down]')) return update(moveStep(state.demo, id, i + 1));
    if (e.target.closest('[data-remove]')) return removeWithUndo(id);
    if (e.target.closest('[data-edit]')) { state.selected = id; state.tab = 'step'; renderEditor(); return editScreen(); }
    state.selected = id; state.tab = 'step'; renderEditor();
  });
  list.addEventListener('dragstart', e => { const li = e.target.closest('[data-step]'); if (!li) return; dragId = li.dataset.step; e.dataTransfer.effectAllowed = 'move'; });
  list.addEventListener('dragover', e => { const li = e.target.closest('[data-step]'); if (!li || !dragId) return; e.preventDefault(); list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); li.classList.add('drag-over'); });
  list.addEventListener('dragleave', e => e.target.closest?.('[data-step]')?.classList.remove('drag-over'));
  list.addEventListener('drop', e => { const li = e.target.closest('[data-step]'); if (!li || !dragId) return; e.preventDefault(); const to = state.demo.steps.findIndex(s => s.id === li.dataset.step); update(moveStep(state.demo, dragId, to)); dragId = null; });
  list.addEventListener('dragend', () => { dragId = null; list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); });
  // Removing a step is one click, so it can be undone from the message that confirms it.
  const removeWithUndo = id => {
    const before = state.demo, n = before.steps.findIndex(s => s.id === id) + 1;
    if (!n) return;
    update(removeStep(before, id));
    toast(`Step ${n} removed`, 6000, { label: 'Undo', run: () => { if (state.demo?.id !== before.id) return; state.selected = id; update(before); } });
  };
  $('#step-delete').addEventListener('click', () => { const s = selectedStep(); if (s) removeWithUndo(s.id); });
  $('#step-duplicate').addEventListener('click', () => { const s = selectedStep(); if (!s) return; const before = state.demo.steps.length; const next = duplicateStep(state.demo, s.id); if (next.steps.length > before) state.selected = next.steps[before === next.steps.length ? before : state.demo.steps.indexOf(s) + 1].id; update(next); });
  $('#hotspot-clear').addEventListener('click', () => { const s = selectedStep(); if (s) update(setHotspot(state.demo, s.id, null)); });
  // Zona de clic
  const overlay = $('#overlay');
  overlay.addEventListener('pointerdown', onOverlayDown); overlay.addEventListener('pointermove', onOverlayMove); overlay.addEventListener('pointerup', onOverlayUp); overlay.addEventListener('pointercancel', () => { gesture = null; });
  new ResizeObserver(layoutOverlay).observe($('#canvas'));
  // Globo
  $('#tip-title').addEventListener('input', e => { const s = selectedStep(); if (s) { update(updateStep(state.demo, s.id, { tooltip: { title: e.target.value } }), { silent: true }); drawHotspot(); } });
  $('#tip-text').addEventListener('input', e => { const s = selectedStep(); if (s) { update(updateStep(state.demo, s.id, { tooltip: { text: e.target.value } }), { silent: true }); drawHotspot(); } });
  $('#tip-placement').addEventListener('change', e => { const s = selectedStep(); if (s) update(updateStep(state.demo, s.id, { tooltip: { placement: e.target.value } })); });
  document.querySelectorAll('input[name="advance"]').forEach(r => r.addEventListener('change', e => { const s = selectedStep(); if (s) update(updateStep(state.demo, s.id, { advance: e.target.value })); }));
  // Estilo y final
  $('#language').addEventListener('change', e => { update(setLanguage(state.demo, e.target.value)); try { localStorage.setItem('rekko-language', e.target.value); } catch { } toast(e.target.value === 'en' ? 'Generated text switched to English.' : 'Generated text switched to Spanish.'); });
  $('#accent').addEventListener('input', e => update(updateTheme(state.demo, { accent: e.target.value }), { silent: true }));
  $('#background').addEventListener('input', e => update(updateTheme(state.demo, { background: e.target.value }), { silent: true }));
  $('#show-progress').addEventListener('change', e => update(updateSettings(state.demo, { showProgress: e.target.checked }), { silent: true }));
  for (const [id, key] of [['final-title', 'finalTitle'], ['final-text', 'finalText'], ['final-link', 'finalLink'], ['final-link-label', 'finalLinkLabel']]) $(`#${id}`).addEventListener('input', e => update(updateSettings(state.demo, { [key]: e.target.value }), { silent: true }));
  $('#embed-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#embed-code').value); toast('Code copied'); } catch { $('#embed-code').select(); toast('Select the code and copy it with ⌘C'); } });
  // Captura y subida
  $('#capture-start').addEventListener('click', beginCapture);
  // Cambiar a ventana completa sin perder lo capturado: la nueva sesión sigue agregando pasos a la misma demo.
  $('#capture-window').addEventListener('click', () => { stopCapture(); renderEditor(); beginCapture({ firstShot: false }); });
  $('#tab-dialog-window').addEventListener('click', () => { closeTabDialog(); stopCapture(); renderEditor(); beginCapture({ firstShot: false }); });
  $('#tab-dialog-keep').addEventListener('click', () => { closeTabDialog(); toast('Keeping this tab. If your app opens another tab, press “Share the whole window instead” in the Add panel.', 6000); });
  $('#tab-dialog').addEventListener('cancel', e => { e.preventDefault(); closeTabDialog(); });
  $('#capture-shot').addEventListener('click', takeShot);
  $('#capture-float').addEventListener('click', openFloat);
  $('#capture-stop').addEventListener('click', () => { const n = state.shots; stopCapture(); renderEditor(); toast(n ? `${n} screen${n === 1 ? '' : 's'} captured.` : emptyCaptureMsg, n ? 2500 : 7000); });
  $('#auto-change').addEventListener('change', e => e.target.checked ? startAutoChange() : stopAutoChange());
  $('#auto-sensitivity').addEventListener('change', () => { if ($('#auto-change').checked) startAutoChange(); });
  $('#bookmarklet-link').href = bookmarkletCode(location.origin + location.pathname);
  $('#bookmarklet-link').addEventListener('click', e => { e.preventDefault(); toast('Drag this button to your bookmarks bar. Don’t click it here.', 3500); });
  window.addEventListener('message', onRemoteMessage);
  window.addEventListener('message', onExtMessage);
  initTheme();
  renderExt(); extPost('hello');
  document.querySelectorAll('[data-copy]').forEach(el => { el.title = 'Click to copy'; el.addEventListener('click', async () => { try { await navigator.clipboard.writeText(el.dataset.copy); toast('Copied. Paste it in Chrome’s address bar.'); } catch { } }); });
  if (location.hash === '#conectar') { history.replaceState(null, '', location.pathname); toast('A page wants to connect. If no notice appears, click the “Rekko clicks” bookmark again on that page.', 5000); }
  $('#upload').addEventListener('click', () => $('#upload-files').click());
  $('#upload-files').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  const area = $('#canvas-area');
  area.addEventListener('dragover', e => { if (state.demo && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); area.classList.add('drop'); } });
  area.addEventListener('dragleave', () => area.classList.remove('drop'));
  area.addEventListener('drop', e => { area.classList.remove('drop'); if (!state.demo) return; e.preventDefault(); addFiles([...e.dataTransfer.files]); });
  document.addEventListener('paste', e => {
    if (!state.demo || screenEditorOpen() || $('#view-editor').hidden || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  document.addEventListener('keydown', e => {
    if (screenEditorOpen()) return;
    if (!$('#preview-modal').hidden) { if (e.key === 'Escape') closePreview(); return; }
    if (e.key === 'Escape' && $('#more-menu').open) { $('#more-menu').open = false; $('#more-menu summary').focus(); return; }
    if (e.target.closest?.('[role=tablist], .menu')) return;
    if (!state.demo || $('#view-editor').hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const i = state.demo.steps.findIndex(s => s.id === state.selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { if (i < state.demo.steps.length - 1) { state.selected = state.demo.steps[i + 1].id; renderEditor(); } e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { if (i > 0) { state.selected = state.demo.steps[i - 1].id; renderEditor(); } e.preventDefault(); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { const s = selectedStep(); if (s?.hotspot) { update(setHotspot(state.demo, s.id, null)); e.preventDefault(); } }
  });
  // Panel tabs and "More" menu
  const allTabs = [...document.querySelectorAll('[role=tab]')];
  allTabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('.tabs').addEventListener('keydown', e => {
    const tabs = allTabs.filter(t => !t.hidden);
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (j < 0) return; e.preventDefault(); setTab(tabs[j].dataset.tab); tabs[j].focus();
  });
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.goto)));
  $('#add-screens').addEventListener('click', () => setTab('add'));
  $('#rec-chip').addEventListener('click', () => setTab('add'));
  const menu = $('#more-menu');
  document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  menu.querySelectorAll('.menu-item').forEach(b => b.addEventListener('click', () => { menu.open = false; }));
  // Edit screen
  initScreenEditor();
  const editScreen = () => { const s = selectedStep(); if (s) openScreenEditor(s, { onSave: saveScreen, onError: e => toast(e.message || 'Could not open the screen.') }); };
  $('#screen-edit').addEventListener('click', editScreen);
  $('#canvas-edit').addEventListener('click', editScreen);
  $('#screen-restore').addEventListener('click', () => {
    const s = selectedStep(); if (!s?.original) return;
    update(setStepScreen(state.demo, s.id, { image: s.original, original: s.original, edits: null })); toast('Original screen restored');
  });
  window.addEventListener('beforeunload', () => stopCapture());
  showLibrary();
}
init();
