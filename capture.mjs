// Rekko · Captura de pantallas sin extensión: compartes una ventana o pestaña y tomas fotos cuando quieras.
import { normalizeImage } from './images.mjs';

export const canCapture = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
export const canFloat = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

export async function startCapture() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 10 }, cursor: 'never' }, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', preferCurrentTab: false });
  const video = document.createElement('video'); video.srcObject = stream; video.muted = true; video.playsInline = true;
  await video.play();
  await new Promise(r => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  const track = stream.getVideoTracks()[0];
  const label = track.label || 'Pantalla compartida';
  const ended = new Promise(resolve => track.addEventListener('ended', resolve, { once: true }));
  return {
    label, ended, video,
    get active() { return track.readyState === 'live'; },
    async shot() { if (track.readyState !== 'live') throw new Error('Ya no se está compartiendo la pantalla.'); return normalizeImage(video); },
    stop() { stream.getTracks().forEach(t => t.stop()); video.srcObject = null; },
  };
}

// Ventanita flotante (Chrome) con el botón de capturar, que queda encima de todo mientras usas tu app.
export async function openFloatingButton({ onShot, onClose, accent = '#f88c80' }) {
  const pip = await window.documentPictureInPicture.requestWindow({ width: 260, height: 132 });
  pip.document.head.innerHTML = `<meta charset="utf-8"><style>
    body{margin:0;background:#15161c;color:#f3f1ee;font-family:ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;height:100vh}
    .wrap{display:grid;gap:8px;justify-items:center;width:100%;padding:10px}
    button{appearance:none;border:0;border-radius:999px;padding:12px 22px;font-size:16px;font-weight:800;background:${accent};color:#1d1210;cursor:pointer;width:90%}
    button:active{transform:scale(.97)} small{color:#a7a4ad;font-size:12px} .flash{animation:f .35s} @keyframes f{0%{background:#fff}100%{background:${accent}}}
  </style>`;
  pip.document.body.innerHTML = `<div class="wrap"><button type="button" id="shot">📸 Capturar</button><small id="count">0 capturas</small></div>`;
  let n = 0;
  const button = pip.document.getElementById('shot');
  button.addEventListener('click', async () => { button.disabled = true; try { await onShot(); n += 1; pip.document.getElementById('count').textContent = `${n} captura${n === 1 ? '' : 's'}`; button.classList.remove('flash'); void button.offsetWidth; button.classList.add('flash'); } finally { button.disabled = false; } });
  pip.addEventListener('pagehide', () => onClose?.());
  return { close() { try { pip.close(); } catch { } } };
}
