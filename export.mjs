// Rekko · Exporta el proyecto a MP4 (H.264 + AAC) en el navegador con WebCodecs y Mediabunny.
import { drawFrame, frameRect } from './render.mjs';
import { outputDuration } from './timeline.mjs';

export const RESOLUTIONS = [
  { id: '1080p', name: '1080p · 1920 × 1080', width: 1920, height: 1080, bitrate: 10_000_000 },
  { id: '720p', name: '720p · 1280 × 720', width: 1280, height: 720, bitrate: 6_000_000 },
  { id: 'vertical', name: 'Vertical · 1080 × 1920', width: 1080, height: 1920, bitrate: 10_000_000 },
];
export const resolutionById = id => RESOLUTIONS.find(r => r.id === id) || RESOLUTIONS[0];

async function collectAudio(mb, track, start, end) {
  const sampleRate = track.sampleRate, channels = track.numberOfChannels;
  const length = Math.max(1, Math.round((end - start) * sampleRate));
  const planes = Array.from({ length: channels }, () => new Float32Array(length));
  const sink = new mb.AudioBufferSink(track);
  for await (const { buffer, timestamp } of sink.buffers(start, end)) {
    const offset = Math.round((timestamp - start) * sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
      const from = Math.max(0, -offset), to = Math.min(data.length, length - offset);
      if (to > from) planes[ch].set(data.subarray(from, to), offset + from);
    }
  }
  const audio = new AudioBuffer({ length, sampleRate, numberOfChannels: channels });
  planes.forEach((plane, ch) => audio.copyToChannel(plane, ch));
  return audio;
}

// Elige el formato: MP4 (H.264 + AAC) cuando el navegador puede; si no, WebM (VP9 + Opus).
export async function chooseFormat(mb, { width, height, fps, quality, audio }) {
  const mp4Video = await mb.canEncodeVideo('avc', { width, height, frameRate: fps, quality });
  const mp4Audio = !audio || await mb.canEncodeAudio('aac', { sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels });
  if (mp4Video && mp4Audio) return { container: 'mp4', extension: 'mp4', mime: 'video/mp4', videoCodec: 'avc', audioCodec: 'aac', format: () => new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) };
  const webmVideo = await mb.canEncodeVideo('vp9', { width, height, frameRate: fps, quality });
  const webmAudio = !audio || await mb.canEncodeAudio('opus', { sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels });
  if (webmVideo && webmAudio) return { container: 'webm', extension: 'webm', mime: 'video/webm', videoCodec: 'vp9', audioCodec: 'opus', format: () => new mb.WebMOutputFormat() };
  throw new Error('Este navegador no puede crear el video. Usa una versión reciente de Chrome, Edge o Safari.');
}

// Devuelve { blob, extension, container, withAudio }.
export async function exportVideo(blob, project, { resolution = '1080p', signal, onProgress = () => {} } = {}) {
  const mb = await import('./vendor/mediabunny.mjs');
  const { width, height, bitrate } = resolutionById(resolution);
  const fps = project.settings.fps, quality = new mb.Quality({ bitrate });
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('La grabación no tiene video.');
  if (!await videoTrack.canDecode()) throw new Error('El navegador no puede leer el video grabado.');
  const audioTrack = project.source.hasAudio ? await input.getPrimaryAudioTrack() : null;
  const audioInfo = audioTrack && await audioTrack.canDecode() ? { sampleRate: audioTrack.sampleRate, numberOfChannels: audioTrack.numberOfChannels } : null;
  const target = await chooseFormat(mb, { width, height, fps, quality, audio: audioInfo });
  const withAudio = !!audioInfo;
  const abort = () => { if (signal?.aborted) throw new DOMException('Exportación cancelada.', 'AbortError'); };

  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const output = new mb.Output({ format: target.format(), target: new mb.BufferTarget() });
  const videoSource = new mb.CanvasSource(canvas, { codec: target.videoCodec, quality });
  output.addVideoTrack(videoSource, { frameRate: fps });
  const audioSource = withAudio ? new mb.AudioBufferSource({ codec: target.audioCodec, quality: new mb.Quality({ bitrate: 128_000 }) }) : null;
  if (audioSource) output.addAudioTrack(audioSource);

  const start = project.trim.start, length = outputDuration(project), frames = Math.max(1, Math.round(length * fps));
  const frame = frameRect(project, width, height);
  try {
    abort(); await output.start();
    if (audioSource) { await audioSource.add(await collectAudio(mb, audioTrack, start, start + length)); audioSource.close(); }
    const sink = new mb.CanvasSink(videoTrack, { poolSize: 3 });
    const iterator = sink.canvases(start, start + length)[Symbol.asyncIterator]();
    let current = await iterator.next(), next = current.done ? current : await iterator.next();
    for (let i = 0; i < frames; i++) {
      abort();
      const t = start + i / fps;
      while (!next.done && next.value.timestamp <= t) { current = next; next = await iterator.next(); }
      drawFrame(ctx, current.done ? null : current.value.canvas, project, t, { width, height, frame });
      await videoSource.add(i / fps, 1 / fps, { keyFrame: i % (fps * 2) === 0 });
      if (i % 10 === 0) { onProgress(i / frames); await new Promise(r => setTimeout(r, 0)); }
    }
    await iterator.return?.();
    videoSource.close(); abort(); await output.finalize(); onProgress(1);
    return { blob: new Blob([output.target.buffer], { type: target.mime }), extension: target.extension, container: target.container, withAudio };
  } catch (e) { await output.cancel().catch(() => {}); throw e; }
  finally { input.dispose?.(); }
}
