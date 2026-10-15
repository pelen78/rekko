// Rekko · Interfaz: grabación, editor y exportación.
import { canRecord, startRecording, ensureSeekable } from './recorder.mjs';
import { createProject, addClick, removeClick, addZoom, updateZoom, removeZoom, zoomsFromClicks, cameraAt, frameToSource, setTrim, outputDuration, sourceDuration, formatTime, clamp } from './timeline.mjs';
import { drawFrame, frameRect, BACKGROUNDS } from './render.mjs';
import { exportVideo, RESOLUTIONS, resolutionById } from './export.mjs';

const $ = s => document.querySelector(s);
const video = $('#source'), preview = $('#preview'), ctx = preview.getContext('2d');
const state = { recording: null, project: null, selectedZoom: null, mode: 'click', exporting: null, resolution: '1080p' };

function toast(message, ms = 2600) { const el = $('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, ms); }
function status(id, message, tone) { const el = $(id); el.textContent = message; if (tone) el.dataset.tone = tone; else delete el.dataset.tone; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Grabación ----------
let recorderHandle = null, timer = null;
async function beginRecording() {
  if (!canRecord()) return status('#record-status', 'Tu navegador no permite grabar la pantalla. Usa Chrome, Edge o Safari en una computadora.', 'error');
  const button = $('#record-start'); button.disabled = true;
  status('#record-status', 'Elige qué quieres grabar en la ventana del navegador…');
  try {
    recorderHandle = await startRecording({ microphone: $('#mic-toggle').checked, beforeStart: countdown });
  } catch (e) {
    button.disabled = false;
    status('#record-status', e?.name === 'NotAllowedError' ? 'No se eligió nada para grabar. Puedes intentarlo de nuevo.' : (e.message || 'No se pudo empezar a grabar.'), 'error');
    return;
  }
  status('#record-status', 'Grabando. Cambia a la pestaña o ventana elegida y haz lo tuyo. Vuelve aquí para detener, o usa «Dejar de compartir» del navegador.');
  $('#recording-bar').hidden = false;
  const started = performance.now();
  timer = setInterval(() => $('#recording-time').value = formatTime((performance.now() - started) / 1000, { decimals: 0 }), 250);
  recorderHandle.onEnded.then(finishRecording);
}
function countdown() {
  return new Promise(resolve => {
    const box = $('#countdown'), num = $('#countdown-number'); let n = 3; box.hidden = false; num.textContent = n;
    const tick = setInterval(() => { n -= 1; if (n <= 0) { clearInterval(tick); box.hidden = true; resolve(); } else num.textContent = n; }, 1000);
  });
}
async function stopRecording() { if (recorderHandle) await finishRecording(await recorderHandle.stop()); }
async function finishRecording(result) {
  if (!recorderHandle) return;
  recorderHandle = null; clearInterval(timer); $('#recording-bar').hidden = true; $('#record-start').disabled = false;
  if (!result?.blob?.size) return status('#record-status', 'La grabación quedó vacía. Intenta de nuevo.', 'error');
  await openRecording(result);
}

// ---------- Apertura en el editor ----------
async function openRecording(result) {
  if (state.recording?.url) URL.revokeObjectURL(state.recording.url);
  const url = URL.createObjectURL(result.blob);
  state.recording = { ...result, url };
  video.src = url; video.muted = false;
  await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('No se pudo abrir la grabación.')); });
  const duration = await ensureSeekable(video, result.duration);
  const width = video.videoWidth || result.width, height = video.videoHeight || result.height;
  state.project = createProject({ width, height, duration, hasAudio: result.hasAudio });
  state.selectedZoom = null; setMode('click');
  $('#screen-record').hidden = true; $('#screen-edit').hidden = false;
  $('#export-result').hidden = true; status('#export-status', '');
  applyResolution(); renderAll(); seek(0);
  toast(`Grabación lista · ${formatTime(duration, { decimals: 0 })} · ${width} × ${height}`);
}

// ---------- Vista previa ----------
function applyResolution() { const r = resolutionById(state.resolution); preview.width = r.width; preview.height = r.height; }
function currentTime() { return clamp(video.currentTime || 0, 0, sourceDuration(state.project)); }
function seek(t) { video.currentTime = clamp(t, 0, sourceDuration(state.project)); updateTransport(); }
function paint() {
  if (state.project) {
    const t = currentTime();
    drawFrame(ctx, video.readyState >= 2 ? video : null, state.project, t, { width: preview.width, height: preview.height });
    if (!video.paused && t >= state.project.trim.end - .001) { video.pause(); seek(state.project.trim.start); setPlayButton(); }
    if (!video.paused) updateTransport();
  }
  requestAnimationFrame(paint);
}
requestAnimationFrame(paint);
function updateTransport() {
  const total = sourceDuration(state.project), t = currentTime();
  $('#scrub').value = Math.round(t / total * 1000) || 0;
  $('#time-current').value = formatTime(t);
  $('#time-total').value = formatTime(total);
}
function setPlayButton() { const b = $('#play'); b.textContent = video.paused ? '▶' : '❚❚'; b.setAttribute('aria-pressed', String(!video.paused)); b.setAttribute('aria-label', video.paused ? 'Reproducir' : 'Pausar'); }
async function togglePlay() {
  if (video.paused) { if (currentTime() >= state.project.trim.end - .05 || currentTime() < state.project.trim.start) seek(state.project.trim.start); try { await video.play(); } catch { } }
  else video.pause();
  setPlayButton();
}
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('#modes-help').textContent = mode === 'click' ? 'Cada clic sobre la vista previa agrega una marca en el instante actual.' : 'Un clic sobre la vista previa centra ahí el zoom elegido, o crea uno nuevo.';
  $('#preview-hint').textContent = mode === 'click' ? 'Pulsa sobre el video para marcar un clic en este instante.' : 'Pulsa sobre el video para elegir el centro del zoom.';
}
function previewPoint(event) {
  const rect = preview.getBoundingClientRect();
  const px = (event.clientX - rect.left) * preview.width / rect.width, py = (event.clientY - rect.top) * preview.height / rect.height;
  const frame = frameRect(state.project, preview.width, preview.height);
  return frameToSource({ x: px, y: py }, cameraAt(state.project, currentTime()), state.project.source.width, state.project.source.height, frame);
}
function onPreviewClick(event) {
  if (!state.project) return;
  const point = previewPoint(event), t = currentTime();
  if (state.mode === 'click') { update(addClick(state.project, t, point.x, point.y)); toast(`Clic marcado en ${formatTime(t)}`); }
  else if (state.selectedZoom && state.project.zooms.some(z => z.id === state.selectedZoom)) update(updateZoom(state.project, state.selectedZoom, { x: point.x, y: point.y }));
  else addZoomAt(t, point);
}
function addZoomAt(t, point = { x: .5, y: .5 }) {
  const before = state.project.zooms.length;
  const s = state.project.settings;
  const next = addZoom(state.project, { start: t, end: t + s.zoomDuration, x: point.x, y: point.y, scale: s.zoomScale });
  if (next.zooms.length === before) return toast('Aquí ya hay un zoom. Muévete a otro momento.');
  state.selectedZoom = next.zooms.find(z => !state.project.zooms.includes(z)).id;
  update(next);
}

// ---------- Estado y panel ----------
function update(project) { state.project = project; renderAll(); }
function renderAll() {
  const p = state.project; if (!p) return;
  const total = sourceDuration(p);
  // Clics
  $('#clicks-count').textContent = p.clicks.length;
  $('#clicks-list').innerHTML = p.clicks.length ? p.clicks.map((c, i) => `<li><button type="button" class="t" data-goto="${c.time}" title="Ir a este momento">Clic ${i + 1} · ${formatTime(c.time)}</button><button type="button" data-remove-click="${c.id}" aria-label="Quitar clic ${i + 1}">✕</button></li>`).join('') : '<li class="empty">Todavía no hay clics marcados.</li>';
  $('#zooms-from-clicks').disabled = !p.clicks.length;
  // Zooms
  $('#zooms-count').textContent = p.zooms.length;
  $('#zooms-list').innerHTML = p.zooms.length ? p.zooms.map((z, i) => `<li class="${z.id === state.selectedZoom ? 'selected' : ''}"><button type="button" class="t" data-select-zoom="${z.id}">Zoom ${i + 1} · ${formatTime(z.start)} → ${formatTime(z.end)} · ${z.scale.toFixed(1)}×</button><button type="button" data-remove-zoom="${z.id}" aria-label="Quitar zoom ${i + 1}">✕</button></li>`).join('') : '<li class="empty">Agrega un zoom o créalos desde los clics.</li>';
  const selected = p.zooms.find(z => z.id === state.selectedZoom);
  $('#zoom-editor').hidden = !selected;
  if (selected) { $('#zoom-start').value = selected.start.toFixed(1); $('#zoom-length').value = (selected.end - selected.start).toFixed(1); $('#zoom-scale').value = selected.scale; $('#zoom-scale-value').value = `${selected.scale.toFixed(1)}×`; }
  // Recorte
  $('#trim-start').value = p.trim.start.toFixed(1); $('#trim-end').value = p.trim.end.toFixed(1); $('#trim-start').max = $('#trim-end').max = total.toFixed(1);
  const trim = $('#timeline-trim'); trim.style.left = `${p.trim.start / total * 100}%`; trim.style.width = `${outputDuration(p) / total * 100}%`;
  // Marcas en la línea de tiempo
  $('#timeline-marks').innerHTML = p.clicks.map(c => `<span class="mark-click" style="left:${c.time / total * 100}%" data-goto="${c.time}" title="Clic en ${formatTime(c.time)}"></span>`).join('') + p.zooms.map(z => `<span class="mark-zoom ${z.id === state.selectedZoom ? 'selected' : ''}" style="left:${z.start / total * 100}%;width:${Math.max(.5, (z.end - z.start) / total * 100)}%" data-select-zoom="${z.id}" data-goto="${z.start}" title="Zoom ${z.scale.toFixed(1)}×"></span>`).join('');
  // Marco
  document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.background === p.frame.background)));
  $('#padding').value = Math.round(p.frame.padding * 100); $('#padding-value').value = `${Math.round(p.frame.padding * 100)}%`;
  $('#radius').value = p.frame.radius; $('#radius-value').value = p.frame.radius;
  $('#shadow').checked = p.frame.shadow;
  $('#transition').value = p.settings.transition; $('#transition-value').value = `${p.settings.transition.toFixed(2)} s`;
  updateTransport();
}
function selectZoom(id) { state.selectedZoom = id; const z = state.project.zooms.find(z => z.id === id); if (z) { setMode('zoom'); seek(z.start + Math.min(.5, (z.end - z.start) / 2)); } renderAll(); }
function editSelectedZoom(patch) { if (!state.selectedZoom) return; const before = state.project; update(updateZoom(before, state.selectedZoom, patch)); if (state.project === before) toast('Ese cambio chocaría con otro zoom.'); }

// ---------- Exportación ----------
async function startExport() {
  if (!state.recording || state.exporting) return;
  const controller = new AbortController(); state.exporting = controller;
  const r = resolutionById(state.resolution);
  $('#export').disabled = true; $('#export-progress').hidden = false; $('#export-result').hidden = true; $('#export-bar').value = 0; $('#export-text').textContent = 'Preparando…'; status('#export-status', '');
  video.pause(); setPlayButton();
  try {
    const { blob, extension, container, withAudio } = await exportVideo(state.recording.blob, state.project, { resolution: state.resolution, signal: controller.signal, onProgress: f => { $('#export-bar').value = Math.round(f * 100); $('#export-text').textContent = `Creando tu video · ${Math.round(f * 100)}%`; } });
    const url = URL.createObjectURL(blob);
    const result = $('#result-video'); result.src = url;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
    const link = $('#result-download'); link.href = url; link.download = `rekko-${stamp}.${extension}`; link.textContent = `Guardar ${container.toUpperCase()} ↓`;
    $('#export-result').hidden = false;
    status('#export-status', `${container.toUpperCase()} · ${r.width} × ${r.height} · ${formatTime(outputDuration(state.project), { decimals: 0 })} · ${(blob.size / 1048576).toFixed(1)} MB${withAudio ? ' · con voz' : ''}${container === 'webm' ? ' · Este navegador no crea MP4, así que se guardó como WebM.' : ''}`);
  } catch (e) {
    status('#export-status', e?.name === 'AbortError' ? 'Exportación cancelada.' : (e.message || 'No se pudo crear el MP4.'), e?.name === 'AbortError' ? undefined : 'error');
  } finally { state.exporting = null; $('#export').disabled = false; $('#export-progress').hidden = true; }
}

// ---------- Enlaces de la interfaz ----------
function init() {
  $('#record-start').addEventListener('click', beginRecording);
  $('#record-stop').addEventListener('click', stopRecording);
  $('#play').addEventListener('click', togglePlay);
  $('#scrub').addEventListener('input', e => { if (!video.paused) video.pause(); setPlayButton(); seek(e.target.value / 1000 * sourceDuration(state.project)); });
  preview.addEventListener('click', onPreviewClick);
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#zooms-from-clicks').addEventListener('click', () => { const before = state.project.zooms.length; update(zoomsFromClicks(state.project)); const added = state.project.zooms.length - before; toast(added === 1 ? "1 zoom nuevo" : `${added} zooms nuevos`); });
  $('#zoom-add').addEventListener('click', () => { setMode('zoom'); const t = currentTime(); const near = [...state.project.clicks].reverse().find(c => Math.abs(c.time - t) < 1.5); addZoomAt(t, near ? { x: near.x, y: near.y } : { x: .5, y: .5 }); });
  $('#zoom-start').addEventListener('change', e => { const z = state.project.zooms.find(z => z.id === state.selectedZoom); if (z) editSelectedZoom({ start: Number(e.target.value), end: Number(e.target.value) + (z.end - z.start) }); });
  $('#zoom-length').addEventListener('change', e => { const z = state.project.zooms.find(z => z.id === state.selectedZoom); if (z) editSelectedZoom({ end: z.start + Math.max(.4, Number(e.target.value)) }); });
  $('#zoom-scale').addEventListener('input', e => { editSelectedZoom({ scale: Number(e.target.value) }); });
  $('#zoom-goto').addEventListener('click', () => { const z = state.project.zooms.find(z => z.id === state.selectedZoom); if (z) seek(z.start + .2); });
  $('#zoom-delete').addEventListener('click', () => { update(removeZoom(state.project, state.selectedZoom)); state.selectedZoom = null; renderAll(); });
  $('#trim-start').addEventListener('change', e => update(setTrim(state.project, { start: Number(e.target.value) })));
  $('#trim-end').addEventListener('change', e => update(setTrim(state.project, { end: Number(e.target.value) })));
  $('#trim-start-here').addEventListener('click', () => update(setTrim(state.project, { start: currentTime() })));
  $('#trim-end-here').addEventListener('click', () => update(setTrim(state.project, { end: currentTime() })));
  $('#backgrounds').innerHTML = BACKGROUNDS.map(b => `<button type="button" class="swatch" data-background="${b.id}" aria-pressed="false" title="${esc(b.name)}" aria-label="Fondo ${esc(b.name)}" style="background:linear-gradient(135deg,${b.stops[0]},${b.stops[1]})"></button>`).join('');
  $('#backgrounds').addEventListener('click', e => { const b = e.target.closest('[data-background]'); if (b) update({ ...state.project, frame: { ...state.project.frame, background: b.dataset.background } }); });
  $('#padding').addEventListener('input', e => update({ ...state.project, frame: { ...state.project.frame, padding: Number(e.target.value) / 100 } }));
  $('#radius').addEventListener('input', e => update({ ...state.project, frame: { ...state.project.frame, radius: Number(e.target.value) } }));
  $('#shadow').addEventListener('change', e => update({ ...state.project, frame: { ...state.project.frame, shadow: e.target.checked } }));
  $('#transition').addEventListener('input', e => update({ ...state.project, settings: { ...state.project.settings, transition: Number(e.target.value) } }));
  $('#resolution').innerHTML = RESOLUTIONS.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  $('#resolution').addEventListener('change', e => { state.resolution = e.target.value; applyResolution(); });
  $('#export').addEventListener('click', startExport);
  $('#export-cancel').addEventListener('click', () => state.exporting?.abort());
  $('#new-recording').addEventListener('click', () => { if (state.exporting) return toast('Espera a que termine la exportación.'); if (!confirm('¿Empezar una grabación nueva? La actual se perderá.')) return; video.pause(); $('#screen-edit').hidden = true; $('#screen-record').hidden = false; status('#record-status', 'Lista para una grabación nueva.'); });
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-goto]'), sel = e.target.closest('[data-select-zoom]'), rc = e.target.closest('[data-remove-click]'), rz = e.target.closest('[data-remove-zoom]');
    if (rc) return update(removeClick(state.project, rc.dataset.removeClick));
    if (rz) { if (state.selectedZoom === rz.dataset.removeZoom) state.selectedZoom = null; return update(removeZoom(state.project, rz.dataset.removeZoom)); }
    if (sel) return selectZoom(sel.dataset.selectZoom);
    if (go) seek(Number(go.dataset.goto));
  });
  document.addEventListener('keydown', e => {
    if (!state.project || $('#screen-edit').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(currentTime() - (e.shiftKey ? 1 : .1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(currentTime() + (e.shiftKey ? 1 : .1)); }
    else if (e.key.toLowerCase() === 'z') { setMode(state.mode === 'zoom' ? 'click' : 'zoom'); }
  });
  video.addEventListener('pause', setPlayButton); video.addEventListener('play', setPlayButton);
  window.addEventListener('beforeunload', e => { if (state.recording) { e.preventDefault(); e.returnValue = ''; } });
  if (!canRecord()) status('#record-status', 'Tu navegador no permite grabar la pantalla. Usa Chrome, Edge o Safari en una computadora.', 'error');
}
init();
