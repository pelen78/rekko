import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, addStep, setHotspot, validateDemo, playableDemo, normalizeEdits, hasEdits, describeEdits, remapThroughCrop, setStepScreen } from '../model.mjs';
import { backupJson } from '../export.mjs';

const img = (n = 1, w = 1600, h = 900) => ({ width: w, height: h, type: 'image/webp', dataUrl: `data:image/webp;base64,${n}` });

test('normalizeEdits drops invalid marks, clamps rects and ignores a full-size crop', () => {
  const e = normalizeEdits({
    crop: { x: 0, y: 0, w: 1, h: 1 },
    blurs: [{ x: .9, y: .9, w: .5, h: .5 }, { x: .1, y: .1, w: 0, h: .2 }],
    marks: [{ type: 'box', x: .1, y: .1, w: .2, h: .2, color: 'red', size: 9 }, { type: 'arrow', x1: .5, y1: .5, x2: .5, y2: .5 }, { type: 'text', x: .3, y: .3, text: '  Hola  ' }, { type: 'star' }],
  });
  assert.equal(e.crop, null);
  assert.deepEqual(e.blurs, [{ x: .9, y: .9, w: .1, h: .1 }]);
  assert.equal(e.marks.length, 2);
  assert.deepEqual(e.marks[0], { type: 'box', color: '#ff3b30', size: 2, x: .1, y: .1, w: .2, h: .2 });
  assert.equal(e.marks[1].text, 'Hola');
  assert.equal(hasEdits(normalizeEdits(null)), false);
  assert.equal(normalizeEdits({ crop: { x: .1, y: .1, w: .02, h: .5 } }).crop, null, 'a tiny crop is ignored');
});

test('describeEdits summarizes the edits', () => {
  assert.equal(describeEdits(normalizeEdits({ crop: { x: .1, y: .1, w: .5, h: .5 }, blurs: [{ x: 0, y: 0, w: .1, h: .1 }], marks: [] })), 'Cropped · 1 blur');
  assert.equal(describeEdits(null), '');
});

test('remapThroughCrop moves a click area into a crop and back', () => {
  const h = { x: .5, y: .5, w: .1, h: .1 };
  const crop = { x: .5, y: .5, w: .5, h: .5 };
  const inCrop = remapThroughCrop(h, null, crop);
  assert.deepEqual(inCrop, { x: 0, y: 0, w: .2, h: .2 });
  assert.deepEqual(remapThroughCrop(inCrop, crop, null), h);
  assert.equal(remapThroughCrop({ x: 0, y: 0, w: .1, h: .1 }, null, crop), null, 'an area outside the crop is removed');
});

test('setStepScreen keeps the original, remaps the hotspot and restores cleanly', () => {
  let d = addStep(createDemo('x', 'en'), img(1));
  const id = d.steps[0].id;
  d = setHotspot(d, id, { x: .6, y: .6, w: .1, h: .1 });
  const original = d.steps[0].image;
  d = setStepScreen(d, id, { image: img(2, 800, 450), original, edits: { crop: { x: .5, y: .5, w: .5, h: .5 }, marks: [{ type: 'text', x: .1, y: .1, text: 'Hi' }] } });
  let s = d.steps[0];
  assert.equal(s.image.dataUrl, img(2).dataUrl); assert.equal(s.image.width, 800);
  assert.equal(s.original.dataUrl, img(1).dataUrl);
  assert.deepEqual(s.hotspot, { x: .2, y: .2, w: .2, h: .2 });
  assert.equal(s.advance, 'hotspot');
  d = setStepScreen(d, id, { image: original, original, edits: null });
  s = d.steps[0];
  assert.equal(s.original, null); assert.equal(s.edits, null);
  assert.equal(s.image.dataUrl, img(1).dataUrl);
  assert.deepEqual(s.hotspot, { x: .6, y: .6, w: .1, h: .1 });
});

test('edits survive validation and backups, and stay out of the player', () => {
  let d = addStep(createDemo('x', 'en'), img(1));
  const id = d.steps[0].id;
  d = setStepScreen(d, id, { image: img(2), original: d.steps[0].image, edits: { blurs: [{ x: .1, y: .1, w: .2, h: .2 }] } });
  const again = validateDemo(JSON.parse(backupJson(d, [img(2).dataUrl], [img(1).dataUrl])));
  assert.equal(again.steps[0].original.dataUrl, img(1).dataUrl);
  assert.equal(again.steps[0].edits.blurs.length, 1);
  const p = playableDemo(again, ['data:x']);
  assert.equal('original' in p.steps[0], false); assert.equal('edits' in p.steps[0], false);
});
