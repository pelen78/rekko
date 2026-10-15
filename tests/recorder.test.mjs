import test from 'node:test';
import assert from 'node:assert/strict';
import { pickMimeType } from '../recorder.mjs';

test('the recorder prefers WebM with VP9 and falls back down the list', () => {
  assert.equal(pickMimeType(() => true), 'video/webm;codecs=vp9,opus');
  assert.equal(pickMimeType(t => t.startsWith('video/mp4')), 'video/mp4;codecs=avc1,mp4a.40.2');
  assert.equal(pickMimeType(t => t === 'video/webm'), 'video/webm');
  assert.equal(pickMimeType(() => false), '');
});
