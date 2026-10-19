// Rekko · Screen editor: crop, blur and annotations (boxes, arrows, text) on a step's screenshot.
// Edits are stored normalized to the original image, so a screen can be edited again without losing quality.
import { normalizeEdits, hasEdits, FULL, clamp } from './model.mjs';
import { loadBitmap, normalizeImage } from './images.mjs';

export const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#111111'];
const SIZE = { 1: .7, 2: 1, 3: 1.6 };
const HINTS = {
  crop: 'Drag to choose the part of the screen to keep. Drag again to change it.',
  blur: 'Drag over names, emails or anything private to blur it.',
  box: 'Drag to draw a box around something important.',
  arrow: 'Drag from where the arrow starts to where it points.',
  text: 'Click where the text goes, type it and press Enter.',
};

// ---------- Painting (shared by the live view and the final render) ----------
// Pixelates a region and scales it back smoothly: looks like a blur and hides text for real.
function blurRect(ctx, x, y, w, h) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 2 || h < 2) return;
  const block = Math.max(6, Math.round(Math.min(ctx.canvas.width, ctx.canvas.height) * .02));
  const tw = Math.max(1, Math.round(w / block)), th = Math.max(1, Math.round(h / block));
  const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
  const t = tmp.getContext('2d'); t.imageSmoothingQuality = 'high'; t.drawImage(ctx.canvas, x, y, w, h, 0, 0, tw, th);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h); ctx.restore();
}
const isDark = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114) < 140; };
function drawMark(ctx, m, P, unit) {
  const lw = unit * SIZE[m.size];
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = m.color; ctx.lineWidth = lw; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = lw * 1.2;
  if (m.type === 'box') {
    const [x1, y1] = P(m.x, m.y), [x2, y2] = P(m.x + m.w, m.y + m.h);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x1, y1, x2 - x1, y2 - y1, lw * 1.5) : ctx.rect(x1, y1, x2 - x1, y2 - y1); ctx.stroke();
  } else if (m.type === 'arrow') {
    const [x1, y1] = P(m.x1, m.y1), [x2, y2] = P(m.x2, m.y2);
    const a = Math.atan2(y2 - y1, x2 - x1), head = Math.min(lw * 4.5, Math.hypot(x2 - x1, y2 - y1) * .6);
    const bx = x2 - Math.cos(a) * head * .8, by = y2 - Math.sin(a) * head * .8;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - .45) * head, y2 - Math.sin(a - .45) * head);
    ctx.lineTo(x2 - Math.cos(a + .45) * head, y2 - Math.sin(a + .45) * head);
    ctx.closePath(); ctx.fill();
  } else if (m.type === 'text') {
    const [x, y] = P(m.x, m.y), fs = lw * 6.5;
    ctx.font = `700 ${fs}px Inter, ui-sans-serif, system-ui, sans-serif`; ctx.textBaseline = 'top';
    ctx.shadowBlur = 0; ctx.lineWidth = fs * .2; ctx.strokeStyle = isDark(m.color) ? '#ffffff' : '#111111';
    ctx.strokeText(m.text, x, y); ctx.fillText(m.text, x, y);
  }
  ctx.restore();
}
// Paints the `view` region of the original (normalized) into a W×H canvas, with blurs and marks.
export function paint(ctx, bitmap, edits, view, W, H) {
  const bw = bitmap.width, bh = bitmap.height;
  ctx.clearRect(0, 0, W, H); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, view.x * bw, view.y * bh, view.w * bw, view.h * bh, 0, 0, W, H);
  const P = (x, y) => [(x - view.x) / view.w * W, (y - view.y) / view.h * H];
  for (const b of edits.blurs) { const [x, y] = P(b.x, b.y); blurRect(ctx, x, y, b.w / view.w * W, b.h / view.h * H); }
  const unit = Math.min(bw, bh) * .005 * (W / (view.w * bw));
  for (const m of edits.marks) drawMark(ctx, m, P, unit);
  return { P, unit };
}
// Final image: the crop at full resolution, as a normalized WebP/JPEG.
export async function renderScreen(original, edits) {
  const bitmap = await loadBitmap(original.blob || original.dataUrl);
  const e = normalizeEdits(edits), view = e.crop || FULL;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(view.w * bitmap.width)); canvas.height = Math.max(1, Math.round(view.h * bitmap.height));
  paint(canvas.getContext('2d'), bitmap, e, view, canvas.width, canvas.height);
  bitmap.close?.();
  return normalizeImage(canvas, { close: false });
}

// ---------- Editor dialog ----------
const $ = s => document.querySelector(s);
const clone = e => JSON.parse(JSON.stringify(e));
const empty = () => ({ crop: null, blurs: [], marks: [] });
const prefs = { tool: 'box', color: COLORS[0], size: 2 };
let ed = null;

export async function openScreenEditor(step, { onSave, onError }) {
  const original = step.original || step.image;
  let bitmap;
  try { bitmap = await loadBitmap(original.blob || original.dataUrl); } catch (e) { return onError?.(e); }
  ed = { step, original, bitmap, onSave, edits: normalizeEdits(step.original ? step.edits : null), history: [], drag: null, text: null, saving: false, opener: document.activeElement };
  const dialog = $('#shot-editor'); dialog.hidden = false; document.body.classList.add('no-scroll');
  setTool(prefs.tool); setColor(prefs.color); $('#shot-size').value = String(prefs.size);
  layout(); syncButtons();
  $(`.tool[data-tool="${prefs.tool}"]`).focus();
}
function close() {
  if (!ed) return;
  hideText(); ed.bitmap.close?.();
  $('#shot-editor').hidden = true; document.body.classList.remove('no-scroll');
  const opener = ed.opener; ed = null; opener?.focus?.();
}
export const screenEditorOpen = () => !!ed;

function commit(change) { ed.history.push(clone(ed.edits)); change(ed.edits); ed.edits = normalizeEdits(ed.edits); draw(); syncButtons(); }
function undo() { if (!ed?.history.length) return; ed.edits = ed.history.pop(); draw(); syncButtons(); }
function reset() { if (!hasEdits(ed.edits)) return; commit(e => Object.assign(e, empty())); }
function syncButtons() {
  $('#shot-undo').disabled = !ed.history.length;
  $('#shot-reset').disabled = !hasEdits(ed.edits);
}
function setTool(tool) {
  prefs.tool = tool; hideText();
  document.querySelectorAll('#shot-editor .tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === tool));
  $('#shot-hint').textContent = HINTS[tool];
  $('#shot-canvas').dataset.tool = tool;
  $('.shot-style').classList.toggle('muted', tool === 'crop' || tool === 'blur');
}
function setColor(color) {
  prefs.color = color;
  document.querySelectorAll('#shot-editor [data-color]').forEach(b => b.setAttribute('aria-checked', b.dataset.color === color));
}

// Canvas sized to fit the stage, sharp on retina screens.
function layout() {
  if (!ed) return;
  const stage = $('#shot-stage'), canvas = $('#shot-canvas');
  const pad = 24, sw = stage.clientWidth - pad * 2, sh = stage.clientHeight - pad * 2;
  const r = Math.min(sw / ed.bitmap.width, sh / ed.bitmap.height, 1.5);
  const cw = Math.max(1, Math.floor(ed.bitmap.width * r)), ch = Math.max(1, Math.floor(ed.bitmap.height * r));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  draw();
}
function draw() {
  if (!ed) return;
  const canvas = $('#shot-canvas'), ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const draft = ed.drag?.draft, edits = draft && draft.kind !== 'crop' ? normalizeEdits({ ...ed.edits, blurs: draft.kind === 'blur' ? [...ed.edits.blurs, draft.rect] : ed.edits.blurs, marks: draft.mark ? [...ed.edits.marks, draft.mark] : ed.edits.marks }) : ed.edits;
  const { unit } = paint(ctx, ed.bitmap, edits, FULL, W, H);
  ed.unit = unit;
  const crop = draft?.kind === 'crop' ? draft.rect : ed.edits.crop;
  if (crop) {
    const x = crop.x * W, y = crop.y * H, w = crop.w * W, h = crop.h * H;
    ctx.save(); ctx.fillStyle = 'rgba(8,9,12,.62)';
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(x, y, w, h); ctx.fill('evenodd');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, W / 600); ctx.setLineDash([8, 6].map(v => v * (window.devicePixelRatio || 1))); ctx.strokeRect(x, y, w, h); ctx.restore();
  }
  if (draft?.kind === 'blur') {
    const r = draft.rect; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H); ctx.restore();
  }
}

function point(e) { const r = $('#shot-canvas').getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; }
const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
function onDown(e) {
  if (!ed || e.button > 0) return;
  const p = point(e), tool = prefs.tool;
  if (tool === 'text') { e.preventDefault(); if (ed.text) commitText(); return showText(p); }
  e.preventDefault(); $('#shot-canvas').setPointerCapture(e.pointerId);
  ed.drag = { start: p, draft: null };
}
function onMove(e) {
  if (!ed?.drag) return;
  const p = point(e), s = ed.drag.start, tool = prefs.tool, base = { color: prefs.color, size: prefs.size };
  if (tool === 'arrow') ed.drag.draft = { kind: 'arrow', mark: { type: 'arrow', ...base, x1: s.x, y1: s.y, x2: p.x, y2: p.y } };
  else { const rect = rectOf(s, p); ed.drag.draft = tool === 'box' ? { kind: 'box', mark: { type: 'box', ...base, ...rect } } : { kind: tool, rect }; }
  draw();
}
function onUp() {
  if (!ed?.drag) return;
  const d = ed.drag.draft; ed.drag = null;
  if (!d) return draw();
  if (d.kind === 'crop') { if (d.rect.w >= .05 && d.rect.h >= .05) commit(e => { e.crop = d.rect; }); else draw(); }
  else if (d.kind === 'blur') commit(e => { e.blurs.push(d.rect); });
  else commit(e => { e.marks.push(d.mark); });
}

// Inline text box placed where the person clicked.
function showText(p) {
  const input = $('#shot-text'), canvas = $('#shot-canvas'), stage = $('#shot-stage');
  const cr = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const css = canvas.width / cr.width, fs = Math.max(12, (ed.unit || 4) * SIZE[prefs.size] * 6.5 / css);
  ed.text = p;
  Object.assign(input.style, { left: `${cr.left - sr.left + p.x * cr.width}px`, top: `${cr.top - sr.top + p.y * cr.height}px`, fontSize: `${fs}px`, color: prefs.color });
  input.value = ''; input.hidden = false; input.focus(); requestAnimationFrame(() => { if (ed?.text && document.activeElement !== input) input.focus(); });
}
function hideText() { if (ed) ed.text = null; const input = $('#shot-text'); if (input) { input.value = ''; input.hidden = true; } }
function commitText() {
  const input = $('#shot-text'), text = input.value.trim(), p = ed?.text;
  hideText();
  if (p && text) commit(e => { e.marks.push({ type: 'text', color: prefs.color, size: prefs.size, x: p.x, y: p.y, text }); });
}

async function save() {
  if (!ed || ed.saving) return;
  if (ed.text) commitText();
  const edits = normalizeEdits(ed.edits), had = !!ed.step.original;
  if (!hasEdits(edits) && !had) return close();
  const button = $('#shot-save'); ed.saving = true; button.disabled = true; button.dataset.label = button.textContent; button.textContent = 'Saving…';
  try {
    const image = hasEdits(edits) ? await renderScreen(ed.original, edits) : ed.original;
    const { step, original, onSave } = ed;
    close();
    onSave({ stepId: step.id, image, original, edits });
  } catch (e) {
    if (ed) { ed.saving = false; }
    alertInline(e.message || 'Could not save the screen.');
  } finally { button.disabled = false; if (button.dataset.label) button.textContent = button.dataset.label; }
}
function alertInline(msg) { $('#shot-hint').textContent = msg; }

export function initScreenEditor() {
  const canvas = $('#shot-canvas');
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { if (ed) { ed.drag = null; draw(); } });
  document.querySelectorAll('#shot-editor .tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  const swatches = $('#shot-colors');
  swatches.innerHTML = COLORS.map(c => `<button type="button" role="radio" class="color" data-color="${c}" style="--c:${c}" aria-label="Color ${c}"></button>`).join('');
  swatches.addEventListener('click', e => { const b = e.target.closest('[data-color]'); if (b) setColor(b.dataset.color); });
  $('#shot-size').addEventListener('change', e => { prefs.size = Number(e.target.value) || 2; });
  $('#shot-undo').addEventListener('click', undo);
  $('#shot-reset').addEventListener('click', reset);
  $('#shot-cancel').addEventListener('click', close);
  $('#shot-save').addEventListener('click', save);
  const input = $('#shot-text');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitText(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideText(); } });
  input.addEventListener('blur', () => { if (ed?.text) commitText(); });
  new ResizeObserver(() => layout()).observe($('#shot-stage'));
  document.addEventListener('keydown', e => {
    if (!ed || e.target === input) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape') { e.preventDefault(); if (ed.history.length) alertInline('You have unsaved changes. Press Save to keep them or Cancel to discard them.'); else close(); }
    else if (!e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
      const tool = { c: 'crop', b: 'blur', r: 'box', a: 'arrow', t: 'text' }[k];
      if (tool) { e.preventDefault(); setTool(tool); }
    }
  }, true);
}
