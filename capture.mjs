// Rekko · Captura de pantallas sin extensión: compartes una ventana o pestaña y tomas fotos cuando quieras.
// Guarda los últimos cuadros para poder capturar «justo antes del clic» y puede vigilar cambios de pantalla.
import { normalizeImage } from './images.mjs';
import { createChangeDetector } from './change-detector.mjs';

export const canCapture = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
export const canFloat = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;
export const SENSITIVITY = { baja: .08, media: .035, alta: .012 };
const BUFFER_MS = 180, BUFFER_SIZE = 4, SAMPLE_MS = 350, SAMPLE_W = 64, SAMPLE_H = 40;

export async function startCapture() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 10 }, cursor: 'never' }, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', preferCurrentTab: false });
  const video = document.createElement('video'); video.srcObject = stream; video.muted = true; video.playsInline = true;
  await video.play();
  await new Promise(r => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  const label = track.label || 'Shared screen';
  const surface = settings.displaySurface || (/^(screen|monitor)/i.test(label) ? 'monitor' : /^window/i.test(label) ? 'window' : 'browser');
  const ended = new Promise(resolve => track.addEventListener('ended', resolve, { once: true }));

  // Búfer de cuadros recientes.
  const frames = [];
  const bufferTimer = setInterval(async () => {
    if (track.readyState !== 'live') return;
    try { const bitmap = await createImageBitmap(video); frames.push({ bitmap, t: performance.now() }); while (frames.length > BUFFER_SIZE) frames.shift().bitmap.close(); } catch { }
  }, BUFFER_MS);

  // Vigilante de cambios: muestra pequeña en escala de grises.
  const sampleCanvas = document.createElement('canvas'); sampleCanvas.width = SAMPLE_W; sampleCanvas.height = SAMPLE_H;
  const sctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  let watcher = null, detector = null;
  const sample = () => { sctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H); const d = sctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data; const g = new Uint8Array(SAMPLE_W * SAMPLE_H); for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10; return g; };
  const stopWatching = () => { clearInterval(watcher); watcher = null; detector = null; };
  const startWatching = (handler, sensitivity = 'media') => {
    stopWatching();
    detector = createChangeDetector({ threshold: SENSITIVITY[sensitivity] ?? SENSITIVITY.media, cooldown: 900 });
    detector.markShot(sample(), performance.now());
    watcher = setInterval(async () => {
      if (track.readyState !== 'live' || !detector) return;
      if (detector.feed(sample(), performance.now())) { try { await handler(await shot()); } catch { } }
    }, SAMPLE_MS);
  };
  // Toma una foto. Con before > 0, usa el cuadro más reciente que tenga al menos esa antigüedad (ms).
  async function shot({ before = 0 } = {}) {
    if (track.readyState !== 'live') throw new Error('The screen is no longer being shared.');
    let source = video;
    if (before > 0 && frames.length) { const cutoff = performance.now() - before; const old = [...frames].reverse().find(f => f.t <= cutoff) || frames[0]; source = old.bitmap; }
    const image = await normalizeImage(source, { close: false });
    detector?.markShot(sample(), performance.now());
    return image;
  }
  return {
    label, surface, ended, video, shot, startWatching, stopWatching,
    get active() { return track.readyState === 'live'; },
    stop() { stopWatching(); clearInterval(bufferTimer); frames.splice(0).forEach(f => f.bitmap.close()); stream.getTracks().forEach(t => t.stop()); video.srcObject = null; },
  };
}

// Ventanita flotante (Chrome) con el botón de capturar, que queda encima de todo mientras usas tu app.
export async function openFloatingButton({ onShot, onClose, accent = '#4a5ff0' }) {
  const pip = await window.documentPictureInPicture.requestWindow({ width: 260, height: 132 });
  pip.document.head.innerHTML = `<meta charset="utf-8"><style>
    body{margin:0;background:#0f1422;color:#eef0f8;font-family:ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;height:100vh}
    .wrap{display:grid;gap:8px;justify-items:center;width:100%;padding:10px}
    button{appearance:none;border:0;border-radius:999px;padding:12px 22px;font-size:16px;font-weight:800;background:${accent};color:#fff;cursor:pointer;width:90%}
    button:active{transform:scale(.97)} small{color:#a7a4ad;font-size:12px} .flash{animation:f .35s} @keyframes f{0%{background:#fff}100%{background:${accent}}} button{text-shadow:0 1px 1px rgba(0,0,0,.25)}
  </style>`;
  pip.document.body.innerHTML = `<div class="wrap"><button type="button" id="shot">Capture</button><small id="count">0 captures</small></div>`;
  const button = pip.document.getElementById('shot');
  const setCount = n => { const el = pip.document.getElementById('count'); if (el) el.textContent = `${n} capture${n === 1 ? '' : 's'}`; button.classList.remove('flash'); void button.offsetWidth; button.classList.add('flash'); };
  button.addEventListener('click', async () => { button.disabled = true; try { await onShot(); } finally { button.disabled = false; } });
  pip.addEventListener('pagehide', () => onClose?.());
  return { setCount, close() { try { pip.close(); } catch { } } };
}
