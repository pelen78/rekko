// Rekko · Interfaz: biblioteca de demos, editor de pasos y vista previa.
import { createDemo, addStep, removeStep, moveStep, duplicateStep, updateStep, setHotspot, rectFromDrag, normalizeHotspot, pointInHotspot, fitRect, placeTooltip, setTitle, updateSettings, updateTheme, validateDemo, playableDemo, clamp, newId } from './model.mjs';
import { saveDemo, loadDemo, deleteDemo, listDemos } from './store.mjs';
import { imageFromFile, blobToDataUrl, dataUrlToBlob, stepSrc } from './images.mjs';
import { canCapture, canFloat, startCapture, openFloatingButton } from './capture.mjs';
import { mountPlayer, PLAYER_CSS } from './player.mjs';
import { buildHtml, embedSnippet, slug, backupJson } from './export.mjs';
import { hotspotFromMessage, tooltipFor, bookmarkletCode } from './remote.mjs';

const $ = s => document.querySelector(s);
const state = { demo: null, selected: null, capture: null, floating: null, player: null, saveTimer: null, urls: new Map(), shots: 0, remote: null };

function toast(message, ms = 2800) { const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, ms); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = ts => new Date(ts).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
function urlFor(step) { if (step.image.dataUrl) return step.image.dataUrl; let u = state.urls.get(step.id); if (!u) { u = URL.createObjectURL(step.image.blob); state.urls.set(step.id, u); } return u; }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }

// ---------- Biblioteca ----------
async function showLibrary() {
  stopCapture();
  $('#view-editor').hidden = true; $('#view-library').hidden = false;
  state.demo = null; state.selected = null;
  const demos = await listDemos().catch(e => { toast(e.message); return []; });
  $('#demo-count').textContent = demos.length;
  const grid = $('#demo-grid');
  grid.innerHTML = demos.length ? '' : '<div class="demo-empty">Todavía no hay demos. Crea la primera con «Nueva demo».</div>';
  for (const d of demos) {
    const card = document.createElement('div'); card.className = 'demo-card'; card.dataset.open = d.id; card.tabIndex = 0; card.setAttribute('role', 'button');
    const first = d.steps[0];
    const thumb = first ? `style="background-image:url('${first.image.dataUrl || URL.createObjectURL(first.image.blob)}')"` : '';
    card.innerHTML = `<div class="thumb" ${thumb}>${first ? '' : 'Sin pantallas'}</div><div class="meta"><strong></strong><small>${d.steps.length} paso${d.steps.length === 1 ? '' : 's'} · ${when(d.updatedAt)}</small></div><button type="button" class="card-delete" data-delete="${d.id}" title="Eliminar demo" aria-label="Eliminar demo">🗑</button>`;
    card.querySelector('strong').textContent = d.title;
    grid.append(card);
  }
}
async function openDemo(id) {
  const raw = await loadDemo(id);
  if (!raw) return toast('No se encontró esa demo.');
  state.demo = validateDemo(raw); state.selected = state.demo.steps[0]?.id || null;
  $('#view-library').hidden = true; $('#view-editor').hidden = false;
  renderEditor();
}
async function newDemo() {
  const demo = createDemo('Demo sin título');
  await saveDemo(demo);
  await openDemo(demo.id);
  $('#demo-title').focus(); $('#demo-title').select();
}

// ---------- Estado y guardado ----------
function update(demo, { silent = false } = {}) {
  state.demo = demo;
  if (!silent) renderEditor();
  $('#save-state').textContent = 'Guardando…';
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => { try { await saveDemo(state.demo); $('#save-state').textContent = 'Guardado'; } catch (e) { $('#save-state').textContent = 'No se pudo guardar'; toast(e.name === 'QuotaExceededError' ? 'El navegador no tiene más espacio. Descarga un respaldo y quita pasos.' : e.message); } }, 350);
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
    li.innerHTML = `<img alt="Paso ${i + 1}"><span class="num">${i + 1}</span><span class="dot ${s.hotspot ? '' : 'none'}" title="${s.hotspot ? 'Con zona de clic' : 'Sin zona de clic'}"></span><div class="tools"><button type="button" data-up title="Subir">↑</button><button type="button" data-down title="Bajar">↓</button></div>`;
    li.querySelector('img').src = urlFor(s);
    list.append(li);
  });
  // Lienzo
  const step = selectedStep();
  $('#canvas-empty').hidden = !!step; $('#canvas').hidden = !step; $('#canvas-hint').hidden = !step; $('#step-panel').hidden = !step;
  if (step) {
    const img = $('#canvas-image');
    if (img.dataset.step !== step.id) { img.src = urlFor(step); img.dataset.step = step.id; }
    img.onload = layoutOverlay; layoutOverlay();
    $('#tip-title').value = step.tooltip.title; $('#tip-text').value = step.tooltip.text; $('#tip-placement').value = step.tooltip.placement;
    $('#advance-hotspot').checked = step.advance === 'hotspot'; $('#advance-button').checked = step.advance === 'button';
    $('#advance-hotspot').disabled = !step.hotspot; $('#hotspot-clear').disabled = !step.hotspot;
  }
  // Estilo y final
  $('#accent').value = d.theme.accent; $('#background').value = d.theme.background; $('#show-progress').checked = d.settings.showProgress;
  $('#final-title').value = d.settings.finalTitle; $('#final-text').value = d.settings.finalText; $('#final-link').value = d.settings.finalLink; $('#final-link-label').value = d.settings.finalLinkLabel;
  $('#embed-code').value = embedSnippet(`${slug(d.title)}.html`, d.title);
  $('#capture-start').hidden = !!state.capture; $('#capture-live').hidden = !state.capture;
  $('#capture-float').hidden = !canFloat();
  $('#remote-status').textContent = state.remote ? `Conectada: ${state.remote.title}${state.capture ? ' · capturando en cada clic' : ' · falta compartir esa pestaña'}` : 'Ninguna página conectada.';
}

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
  if (!added) return toast('No se agregó ninguna pantalla.');
  state.shots += added; state.floating?.setCount(state.shots);
  if (select) state.selected = demo.steps[demo.steps.length - 1].id;
  update(demo);
  if (!quiet) toast(added === 1 ? 'Pantalla agregada' : `${added} pantallas agregadas`);
}
async function addFiles(files) {
  const images = [];
  for (const f of files) { try { images.push(await imageFromFile(f)); } catch (e) { toast(e.message); } }
  if (images.length) await addImages(images);
}
async function beginCapture() {
  if (!canCapture()) return toast('Este navegador no permite compartir pantalla. Usa Chrome, Edge o Safari en una computadora.');
  try { state.capture = await startCapture(); }
  catch (e) { if (e?.name !== 'NotAllowedError') toast(e.message || 'No se pudo compartir la pantalla.'); return; }
  $('#capture-label').textContent = `Compartiendo: ${state.capture.label}`;
  state.shots = 0;
  state.capture.ended.then(() => { if (state.capture) { stopCapture(); toast('Se dejó de compartir la pantalla.'); renderEditor(); } });
  if ($('#auto-change').checked) startAutoChange();
  if (state.remote) { state.remote.source.postMessage({ rekko: 1, type: 'ready', sharing: true }, '*'); }
  renderEditor();
  if (state.remote) toast(`Compartiendo. Vuelve a «${state.remote.title}»: cada clic capturará.`, 4000);
  else if (canFloat()) toast('Pulsa «Botón flotante» para capturar sin volver a esta pestaña.', 4000);
}
async function takeShot() {
  if (!state.capture) return;
  try { await addImages([await state.capture.shot()]); } catch (e) { toast(e.message); }
}
async function openFloat() {
  if (!state.capture) return;
  try { state.floating = await openFloatingButton({ accent: state.demo.theme.accent, onShot: takeShot, onClose: () => { state.floating = null; } }); }
  catch (e) { toast('No se pudo abrir el botón flotante: ' + (e.message || e)); }
}
function stopCapture() { state.floating?.close(); state.floating = null; state.capture?.stop(); state.capture = null; }
function startAutoChange() {
  if (!state.capture) return;
  state.capture.startWatching(image => addImages([image], { quiet: true }), $('#auto-sensitivity').value);
  $('#auto-sensitivity-field').hidden = false;
}
function stopAutoChange() { state.capture?.stopWatching(); $('#auto-sensitivity-field').hidden = true; }
// Mensajes de páginas conectadas con el marcador «Rekko clics».
async function onRemoteMessage(e) {
  const d = e.data; if (!d || d.rekko !== 1 || !e.source) return;
  if (d.type === 'hello') {
    state.remote = { source: e.source, title: d.title || d.href || 'página', href: d.href };
    if (!state.demo) { const demo = createDemo(String(d.title || 'Demo').slice(0, 80)); await saveDemo(demo); await openDemo(demo.id); }
    $('#bookmarklet-box').open = true; renderEditor();
    e.source.postMessage({ rekko: 1, type: 'ready', sharing: !!state.capture }, '*');
    toast(state.capture ? `Conectado con «${state.remote.title}». Cada clic capturará.` : `Conectado con «${state.remote.title}». Ahora comparte esa pestaña con «Compartir ventana y capturar».`, 5000);
    return;
  }
  if (d.type === 'click' && state.capture && state.demo) {
    const hotspot = hotspotFromMessage(d, state.capture.surface);
    try {
      const image = await state.capture.shot({ before: 150 });
      await addImages([image], { hotspot, tooltip: { text: tooltipFor(d) }, quiet: true });
      e.source.postMessage({ rekko: 1, type: 'captured', count: state.shots }, '*');
    } catch (err) { toast(err.message); }
  }
}

// ---------- Vista previa y exportación ----------
async function playable() { const urls = await Promise.all(state.demo.steps.map(s => s.image.dataUrl || blobToDataUrl(s.image.blob))); return { demo: playableDemo(state.demo, urls), urls }; }
async function openPreview() {
  if (!state.demo.steps.length) return toast('Agrega al menos una pantalla.');
  const { demo } = await playable();
  $('#preview-modal').hidden = false; $('#preview-title').textContent = demo.title;
  state.player?.destroy();
  const start = Math.max(0, state.demo.steps.findIndex(s => s.id === state.selected));
  state.player = mountPlayer($('#preview-player'), demo, { startAt: start, onStep: (i, n) => $('#preview-count').textContent = i >= n ? 'Final' : `Paso ${i + 1} de ${n}` });
  $('#preview-player').focus();
}
function closePreview() { $('#preview-modal').hidden = true; state.player?.destroy(); state.player = null; }
async function exportHtml() {
  if (!state.demo.steps.length) return toast('Agrega al menos una pantalla.');
  const button = $('#export-html'); button.disabled = true;
  try {
    const [{ demo }, playerSource, modelSource] = await Promise.all([playable(), fetch('./player.mjs').then(r => r.text()), fetch('./model.mjs').then(r => r.text())]);
    const html = buildHtml({ demo, playerSource, playerCss: PLAYER_CSS, modelSource });
    download(new Blob([html], { type: 'text/html' }), `${slug(state.demo.title)}.html`);
    toast(`Listo: ${slug(state.demo.title)}.html · ${(html.length / 1048576).toFixed(1)} MB`);
  } catch (e) { toast(e.message || 'No se pudo exportar.'); } finally { button.disabled = false; }
}
async function exportJson() {
  const { urls } = await playable();
  download(new Blob([backupJson(state.demo, urls)], { type: 'application/json' }), `${slug(state.demo.title)}.rekko.json`);
}
async function importJson(file) {
  try {
    const raw = JSON.parse(await file.text());
    const demo = validateDemo(raw); demo.id = newId('demo');
    for (const s of demo.steps) { if (s.image.dataUrl && !s.image.blob) { s.image.blob = await dataUrlToBlob(s.image.dataUrl); s.image.dataUrl = null; } }
    await saveDemo(demo); toast(`Importada «${demo.title}» con ${demo.steps.length} pasos`); await showLibrary();
  } catch (e) { toast('No se pudo importar: ' + (e.message || e)); }
}

// ---------- Enlaces ----------
function init() {
  const style = document.createElement('style'); style.textContent = PLAYER_CSS; document.head.append(style);
  $('#demo-new').addEventListener('click', newDemo);
  $('#demo-import').addEventListener('click', () => $('#demo-import-file').click());
  $('#demo-import-file').addEventListener('change', e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
  $('#demo-grid').addEventListener('click', async e => {
    const del = e.target.closest('[data-delete]');
    if (del) { e.stopPropagation(); const title = del.closest('.demo-card').querySelector('strong').textContent; if (!confirm(`¿Eliminar «${title}»? No se puede deshacer. Si la quieres conservar, descarga antes su respaldo desde el editor.`)) return; await deleteDemo(del.dataset.delete); toast('Demo eliminada'); return showLibrary(); }
    const c = e.target.closest('[data-open]'); if (c) openDemo(c.dataset.open);
  });
  $('#demo-grid').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open]')) { e.preventDefault(); openDemo(e.target.dataset.open); } });
  $('#back').addEventListener('click', showLibrary);
  $('#demo-title').addEventListener('change', e => update(setTitle(state.demo, e.target.value)));
  $('#preview').addEventListener('click', openPreview);
  $('#preview-close').addEventListener('click', closePreview);
  $('#export-html').addEventListener('click', exportHtml);
  $('#export-json').addEventListener('click', exportJson);
  $('#demo-delete').addEventListener('click', async () => { if (!confirm(`¿Eliminar «${state.demo.title}»? No se puede deshacer.`)) return; await deleteDemo(state.demo.id); toast('Demo eliminada'); showLibrary(); });
  // Pasos
  const list = $('#step-list'); let dragId = null;
  list.addEventListener('click', e => {
    const li = e.target.closest('[data-step]'); if (!li) return;
    const id = li.dataset.step, i = state.demo.steps.findIndex(s => s.id === id);
    if (e.target.closest('[data-up]')) return update(moveStep(state.demo, id, i - 1));
    if (e.target.closest('[data-down]')) return update(moveStep(state.demo, id, i + 1));
    state.selected = id; renderEditor();
  });
  list.addEventListener('dragstart', e => { const li = e.target.closest('[data-step]'); if (!li) return; dragId = li.dataset.step; e.dataTransfer.effectAllowed = 'move'; });
  list.addEventListener('dragover', e => { const li = e.target.closest('[data-step]'); if (!li || !dragId) return; e.preventDefault(); list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); li.classList.add('drag-over'); });
  list.addEventListener('dragleave', e => e.target.closest?.('[data-step]')?.classList.remove('drag-over'));
  list.addEventListener('drop', e => { const li = e.target.closest('[data-step]'); if (!li || !dragId) return; e.preventDefault(); const to = state.demo.steps.findIndex(s => s.id === li.dataset.step); update(moveStep(state.demo, dragId, to)); dragId = null; });
  list.addEventListener('dragend', () => { dragId = null; list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); });
  $('#step-delete').addEventListener('click', () => { const s = selectedStep(); if (!s) return; state.urls.delete(s.id); update(removeStep(state.demo, s.id)); });
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
  $('#accent').addEventListener('input', e => update(updateTheme(state.demo, { accent: e.target.value }), { silent: true }));
  $('#background').addEventListener('input', e => update(updateTheme(state.demo, { background: e.target.value }), { silent: true }));
  $('#show-progress').addEventListener('change', e => update(updateSettings(state.demo, { showProgress: e.target.checked }), { silent: true }));
  for (const [id, key] of [['final-title', 'finalTitle'], ['final-text', 'finalText'], ['final-link', 'finalLink'], ['final-link-label', 'finalLinkLabel']]) $(`#${id}`).addEventListener('input', e => update(updateSettings(state.demo, { [key]: e.target.value }), { silent: true }));
  $('#embed-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#embed-code').value); toast('Código copiado'); } catch { $('#embed-code').select(); toast('Selecciona el código y cópialo con ⌘C'); } });
  // Captura y subida
  $('#capture-start').addEventListener('click', beginCapture);
  $('#capture-shot').addEventListener('click', takeShot);
  $('#capture-float').addEventListener('click', openFloat);
  $('#capture-stop').addEventListener('click', () => { stopCapture(); renderEditor(); });
  $('#auto-change').addEventListener('change', e => e.target.checked ? startAutoChange() : stopAutoChange());
  $('#auto-sensitivity').addEventListener('change', () => { if ($('#auto-change').checked) startAutoChange(); });
  $('#bookmarklet-link').href = bookmarkletCode(location.origin + location.pathname);
  $('#bookmarklet-link').addEventListener('click', e => { e.preventDefault(); toast('Arrastra este botón a la barra de marcadores; no lo pulses aquí.', 3500); });
  window.addEventListener('message', onRemoteMessage);
  if (location.hash === '#conectar') { history.replaceState(null, '', location.pathname); toast('Una página quiere conectarse. Pulsa el marcador «Rekko clics» otra vez en esa página si no aparece el aviso.', 5000); }
  $('#upload').addEventListener('click', () => $('#upload-files').click());
  $('#upload-files').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  const area = $('#canvas-area');
  area.addEventListener('dragover', e => { if (state.demo && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); area.classList.add('drop'); } });
  area.addEventListener('dragleave', () => area.classList.remove('drop'));
  area.addEventListener('drop', e => { area.classList.remove('drop'); if (!state.demo) return; e.preventDefault(); addFiles([...e.dataTransfer.files]); });
  document.addEventListener('paste', e => {
    if (!state.demo || $('#view-editor').hidden || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  document.addEventListener('keydown', e => {
    if (!$('#preview-modal').hidden) { if (e.key === 'Escape') closePreview(); return; }
    if (!state.demo || $('#view-editor').hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const i = state.demo.steps.findIndex(s => s.id === state.selected);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { if (i < state.demo.steps.length - 1) { state.selected = state.demo.steps[i + 1].id; renderEditor(); } e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { if (i > 0) { state.selected = state.demo.steps[i - 1].id; renderEditor(); } e.preventDefault(); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { const s = selectedStep(); if (s?.hotspot) { update(setHotspot(state.demo, s.id, null)); e.preventDefault(); } }
  });
  window.addEventListener('beforeunload', () => stopCapture());
  showLibrary();
}
init();
