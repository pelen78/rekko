import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseFormat, RESOLUTIONS, resolutionById } from '../export.mjs';

const fakeMb = (video, audio) => ({
  canEncodeVideo: async codec => video.includes(codec),
  canEncodeAudio: async codec => audio.includes(codec),
  Mp4OutputFormat: class { constructor(o) { this.o = o; } },
  WebMOutputFormat: class { },
});
const opts = { width: 1280, height: 720, fps: 30, quality: {}, audio: { sampleRate: 48000, numberOfChannels: 1 } };

test('MP4 with H.264 and AAC is preferred when the browser can encode both', async () => {
  const f = await chooseFormat(fakeMb(['avc', 'vp9'], ['aac', 'opus']), opts);
  assert.equal(f.container, 'mp4'); assert.equal(f.videoCodec, 'avc'); assert.equal(f.audioCodec, 'aac');
  assert.equal(f.format().o.fastStart, 'in-memory');
});

test('without AAC, a recording with voice falls back to WebM; without voice MP4 still works', async () => {
  const mb = fakeMb(['avc', 'vp9'], ['opus']);
  assert.equal((await chooseFormat(mb, opts)).container, 'webm');
  assert.equal((await chooseFormat(mb, { ...opts, audio: null })).container, 'mp4');
});

test('without H.264 the export falls back to WebM with VP9 and Opus', async () => {
  const f = await chooseFormat(fakeMb(['vp9', 'vp8'], ['opus']), opts);
  assert.equal(f.container, 'webm'); assert.equal(f.extension, 'webm'); assert.equal(f.mime, 'video/webm');
});

test('a browser that encodes nothing useful gets a clear error', async () => {
  await assert.rejects(chooseFormat(fakeMb(['vp8'], []), opts), /no puede crear el video/);
});

test('resolutions have unique ids and fall back to 1080p', () => {
  assert.equal(new Set(RESOLUTIONS.map(r => r.id)).size, RESOLUTIONS.length);
  assert.equal(resolutionById('nope').id, '1080p');
  assert.deepEqual([resolutionById('vertical').width, resolutionById('vertical').height], [1080, 1920]);
});
