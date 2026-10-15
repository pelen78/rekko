// Rekko · Captura de pantalla con micrófono opcional, usando MediaRecorder.
export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined';

const MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
export const pickMimeType = (isSupported = t => MediaRecorder.isTypeSupported(t)) => MIME_CANDIDATES.find(isSupported) || '';

// Pide la pantalla (pestaña o ventana), opcionalmente el micrófono, y empieza a grabar.
// Devuelve { stream, stop(), onEnded } · stop() resuelve con { blob, duration, width, height, hasAudio, mimeType }.
// `beforeStart` corre con la pantalla ya elegida y antes de grabar: sirve para una cuenta regresiva.
export async function startRecording({ microphone = false, frameRate = 30, beforeStart = async () => {} } = {}) {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: frameRate, max: 60 }, cursor: 'always' },
    audio: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude',
    monitorTypeSurfaces: 'include',
  });
  let mic = null;
  if (microphone) {
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); }
    catch (e) { display.getTracks().forEach(t => t.stop()); throw new Error('No se pudo usar el micrófono. Revisa el permiso del navegador o graba sin voz.'); }
  }
  const tracks = [...display.getVideoTracks(), ...(mic ? mic.getAudioTracks() : [])];
  const stream = new MediaStream(tracks);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 });
  const chunks = [];
  const settings = display.getVideoTracks()[0].getSettings();
  let startedAt = 0, stoppedAt = 0, finished = null;
  const done = new Promise((resolve, reject) => {
    recorder.addEventListener('dataavailable', e => { if (e.data?.size) chunks.push(e.data); });
    recorder.addEventListener('error', e => reject(e.error || new Error('La grabación falló.')));
    recorder.addEventListener('stop', () => {
      stoppedAt = stoppedAt || performance.now();
      tracks.forEach(t => t.stop()); mic?.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
      resolve({ blob, duration: Math.max(0, (stoppedAt - startedAt) / 1000), width: settings.width || 1280, height: settings.height || 720, hasAudio: !!mic, mimeType: blob.type });
    });
  });
  const stop = () => { if (!finished) { finished = done; stoppedAt = performance.now(); if (recorder.state !== 'inactive') recorder.stop(); } return finished; };
  const ended = new Promise(resolve => display.getVideoTracks()[0].addEventListener('ended', () => resolve(stop())));
  try { await beforeStart(stream); } catch (e) { tracks.forEach(t => t.stop()); mic?.getTracks().forEach(t => t.stop()); throw e; }
  if (display.getVideoTracks()[0].readyState === 'ended') { mic?.getTracks().forEach(t => t.stop()); throw new Error('Se dejó de compartir la pantalla antes de empezar.'); }
  recorder.start(250);
  startedAt = performance.now();
  return { stream, stop, onEnded: ended, mimeType };
}

// Los WebM de MediaRecorder llegan sin duración. Este truco la hace aparecer y permite buscar.
export function ensureSeekable(video, fallbackDuration) {
  return new Promise(resolve => {
    const finish = () => resolve(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : fallbackDuration);
    if (Number.isFinite(video.duration) && video.duration > 0) return finish();
    const onUpdate = () => { video.removeEventListener('timeupdate', onUpdate); video.currentTime = 0; finish(); };
    video.addEventListener('timeupdate', onUpdate);
    video.currentTime = 1e101;
    setTimeout(() => { video.removeEventListener('timeupdate', onUpdate); finish(); }, 2500);
  });
}
