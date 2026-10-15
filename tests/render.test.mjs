import test from 'node:test';
import assert from 'node:assert/strict';
import { frameRect, BACKGROUNDS, backgroundById } from '../render.mjs';
import { createProject } from '../timeline.mjs';

test('the frame keeps the recording aspect inside the padded canvas', () => {
  const wide = createProject({ width: 1920, height: 1080, duration: 5 });
  const f = frameRect(wide, 1920, 1080);
  assert.equal(f.h, 1080 - 130); assert.equal(f.w, 1689); assert.equal(f.x, 116);
  assert.ok(Math.abs(f.w / f.h - 16 / 9) < .01);
  const tall = createProject({ width: 800, height: 1600, duration: 5 });
  const t = frameRect(tall, 1920, 1080);
  assert.equal(t.h, 1080 - 130); assert.equal(t.w, Math.round(t.h / 2));
  assert.equal(t.x, Math.round((1920 - t.w) / 2));
});

test('without padding the frame fills the canvas when aspects match', () => {
  const p = { ...createProject({ width: 1280, height: 720, duration: 1 }), frame: { padding: 0, radius: 0, shadow: false, background: 'noche' } };
  assert.deepEqual(frameRect(p, 1280, 720), { x: 0, y: 0, w: 1280, h: 720 });
});

test('backgrounds have unique ids and an unknown id falls back to the first', () => {
  assert.equal(new Set(BACKGROUNDS.map(b => b.id)).size, BACKGROUNDS.length);
  assert.equal(backgroundById('nada').id, BACKGROUNDS[0].id);
  assert.equal(backgroundById('noche').name, 'Noche');
});
