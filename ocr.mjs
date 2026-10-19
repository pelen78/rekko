// Rekko · Lee el texto del botón marcado (OCR) para escribir el globo «Haz clic en …» al compartir pantalla.
// Usa Tesseract.js, que corre dentro del navegador: la imagen no sale de tu equipo. Solo se descarga el motor la primera vez.
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the text reader.')); document.head.append(s); });
}
async function getWorker() {
  if (!workerPromise) workerPromise = (async () => {
    if (!window.Tesseract) await loadScript(TESSERACT);
    const worker = await window.Tesseract.createWorker(['eng', 'spa'], 1, { logger: () => { } });
    await worker.setParameters({ tessedit_pageseg_mode: '7' }); // una línea de texto, como la etiqueta de un botón
    return worker;
  })().catch(e => { workerPromise = null; throw e; });
  return workerPromise;
}

// Limpia lo leído y se queda con una etiqueta corta y creíble, o '' si no hay nada útil.
export function cleanLabel(raw) {
  const lines = String(raw || '').split(/\n+/).map(l => l.replace(/[|_~`^«»“”"<>{}\[\]]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const line of lines) {
    const letters = (line.match(/\p{L}/gu) || []).length;
    if (letters >= 2 && letters / line.replace(/\s/g, '').length >= .6) return line.slice(0, 40).trim();
  }
  return '';
}

// Deja el texto negro sobre blanco: el tono más común del centro es el fondo del botón; lo que se aleja de él es texto.
// Las manchas que tocan el borde (el margen alrededor del botón) se borran, porque el texto rara vez toca el borde.
export function textMask(gray, w, h, contrast = 40) {
  // Fondo = tono más repetido en el centro de la zona (el margen exterior puede ser de otro color).
  const hist = new Uint32Array(52);
  for (let y = Math.floor(h * .2); y < Math.ceil(h * .8); y++) for (let x = Math.floor(w * .2); x < Math.ceil(w * .8); x++) hist[gray[y * w + x] / 5 | 0]++;
  let top = 0; for (let i = 1; i < hist.length; i++) if (hist[i] > hist[top]) top = i;
  const bg = top * 5 + 2;
  const ink = new Uint8Array(gray.length); for (let i = 0; i < gray.length; i++) ink[i] = Math.abs(gray[i] - bg) > contrast ? 1 : 0;
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const k = stack.pop(); if (!ink[k]) continue; ink[k] = 0;
    const x = k % w, y = (k / w) | 0;
    if (x > 0) stack.push(k - 1); if (x < w - 1) stack.push(k + 1); if (y > 0) stack.push(k - w); if (y < h - 1) stack.push(k + w);
  }
  return ink;
}

// Recorta la zona del recuadro en la imagen del paso, la agranda y la lee.
export async function readLabel(blob, box) {
  const bitmap = await createImageBitmap(blob);
  try {
    const sx = Math.round(box.x * bitmap.width), sy = Math.round(box.y * bitmap.height), sw = Math.round(box.w * bitmap.width), sh = Math.round(box.h * bitmap.height);
    if (sw < 4 || sh < 4) return '';
    const scale = Math.min(4, Math.max(1, 100 / sh));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height, px = ctx.getImageData(0, 0, W, H);
    const gray = new Uint8Array(W * H); for (let i = 0; i < gray.length; i++) gray[i] = (px.data[i * 4] * 3 + px.data[i * 4 + 1] * 6 + px.data[i * 4 + 2]) / 10;
    const ink = textMask(gray, W, H);
    for (let i = 0; i < ink.length; i++) { const v = ink[i] ? 0 : 255; px.data[i * 4] = px.data[i * 4 + 1] = px.data[i * 4 + 2] = v; px.data[i * 4 + 3] = 255; }
    const clean = document.createElement('canvas'); clean.width = W + 40; clean.height = H + 40;
    const cctx = clean.getContext('2d'); cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, clean.width, clean.height); cctx.putImageData(px, 20, 20);
    const worker = await getWorker();
    let best = { text: '', confidence: 0 };
    for (const source of [clean, canvas]) {
      const { data } = await worker.recognize(source);
      const text = cleanLabel(data.text);
      if (text && data.confidence > best.confidence) best = { text, confidence: data.confidence };
      if (best.confidence >= 80) break;
    }
    return best.confidence >= 45 ? best.text : '';
  } finally { bitmap.close?.(); }
}
