import test from 'node:test';
import assert from 'node:assert/strict';
import { createChangeDetector, frameDiff } from '../change-detector.mjs';

const flat = v => new Uint8Array(100).fill(v);
const half = (a, b) => Uint8Array.from({ length: 100 }, (_, i) => (i < 50 ? a : b));

test('frameDiff is the share of pixels that moved beyond the tolerance', () => {
  assert.equal(frameDiff(flat(10), flat(10)), 0);
  assert.equal(frameDiff(flat(10), flat(200)), 1);
  assert.equal(frameDiff(flat(10), half(10, 200)), .5);
  assert.equal(frameDiff(flat(10), flat(30)), 0, 'small drifts do not count');
  assert.equal(frameDiff(null, flat(1)), 1);
});

test('a change followed by a still screen triggers one capture, then waits for the next change', () => {
  const d = createChangeDetector({ threshold: .05, cooldown: 900 });
  d.markShot(flat(10), 0);
  assert.equal(d.feed(flat(10), 350), false, 'same screen');
  assert.equal(d.feed(half(10, 200), 700), false, 'changed but not yet confirmed still');
  assert.equal(d.feed(half(10, 200), 1050), true, 'changed and still: capture');
  assert.equal(d.feed(half(10, 200), 1400), false, 'already captured this screen');
  assert.equal(d.feed(flat(10), 1750), false);
  assert.equal(d.feed(flat(10), 2100), true, 'back to the first screen is a new change');
});

test('a screen that keeps animating never triggers', () => {
  const d = createChangeDetector({ threshold: .05 });
  d.markShot(flat(0), 0);
  let fired = 0;
  for (let i = 1; i < 20; i++) if (d.feed(flat(i % 2 ? 200 : 0), i * 350)) fired++;
  assert.equal(fired, 0);
});

test('the cooldown spaces captures and a manual shot resets the reference', () => {
  const d = createChangeDetector({ threshold: .05, cooldown: 900 });
  d.markShot(flat(0), 0);
  d.feed(flat(100), 300);
  assert.equal(d.feed(flat(100), 600), false, 'inside the cooldown');
  assert.equal(d.feed(flat(100), 1000), true);
  d.markShot(flat(200), 1200);
  assert.equal(d.feed(flat(200), 2200), false, 'the manual shot already covers this screen');
});
