// Rekko · Modelo de una demo interactiva: pasos, zonas de clic, globos. Sin DOM, con pruebas.

export const VERSION = 2;
export const MAX_STEPS = 60;
export const PLACEMENTS = ['auto', 'top', 'bottom', 'left', 'right'];
export const ADVANCE = ['hotspot', 'button'];
export const HOTSPOT = Object.freeze({ min: .015, defaultW: .12, defaultH: .06 });
export const LANGUAGES = ['es', 'en'];
// Colores de la marca (logo): azul índigo y azul marino.
export const DEFAULT_THEME = Object.freeze({ accent: '#4a5ff0', background: '#0f1422' });
// Textos que Rekko genera: globos automáticos, reproductor y tarjeta final. La interfaz del editor no cambia.
export const STRINGS = Object.freeze({
  es: { clickHere: 'Haz clic aquí', clickOn: label => `Haz clic en «${label}»`, clickOnPattern: /^Haz clic en «(.+)»$/, next: 'Siguiente →', finish: 'Terminar', of: 'de', clickZone: 'Haz clic en la zona marcada', restart: '↺ Empezar de nuevo', again: '↺ Ver de nuevo', tryIt: 'Probarlo', step: 'Paso', empty: 'Esta demo todavía no tiene pasos', finalTitle: '¡Eso es todo!', finalText: 'Ya sabes cómo funciona.', untitled: 'Demo sin título' },
  en: { clickHere: 'Click here', clickOn: label => `Click “${label}”`, clickOnPattern: /^Click “(.+)”$/, next: 'Next →', finish: 'Finish', of: 'of', clickZone: 'Click the highlighted area', restart: '↺ Start over', again: '↺ Watch again', tryIt: 'Try it', step: 'Step', empty: 'This demo has no steps yet', finalTitle: 'That’s it!', finalText: 'Now you know how it works.', untitled: 'Untitled demo' },
});
export const strings = language => STRINGS[LANGUAGES.includes(language) ? language : 'es'];
export const demoLanguage = demo => (LANGUAGES.includes(demo?.settings?.language) ? demo.settings.language : 'es');

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round4 = v => Math.round(v * 10000) / 10000;
let counter = 0;
export const newId = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function createDemo(title, language = 'es') {
  const t = strings(language);
  return {
    version: VERSION, id: newId('demo'), title: String(title || t.untitled).slice(0, 80), createdAt: Date.now(), updatedAt: Date.now(),
    theme: { ...DEFAULT_THEME },
    settings: { language: LANGUAGES.includes(language) ? language : 'es', showProgress: true, finalTitle: t.finalTitle, finalText: t.finalText, finalLink: '', finalLinkLabel: '' },
    steps: [],
  };
}

export function createStep(image, language = 'es') {
  return {
    id: newId('step'),
    image: { width: Math.max(1, image?.width | 0 || 1), height: Math.max(1, image?.height | 0 || 1), type: image?.type || 'image/webp', blob: image?.blob ?? null, dataUrl: image?.dataUrl ?? null },
    hotspot: null,            // { x, y, w, h } normalizados 0..1
    tooltip: { title: '', text: strings(language).clickHere, placement: 'auto' },
    advance: 'button',        // 'clic en la zona' o 'botón Siguiente'
    original: null,           // imagen sin editar, si la pantalla se editó
    edits: null,              // { crop, blurs, marks } normalizados a la imagen original
  };
}

// Cambia el idioma de los textos generados. Traduce lo que Rekko escribió solo y respeta lo que escribió la persona.
export function setLanguage(demo, language) {
  if (!LANGUAGES.includes(language)) return demo;
  const from = strings(demoLanguage(demo)), to = strings(language);
  if (from === to) return demo;
  const swap = text => {
    if (text === from.clickHere) return to.clickHere;
    const m = from.clickOnPattern.exec(text || '');
    return m ? to.clickOn(m[1]) : text;
  };
  const settings = { ...demo.settings, language };
  if (settings.finalTitle === from.finalTitle) settings.finalTitle = to.finalTitle;
  if (settings.finalText === from.finalText) settings.finalText = to.finalText;
  if (settings.finalLinkLabel === from.tryIt) settings.finalLinkLabel = to.tryIt;
  const title = demo.title === from.untitled ? to.untitled : demo.title;
  return touch({ ...demo, title, settings, steps: demo.steps.map(s => ({ ...s, tooltip: { ...s.tooltip, text: swap(s.tooltip.text) } })) });
}

const touch = demo => ({ ...demo, updatedAt: Date.now() });

export function addStep(demo, image, index = demo.steps.length) {
  if (demo.steps.length >= MAX_STEPS) return demo;
  const steps = [...demo.steps];
  steps.splice(clamp(index, 0, steps.length), 0, createStep(image, demoLanguage(demo)));
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

export function setTitle(demo, title) { return touch({ ...demo, title: String(title || '').trim().slice(0, 80) || strings(demoLanguage(demo)).untitled }); }
export function updateSettings(demo, patch) { return touch({ ...demo, settings: { ...demo.settings, ...patch } }); }
export function updateTheme(demo, patch) { return touch({ ...demo, theme: { ...demo.theme, ...patch } }); }

// Limpia una demo guardada o importada.
export function validateDemo(raw) {
  const base = createDemo(raw?.title, raw?.settings?.language);
  if (!raw || typeof raw !== 'object') return base;
  const demo = { ...base, id: typeof raw.id === 'string' ? raw.id : base.id, createdAt: Number(raw.createdAt) || base.createdAt, updatedAt: Number(raw.updatedAt) || base.updatedAt, theme: { ...base.theme, ...(raw.theme || {}) }, settings: { ...base.settings, ...(raw.settings || {}) }, steps: [] };
  if (!/^#[0-9a-f]{6}$/i.test(demo.theme.accent)) demo.theme.accent = base.theme.accent;
  if (!/^#[0-9a-f]{6}$/i.test(demo.theme.background)) demo.theme.background = base.theme.background;
  for (const key of ['finalTitle', 'finalText', 'finalLink', 'finalLinkLabel']) demo.settings[key] = String(demo.settings[key] ?? '').slice(0, 300);
  if (demo.settings.finalLink && !/^https?:\/\//i.test(demo.settings.finalLink)) demo.settings.finalLink = '';
  demo.settings.showProgress = demo.settings.showProgress !== false;
  demo.settings.language = LANGUAGES.includes(demo.settings.language) ? demo.settings.language : 'es';
  for (const s of Array.isArray(raw.steps) ? raw.steps.slice(0, MAX_STEPS) : []) {
    if (!s?.image || !(s.image.blob || s.image.dataUrl)) continue;
    const step = createStep(s.image, demo.settings.language);
    if (typeof s.id === 'string') step.id = s.id;
    step.hotspot = normalizeHotspot(s.hotspot);
    step.tooltip = { title: String(s.tooltip?.title ?? '').slice(0, 80), text: String(s.tooltip?.text ?? '').slice(0, 400), placement: PLACEMENTS.includes(s.tooltip?.placement) ? s.tooltip.placement : 'auto' };
    step.advance = step.hotspot && ADVANCE.includes(s.advance) ? s.advance : 'button';
    if (s.original && (s.original.blob || s.original.dataUrl)) { step.original = createStep(s.original).image; step.edits = normalizeEdits(s.edits); }
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

// ---------- Edición de pantalla: recorte, difuminado y anotaciones ----------
// Todo va normalizado (0..1) respecto a la imagen original, así se puede volver a editar sin perder calidad.
export const MARK_TYPES = ['box', 'arrow', 'text'];
export const MARK_SIZES = [1, 2, 3];
export const FULL = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
const MIN_CROP = .05;
const n01 = v => round4(clamp(Number(v) || 0, 0, 1));
const color = c => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#ff3b30');
function rect01(r, min = .005) {
  if (!r) return null;
  const x = n01(r.x), y = n01(r.y);
  const w = round4(clamp(Number(r.w) || 0, 0, 1 - x)), h = round4(clamp(Number(r.h) || 0, 0, 1 - y));
  return w >= min && h >= min ? { x, y, w, h } : null;
}
export function normalizeEdits(raw) {
  const crop = rect01(raw?.crop, MIN_CROP);
  const blurs = (Array.isArray(raw?.blurs) ? raw.blurs : []).map(b => rect01(b)).filter(Boolean).slice(0, 50);
  const marks = (Array.isArray(raw?.marks) ? raw.marks : []).slice(0, 100).map(m => {
    if (!MARK_TYPES.includes(m?.type)) return null;
    const base = { type: m.type, color: color(m.color), size: MARK_SIZES.includes(m.size) ? m.size : 2 };
    if (m.type === 'box') { const r = rect01(m); return r && { ...base, ...r }; }
    if (m.type === 'arrow') { const a = { x1: n01(m.x1), y1: n01(m.y1), x2: n01(m.x2), y2: n01(m.y2) }; return Math.hypot(a.x2 - a.x1, a.y2 - a.y1) >= .01 ? { ...base, ...a } : null; }
    const text = String(m.text ?? '').trim().slice(0, 120);
    return text ? { ...base, x: n01(m.x), y: n01(m.y), text } : null;
  }).filter(Boolean);
  return { crop: crop && !(crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1) ? crop : null, blurs, marks };
}
export const hasEdits = e => !!(e && (e.crop || e.blurs?.length || e.marks?.length));
export function describeEdits(e) {
  if (!hasEdits(e)) return '';
  const parts = [];
  if (e.crop) parts.push('Cropped');
  if (e.blurs.length) parts.push(`${e.blurs.length} blur${e.blurs.length === 1 ? '' : 's'}`);
  if (e.marks.length) parts.push(`${e.marks.length} annotation${e.marks.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
// Lleva una zona de clic de un recorte a otro (ambos normalizados a la original). Si queda fuera, se quita.
export function remapThroughCrop(hotspot, from, to) {
  if (!hotspot) return null;
  const a = from || FULL, b = to || FULL;
  const x1 = a.x + hotspot.x * a.w, y1 = a.y + hotspot.y * a.h, x2 = x1 + hotspot.w * a.w, y2 = y1 + hotspot.h * a.h;
  const nx1 = clamp((x1 - b.x) / b.w, 0, 1), ny1 = clamp((y1 - b.y) / b.h, 0, 1), nx2 = clamp((x2 - b.x) / b.w, 0, 1), ny2 = clamp((y2 - b.y) / b.h, 0, 1);
  if (nx2 - nx1 < HOTSPOT.min / 2 || ny2 - ny1 < HOTSPOT.min / 2) return null;
  return normalizeHotspot({ x: nx1, y: ny1, w: nx2 - nx1, h: ny2 - ny1 });
}
// Guarda el resultado de editar la pantalla de un paso: imagen nueva, original y ediciones.
export function setStepScreen(demo, id, { image, original, edits }) {
  const step = demo.steps.find(s => s.id === id);
  if (!step) return demo;
  const clean = normalizeEdits(edits);
  const before = step.original ? step.edits?.crop : null;
  const hotspot = remapThroughCrop(step.hotspot, before, clean.crop);
  const keep = hasEdits(clean);
  const next = { ...step, image: createStep(image).image, original: keep ? createStep(original).image : null, edits: keep ? clean : null, hotspot, advance: hotspot ? step.advance : 'button' };
  return touch({ ...demo, steps: demo.steps.map(s => (s.id === id ? next : s)) });
}
