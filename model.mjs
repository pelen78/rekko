// Rekko · Modelo de una demo interactiva: pasos, zonas de clic, globos. Sin DOM, con pruebas.

export const VERSION = 2;
export const MAX_STEPS = 60;
export const PLACEMENTS = ['auto', 'top', 'bottom', 'left', 'right'];
export const ADVANCE = ['hotspot', 'button'];
export const HOTSPOT = Object.freeze({ min: .015, defaultW: .12, defaultH: .06 });

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round4 = v => Math.round(v * 10000) / 10000;
let counter = 0;
export const newId = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function createDemo(title = 'Demo sin título') {
  return {
    version: VERSION, id: newId('demo'), title: String(title).slice(0, 80), createdAt: Date.now(), updatedAt: Date.now(),
    theme: { accent: '#f88c80', background: '#15161c' },
    settings: { showProgress: true, finalTitle: '¡Eso es todo!', finalText: 'Ya sabes cómo funciona.', finalLink: '', finalLinkLabel: '' },
    steps: [],
  };
}

export function createStep(image) {
  return {
    id: newId('step'),
    image: { width: Math.max(1, image?.width | 0 || 1), height: Math.max(1, image?.height | 0 || 1), type: image?.type || 'image/webp', blob: image?.blob ?? null, dataUrl: image?.dataUrl ?? null },
    hotspot: null,            // { x, y, w, h } normalizados 0..1
    tooltip: { title: '', text: 'Haz clic aquí', placement: 'auto' },
    advance: 'button',        // 'hotspot' (clic en la zona) o 'button' (botón Siguiente)
  };
}

const touch = demo => ({ ...demo, updatedAt: Date.now() });

export function addStep(demo, image, index = demo.steps.length) {
  if (demo.steps.length >= MAX_STEPS) return demo;
  const steps = [...demo.steps];
  steps.splice(clamp(index, 0, steps.length), 0, createStep(image));
  return touch({ ...demo, steps });
}
export const removeStep = (demo, id) => touch({ ...demo, steps: demo.steps.filter(s => s.id !== id) });
export function moveStep(demo, id, to) {
  const from = demo.steps.findIndex(s => s.id === id);
  if (from < 0) return demo;
  to = clamp(to, 0, demo.steps.length - 1);
  if (from === to) return demo;
  const steps = [...demo.steps]; const [step] = steps.splice(from, 1); steps.splice(to, 0, step);
  return touch({ ...demo, steps });
}
export function duplicateStep(demo, id) {
  const i = demo.steps.findIndex(s => s.id === id);
  if (i < 0 || demo.steps.length >= MAX_STEPS) return demo;
  const copy = { ...structuredCloneSafe(demo.steps[i]), id: newId('step') };
  const steps = [...demo.steps]; steps.splice(i + 1, 0, copy);
  return touch({ ...demo, steps });
}
function structuredCloneSafe(step) { return { ...step, image: { ...step.image }, hotspot: step.hotspot ? { ...step.hotspot } : null, tooltip: { ...step.tooltip } }; }

export function updateStep(demo, id, patch) {
  return touch({ ...demo, steps: demo.steps.map(s => s.id === id ? { ...s, ...patch, tooltip: { ...s.tooltip, ...(patch.tooltip || {}) } } : s) });
}

// Zona de clic normalizada. Se recorta a la imagen y respeta un tamaño mínimo.
export function normalizeHotspot(h) {
  if (!h) return null;
  let x = clamp(Number(h.x) || 0, 0, 1), y = clamp(Number(h.y) || 0, 0, 1);
  let w = clamp(Number(h.w) || 0, HOTSPOT.min, 1), hh = clamp(Number(h.h) || 0, HOTSPOT.min, 1);
  if (x + w > 1) x = 1 - w; if (y + hh > 1) y = 1 - hh;
  return { x: round4(x), y: round4(y), w: round4(w), h: round4(hh) };
}
export function setHotspot(demo, id, hotspot) {
  const h = normalizeHotspot(hotspot);
  const step = demo.steps.find(s => s.id === id);
  if (!step) return demo;
  const advance = h ? (step.hotspot ? step.advance : 'hotspot') : 'button';
  return updateStep(demo, id, { hotspot: h, advance });
}
// Rectángulo a partir de dos esquinas arrastradas.
export const rectFromDrag = (a, b) => normalizeHotspot({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
export const hotspotCenter = h => ({ x: h.x + h.w / 2, y: h.y + h.h / 2 });
export const pointInHotspot = (p, h) => !!h && p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h;

// Caja de la imagen ajustada dentro de un contenedor, conservando proporción.
export function fitRect(imageW, imageH, boxW, boxH) {
  const scale = Math.min(boxW / imageW, boxH / imageH);
  const w = Math.round(imageW * scale), h = Math.round(imageH * scale);
  return { x: Math.round((boxW - w) / 2), y: Math.round((boxH - h) / 2), w, h, scale };
}

// Dónde va el globo respecto a la zona: elige el lado con espacio y lo mantiene dentro del contenedor.
export function placeTooltip({ hotspot, image, tooltip, box, placement = 'auto', gap = 14, margin = 8 }) {
  const hx = image.x + hotspot.x * image.w, hy = image.y + hotspot.y * image.h, hw = hotspot.w * image.w, hh = hotspot.h * image.h;
  const space = { top: hy - margin, bottom: box.h - (hy + hh) - margin, left: hx - margin, right: box.w - (hx + hw) - margin };
  const fits = { top: space.top >= tooltip.h + gap, bottom: space.bottom >= tooltip.h + gap, left: space.left >= tooltip.w + gap, right: space.right >= tooltip.w + gap };
  let side = placement;
  if (side === 'auto' || !fits[side]) {
    side = ['bottom', 'top', 'right', 'left'].find(s => fits[s]) || Object.entries(space).sort((a, b) => b[1] - a[1])[0][0];
  }
  let x, y;
  if (side === 'bottom') { x = hx + hw / 2 - tooltip.w / 2; y = hy + hh + gap; }
  else if (side === 'top') { x = hx + hw / 2 - tooltip.w / 2; y = hy - gap - tooltip.h; }
  else if (side === 'right') { x = hx + hw + gap; y = hy + hh / 2 - tooltip.h / 2; }
  else { x = hx - gap - tooltip.w; y = hy + hh / 2 - tooltip.h / 2; }
  x = clamp(x, margin, Math.max(margin, box.w - tooltip.w - margin));
  y = clamp(y, margin, Math.max(margin, box.h - tooltip.h - margin));
  return { x: Math.round(x), y: Math.round(y), side };
}

export function setTitle(demo, title) { return touch({ ...demo, title: String(title || '').trim().slice(0, 80) || 'Demo sin título' }); }
export function updateSettings(demo, patch) { return touch({ ...demo, settings: { ...demo.settings, ...patch } }); }
export function updateTheme(demo, patch) { return touch({ ...demo, theme: { ...demo.theme, ...patch } }); }

// Limpia una demo guardada o importada.
export function validateDemo(raw) {
  const base = createDemo(raw?.title);
  if (!raw || typeof raw !== 'object') return base;
  const demo = { ...base, id: typeof raw.id === 'string' ? raw.id : base.id, createdAt: Number(raw.createdAt) || base.createdAt, updatedAt: Number(raw.updatedAt) || base.updatedAt, theme: { ...base.theme, ...(raw.theme || {}) }, settings: { ...base.settings, ...(raw.settings || {}) }, steps: [] };
  if (!/^#[0-9a-f]{6}$/i.test(demo.theme.accent)) demo.theme.accent = base.theme.accent;
  if (!/^#[0-9a-f]{6}$/i.test(demo.theme.background)) demo.theme.background = base.theme.background;
  for (const key of ['finalTitle', 'finalText', 'finalLink', 'finalLinkLabel']) demo.settings[key] = String(demo.settings[key] ?? '').slice(0, 300);
  if (demo.settings.finalLink && !/^https?:\/\//i.test(demo.settings.finalLink)) demo.settings.finalLink = '';
  demo.settings.showProgress = demo.settings.showProgress !== false;
  for (const s of Array.isArray(raw.steps) ? raw.steps.slice(0, MAX_STEPS) : []) {
    if (!s?.image || !(s.image.blob || s.image.dataUrl)) continue;
    const step = createStep(s.image);
    if (typeof s.id === 'string') step.id = s.id;
    step.hotspot = normalizeHotspot(s.hotspot);
    step.tooltip = { title: String(s.tooltip?.title ?? '').slice(0, 80), text: String(s.tooltip?.text ?? '').slice(0, 400), placement: PLACEMENTS.includes(s.tooltip?.placement) ? s.tooltip.placement : 'auto' };
    step.advance = step.hotspot && ADVANCE.includes(s.advance) ? s.advance : 'button';
    demo.steps.push(step);
  }
  return demo;
}

// Lo que el reproductor necesita, sin blobs: las imágenes van como data URL.
export function playableDemo(demo, dataUrls) {
  return {
    version: VERSION, title: demo.title, theme: demo.theme, settings: demo.settings,
    steps: demo.steps.map((s, i) => ({ id: s.id, image: { width: s.image.width, height: s.image.height, src: dataUrls[i] }, hotspot: s.hotspot, tooltip: s.tooltip, advance: s.advance })),
  };
}
