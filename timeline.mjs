// Rekko · Lógica pura del proyecto: tiempos, zooms, clics y cámara.
// No toca el DOM, así se prueba con node --test.

export const DEFAULTS = Object.freeze({
  fps: 30,
  transition: .45,     // segundos que tarda la cámara en entrar o salir de un zoom
  clickPulse: .7,      // duración del pulso de un clic
  zoomDuration: 2.4,   // duración de un zoom creado desde un clic
  zoomScale: 2,
  zoomLead: .35,       // el zoom empieza un poco antes del clic
});
export const ZOOM_SCALE = Object.freeze({ min: 1.2, max: 4 });
export const MIN_ZOOM_LENGTH = .4;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const round3 = v => Math.round(v * 1000) / 1000;

let counter = 0;
export const newId = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function createProject(source) {
  const duration = Math.max(0, Number(source?.duration) || 0);
  return {
    version: 1,
    source: { width: Math.max(1, source?.width | 0 || 1), height: Math.max(1, source?.height | 0 || 1), duration, hasAudio: !!source?.hasAudio },
    trim: { start: 0, end: duration },
    frame: { background: 'coral', padding: .06, radius: 18, shadow: true },
    clicks: [],
    zooms: [],
    settings: { ...DEFAULTS },
  };
}

export const outputDuration = project => Math.max(0, project.trim.end - project.trim.start);
export const sourceDuration = project => project.source.duration;

export function setTrim(project, { start = project.trim.start, end = project.trim.end } = {}) {
  const total = sourceDuration(project);
  start = clamp(round3(start), 0, total);
  end = clamp(round3(end), 0, total);
  if (end - start < .1 - 1e-9) { if (start === project.trim.start) start = Math.max(0, end - .1); else end = Math.min(total, start + .1); }
  return { ...project, trim: { start, end } };
}

// Clics: tiempo en segundos del video original, posición normalizada 0..1.
export function addClick(project, time, x, y) {
  const click = { id: newId('click'), time: round3(clamp(time, 0, sourceDuration(project))), x: round3(clamp(x, 0, 1)), y: round3(clamp(y, 0, 1)) };
  return { ...project, clicks: [...project.clicks, click].sort((a, b) => a.time - b.time) };
}
export const removeClick = (project, id) => ({ ...project, clicks: project.clicks.filter(c => c.id !== id) });
export const updateClick = (project, id, patch) => ({ ...project, clicks: project.clicks.map(c => c.id === id ? { ...c, ...patch } : c).sort((a, b) => a.time - b.time) });

// Zooms: tramos [start, end] con un centro y una escala. No se solapan.
function normalizeZoom(project, zoom) {
  const total = sourceDuration(project);
  const start = clamp(round3(zoom.start), 0, total);
  const end = clamp(round3(zoom.end), start, total);
  return { id: zoom.id || newId('zoom'), start, end, x: round3(clamp(zoom.x ?? .5, 0, 1)), y: round3(clamp(zoom.y ?? .5, 0, 1)), scale: round3(clamp(zoom.scale ?? DEFAULTS.zoomScale, ZOOM_SCALE.min, ZOOM_SCALE.max)) };
}
// Recorta el zoom para que no invada a sus vecinos. Devuelve null si no queda espacio.
function fitBetweenNeighbours(zoom, others) {
  let { start, end } = zoom;
  for (const o of others) {
    if (o.end <= start || o.start >= end) continue;
    if (o.start <= start && o.end >= end) return null;
    if (o.start <= start) start = o.end; else end = o.start;
  }
  return end - start < MIN_ZOOM_LENGTH ? null : { ...zoom, start, end };
}
export function addZoom(project, zoom) {
  const fitted = fitBetweenNeighbours(normalizeZoom(project, zoom), project.zooms);
  if (!fitted) return project;
  return { ...project, zooms: [...project.zooms, fitted].sort((a, b) => a.start - b.start) };
}
export const removeZoom = (project, id) => ({ ...project, zooms: project.zooms.filter(z => z.id !== id) });
export function updateZoom(project, id, patch) {
  const current = project.zooms.find(z => z.id === id);
  if (!current) return project;
  const fitted = fitBetweenNeighbours(normalizeZoom(project, { ...current, ...patch, id }), project.zooms.filter(z => z.id !== id));
  if (!fitted) return project;
  return { ...project, zooms: project.zooms.map(z => z.id === id ? fitted : z).sort((a, b) => a.start - b.start) };
}
export const zoomAt = (project, time) => project.zooms.find(z => z.start <= time && time <= z.end) || null;

// Crea un zoom alrededor de cada clic que todavía no esté dentro de uno.
export function zoomsFromClicks(project, { duration = project.settings.zoomDuration, scale = project.settings.zoomScale, lead = project.settings.zoomLead } = {}) {
  let next = project;
  for (const click of project.clicks) {
    if (zoomAt(next, click.time)) continue;
    next = addZoom(next, { start: click.time - lead, end: click.time - lead + duration, x: click.x, y: click.y, scale });
  }
  return next;
}

// Cámara en un instante: centro normalizado y escala. Mezcla suave entre zooms.
export function cameraAt(project, time) {
  const tr = project.settings.transition;
  let weightSum = 0, x = 0, y = 0, scale = 0;
  for (const z of project.zooms) {
    let w = 0;
    if (time >= z.start && time <= z.end) w = 1;
    else if (time > z.start - tr && time < z.start) w = easeInOut((time - (z.start - tr)) / tr);
    else if (time > z.end && time < z.end + tr) w = 1 - easeInOut((time - z.end) / tr);
    if (w <= 0) continue;
    weightSum += w; x += z.x * w; y += z.y * w; scale += z.scale * w;
  }
  if (weightSum <= 0) return { x: .5, y: .5, scale: 1 };
  const norm = Math.max(1, weightSum), rest = 1 - Math.min(1, weightSum);
  return { x: x / norm + .5 * rest, y: y / norm + .5 * rest, scale: scale / norm + 1 * rest };
}

// Rectángulo del video original que se ve con esa cámara, en píxeles del original.
export function visibleRect(camera, sw, sh) {
  const w = sw / camera.scale, h = sh / camera.scale;
  const x = clamp(camera.x * sw - w / 2, 0, sw - w), y = clamp(camera.y * sh - h / 2, 0, sh - h);
  return { x, y, w, h };
}

// Pulsos de clic visibles en ese instante: posición normalizada y progreso 0..1.
export function clickPulses(project, time) {
  const length = project.settings.clickPulse;
  return project.clicks.filter(c => time >= c.time && time < c.time + length).map(c => ({ x: c.x, y: c.y, progress: (time - c.time) / length }));
}

// Convierte entre coordenadas normalizadas del original y píxeles dentro del marco.
export function sourceToFrame(point, camera, sw, sh, frame) {
  const r = visibleRect(camera, sw, sh);
  return { x: frame.x + (point.x * sw - r.x) / r.w * frame.w, y: frame.y + (point.y * sh - r.y) / r.h * frame.h };
}
export function frameToSource(point, camera, sw, sh, frame) {
  const r = visibleRect(camera, sw, sh);
  return { x: clamp((r.x + (point.x - frame.x) / frame.w * r.w) / sw, 0, 1), y: clamp((r.y + (point.y - frame.y) / frame.h * r.h) / sh, 0, 1) };
}

export function formatTime(seconds, { decimals = 1 } = {}) {
  seconds = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(seconds / 60), s = seconds - m * 60;
  return `${m}:${s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0')}`;
}

// Limpia un proyecto guardado o importado.
export function validateProject(raw, source) {
  const base = createProject(source || raw?.source);
  if (!raw || typeof raw !== 'object') return base;
  let project = { ...base, frame: { ...base.frame, ...(raw.frame || {}) }, settings: { ...base.settings, ...(raw.settings || {}) } };
  project.frame.padding = clamp(Number(project.frame.padding) || 0, 0, .25);
  project.frame.radius = clamp(Number(project.frame.radius) || 0, 0, 60);
  project.frame.shadow = !!project.frame.shadow;
  project.settings.transition = clamp(Number(project.settings.transition) || DEFAULTS.transition, .1, 2);
  if (raw.trim) project = setTrim(project, raw.trim);
  for (const c of Array.isArray(raw.clicks) ? raw.clicks : []) if (Number.isFinite(c?.time)) project = addClick(project, c.time, c.x, c.y);
  for (const z of Array.isArray(raw.zooms) ? raw.zooms : []) if (Number.isFinite(z?.start) && Number.isFinite(z?.end)) project = addZoom(project, z);
  return project;
}
