// Rekko · Imágenes: normaliza capturas a WebP/JPEG de hasta 2000 px para que las demos pesen poco.
export const MAX_SIDE = 2000;
const canWebp = () => { try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } };

export async function loadBitmap(source) {
  if (typeof createImageBitmap === 'function' && source instanceof Blob) { try { return await createImageBitmap(source); } catch { } }
  const url = source instanceof Blob ? URL.createObjectURL(source) : source;
  try { return await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('No se pudo leer la imagen.')); im.src = url; }); }
  finally { if (source instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

// Dibuja cualquier fuente (bitmap, video, canvas) en un canvas acotado y devuelve { blob, width, height, type }.
export async function normalizeImage(source, { maxSide = MAX_SIDE, quality = .88, close = true } = {}) {
  const sw = source.videoWidth || source.naturalWidth || source.width, sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) throw new Error('La imagen está vacía.');
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, 0, 0, w, h);
  const type = canWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise(r => canvas.toBlob(r, type, quality));
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  if (close && source.close) source.close();
  return { blob, width: w, height: h, type };
}
export async function imageFromFile(file) {
  if (!/^image\//.test(file.type)) throw new Error(`«${file.name}» no es una imagen.`);
  return normalizeImage(await loadBitmap(file));
}
export const blobToDataUrl = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
export async function dataUrlToBlob(dataUrl) { const res = await fetch(dataUrl); return res.blob(); }
export const stepSrc = step => step.image.dataUrl || (step.image.blob ? URL.createObjectURL(step.image.blob) : '');
