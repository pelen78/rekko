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

const W = 48, H = 30;
const screen = (fill = 10) => new Uint8Array(W * H).fill(fill);
const paintRect = (g, x, y, w, h, v) => { const o = g.slice(); for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) o[j * W + i] = v; return o; };

test('changeBox frames the area that changed and ignores full-screen changes', async () => {
  const { changeBox } = await import('../change-detector.mjs');
  const menu = paintRect(screen(), 8, 8, 8, 8, 220);
  assert.deepEqual(changeBox(screen(), menu, W, H, { pad: 0, minSide: 0 }), { x: 8 / W, y: 8 / H, w: 8 / W, h: 8 / H });
  assert.equal(changeBox(screen(), screen(), W, H), null, 'nothing changed');
  assert.equal(changeBox(screen(), screen(220), W, H), null, 'new page: no guess');
});

test('changeBox keeps the biggest group, so a clock ticking elsewhere does not stretch it', async () => {
  const { changeBox } = await import('../change-detector.mjs');
  let after = paintRect(screen(), 4, 12, 10, 8, 220); after = paintRect(after, 44, 0, 3, 2, 220);
  assert.deepEqual(changeBox(screen(), after, W, H, { pad: 0, minSide: 0 }), { x: 4 / W, y: 12 / H, w: 12 / W, h: 8 / H });
});

test('guessClick prefers the hover/pressed button seen just before a page change', async () => {
  const { guessClick } = await import('../change-detector.mjs');
  const prev = screen(), hover = paintRect(prev, 20, 4, 8, 4, 120), next = screen(200);
  const box = guessClick(prev, [prev, hover, hover, next, next], next, W, H);
  assert.ok(box && box.x < 20 / W + .01 && box.x + box.w > 28 / W - .01 && box.y < 4 / H + .01, JSON.stringify(box));
  assert.equal(guessClick(prev, [prev, next], next, W, H), null, 'page change without hover: no guess');
});
