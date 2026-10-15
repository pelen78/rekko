// Rekko · Dibuja un cuadro del video final: fondo, marco, recorte de cámara y pulsos de clic.
import { cameraAt, visibleRect, clickPulses, sourceToFrame } from './timeline.mjs';

export const BACKGROUNDS = [
  { id: 'coral', name: 'Coral', stops: ['#f88c80', '#ffc765'] },
  { id: 'noche', name: 'Noche', stops: ['#1b1f3a', '#3b2d5c'] },
  { id: 'bosque', name: 'Bosque', stops: ['#0f3d3e', '#2f7f6f'] },
  { id: 'cielo', name: 'Cielo', stops: ['#4f7cff', '#9fd0ff'] },
  { id: 'arena', name: 'Arena', stops: ['#beb2a6', '#f2e9df'] },
  { id: 'gris', name: 'Gris', stops: ['#2b2b2b', '#5a5a5a'] },
  { id: 'blanco', name: 'Blanco', stops: ['#ffffff', '#ffffff'] },
  { id: 'negro', name: 'Negro', stops: ['#000000', '#000000'] },
];
export const backgroundById = id => BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];

// Rectángulo del marco dentro del lienzo de salida, respetando la proporción del original.
export function frameRect(project, width, height) {
  const pad = Math.round(Math.min(width, height) * project.frame.padding);
  const availW = width - pad * 2, availH = height - pad * 2;
  const ratio = project.source.width / project.source.height;
  let w = availW, h = Math.round(w / ratio);
  if (h > availH) { h = availH; w = Math.round(h * ratio); }
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), w, h };
}

function roundedPath(ctx, { x, y, w, h }, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawBackground(ctx, project, width, height) {
  const bg = backgroundById(project.frame.background);
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, bg.stops[0]); g.addColorStop(1, bg.stops[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
}

// `image` es cualquier CanvasImageSource con el cuadro original (video, canvas, bitmap).
export function drawFrame(ctx, image, project, time, { width, height, frame = frameRect(project, width, height) } = {}) {
  const sw = project.source.width, sh = project.source.height;
  const camera = cameraAt(project, time);
  const rect = visibleRect(camera, sw, sh);
  const radius = project.frame.radius * (Math.min(width, height) / 1080);
  drawBackground(ctx, project, width, height);
  if (project.frame.shadow && project.frame.padding > 0) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.min(width, height) * .05; ctx.shadowOffsetY = Math.min(width, height) * .015;
    ctx.fillStyle = '#000'; roundedPath(ctx, frame, radius); ctx.fill(); ctx.restore();
  }
  ctx.save(); roundedPath(ctx, frame, radius); ctx.clip();
  ctx.fillStyle = '#111'; ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  if (image) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, frame.x, frame.y, frame.w, frame.h); }
  for (const pulse of clickPulses(project, time)) {
    const p = sourceToFrame(pulse, camera, sw, sh, frame);
    const base = Math.min(frame.w, frame.h) * .012 * Math.sqrt(camera.scale);
    const ring = base * (1 + pulse.progress * 5), alpha = 1 - pulse.progress;
    ctx.beginPath(); ctx.arc(p.x, p.y, ring, 0, Math.PI * 2); ctx.lineWidth = Math.max(1.5, base * .5); ctx.strokeStyle = `rgba(248,140,128,${(alpha * .9).toFixed(3)})`; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, base * 1.6 * (1 - pulse.progress * .4), 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${(alpha * .55).toFixed(3)})`; ctx.fill();
  }
  ctx.restore();
  return { camera, frame };
}
