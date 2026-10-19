import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, addStep, removeStep, moveStep, duplicateStep, updateStep, setHotspot, normalizeHotspot, rectFromDrag, pointInHotspot, fitRect, placeTooltip, validateDemo, playableDemo, HOTSPOT, MAX_STEPS } from '../model.mjs';

const img = (n = 1) => ({ width: 1600, height: 900, type: 'image/webp', dataUrl: `data:image/webp;base64,${n}` });

test('a new demo has no steps and sensible settings', () => {
  const d = createDemo('Editor de tarjetas');
  assert.equal(d.title, 'Editor de tarjetas');
  assert.deepEqual(d.steps, []);
  assert.equal(d.settings.showProgress, true);
});

test('steps are added, duplicated, moved and removed keeping order', () => {
  let d = addStep(createDemo(), img(1)); d = addStep(d, img(2)); d = addStep(d, img(3));
  const [a, b, c] = d.steps;
  d = moveStep(d, c.id, 0);
  assert.deepEqual(d.steps.map(s => s.id), [c.id, a.id, b.id]);
  d = moveStep(d, c.id, 99);
  assert.deepEqual(d.steps.map(s => s.id), [a.id, b.id, c.id]);
  d = duplicateStep(d, a.id);
  assert.equal(d.steps.length, 4); assert.equal(d.steps[1].image.dataUrl, a.image.dataUrl); assert.notEqual(d.steps[1].id, a.id);
  d = removeStep(d, b.id);
  assert.equal(d.steps.length, 3);
  d = addStep(d, img(9), 0);
  assert.equal(d.steps[0].image.dataUrl, img(9).dataUrl);
});

test('the step limit is enforced', () => {
  let d = createDemo();
  for (let i = 0; i < MAX_STEPS + 5; i++) d = addStep(d, img(i));
  assert.equal(d.steps.length, MAX_STEPS);
});

test('hotspots are clamped inside the image with a minimum size', () => {
  assert.deepEqual(normalizeHotspot({ x: .95, y: .5, w: .2, h: .1 }), { x: .8, y: .5, w: .2, h: .1 });
  assert.deepEqual(normalizeHotspot({ x: .5, y: .5, w: 0, h: 0 }), { x: .5, y: .5, w: HOTSPOT.min, h: HOTSPOT.min });
  assert.equal(normalizeHotspot(null), null);
  assert.deepEqual(rectFromDrag({ x: .6, y: .4 }, { x: .2, y: .1 }), { x: .2, y: .1, w: .4, h: .3 });
  assert.equal(pointInHotspot({ x: .3, y: .2 }, { x: .2, y: .1, w: .4, h: .3 }), true);
  assert.equal(pointInHotspot({ x: .7, y: .2 }, { x: .2, y: .1, w: .4, h: .3 }), false);
});

test('setting a hotspot switches the step to advance on click; removing it goes back to the button', () => {
  let d = addStep(createDemo(), img());
  const id = d.steps[0].id;
  assert.equal(d.steps[0].advance, 'button');
  d = setHotspot(d, id, { x: .1, y: .1, w: .2, h: .1 });
  assert.equal(d.steps[0].advance, 'hotspot');
  d = updateStep(d, id, { advance: 'button' });
  d = setHotspot(d, id, { x: .2, y: .2, w: .2, h: .1 });
  assert.equal(d.steps[0].advance, 'button', 'an explicit choice survives moving the hotspot');
  d = setHotspot(d, id, null);
  assert.equal(d.steps[0].hotspot, null); assert.equal(d.steps[0].advance, 'button');
});

test('updateStep merges tooltip fields instead of replacing them', () => {
  let d = addStep(createDemo(), img());
  d = updateStep(d, d.steps[0].id, { tooltip: { title: 'Paso 1' } });
  assert.deepEqual(d.steps[0].tooltip, { title: 'Paso 1', text: 'Haz clic aquí', placement: 'auto' });
});

test('fitRect keeps the aspect ratio and centers', () => {
  assert.deepEqual(fitRect(1600, 900, 800, 800), { x: 0, y: 175, w: 800, h: 450, scale: .5 });
  assert.deepEqual(fitRect(900, 1600, 800, 800), { x: 175, y: 0, w: 450, h: 800, scale: .5 });
});

test('the tooltip goes below when it fits, above when it does not, and stays inside the box', () => {
  const image = { x: 0, y: 0, w: 1000, h: 600 }, box = { w: 1000, h: 600 }, tooltip = { w: 260, h: 90 };
  const low = placeTooltip({ hotspot: { x: .4, y: .1, w: .1, h: .05 }, image, tooltip, box });
  assert.equal(low.side, 'bottom'); assert.ok(low.y > 60 + 14 - 1);
  const high = placeTooltip({ hotspot: { x: .4, y: .9, w: .1, h: .08 }, image, tooltip, box });
  assert.equal(high.side, 'top'); assert.ok(high.y + tooltip.h <= 540);
  const forced = placeTooltip({ hotspot: { x: .4, y: .1, w: .1, h: .05 }, image, tooltip, box, placement: 'right' });
  assert.equal(forced.side, 'right'); assert.equal(forced.x, 500 + 14);
  const edge = placeTooltip({ hotspot: { x: .95, y: .1, w: .05, h: .05 }, image, tooltip, box });
  assert.ok(edge.x + tooltip.w <= box.w - 8, 'never overflows on the right');
});

test('validateDemo cleans an imported demo and drops steps without image', () => {
  const d = validateDemo({ title: 'X', theme: { accent: 'rojo' }, settings: { finalLink: 'javascript:alert(1)', showProgress: 'no' }, steps: [
    { image: img(), hotspot: { x: 2, y: 2, w: 5, h: 5 }, tooltip: { text: 'Hola', placement: 'diagonal' }, advance: 'hotspot' },
    { image: null }, { tooltip: { text: 'sin imagen' } }, { image: img(2), advance: 'hotspot' },
  ] });
  assert.equal(d.theme.accent, '#f88c80');
  assert.equal(d.settings.finalLink, '');
  assert.equal(d.settings.showProgress, true);
  assert.equal(d.steps.length, 2);
  assert.deepEqual(d.steps[0].hotspot, { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(d.steps[0].tooltip.placement, 'auto');
  assert.equal(d.steps[0].advance, 'hotspot');
  assert.equal(d.steps[1].advance, 'button', 'no hotspot means button');
});

test('playableDemo swaps images for data URLs and drops nothing the player needs', () => {
  let d = addStep(createDemo('Demo'), img(1)); d = addStep(d, img(2));
  const p = playableDemo(d, ['data:a', 'data:b']);
  assert.equal(p.steps.length, 2); assert.equal(p.steps[1].image.src, 'data:b'); assert.equal(p.steps[0].image.width, 1600);
  assert.equal('blob' in p.steps[0].image, false);
});
