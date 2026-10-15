import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addClick, removeClick, addZoom, updateZoom, removeZoom, zoomsFromClicks, cameraAt, visibleRect, clickPulses, setTrim, outputDuration, frameToSource, sourceToFrame, formatTime, validateProject, DEFAULTS, ZOOM_SCALE } from '../timeline.mjs';

const source = { width: 1920, height: 1080, duration: 20, hasAudio: true };

test('a new project covers the whole recording with no zooms or clicks', () => {
  const p = createProject(source);
  assert.deepEqual(p.trim, { start: 0, end: 20 });
  assert.equal(outputDuration(p), 20);
  assert.deepEqual(p.clicks, []);
  assert.deepEqual(p.zooms, []);
  assert.deepEqual(cameraAt(p, 5), { x: .5, y: .5, scale: 1 });
});

test('clicks stay sorted, clamped, and can be removed', () => {
  let p = addClick(createProject(source), 8, .9, .2);
  p = addClick(p, 3, 1.4, -2);
  assert.deepEqual(p.clicks.map(c => [c.time, c.x, c.y]), [[3, 1, 0], [8, .9, .2]]);
  p = removeClick(p, p.clicks[0].id);
  assert.equal(p.clicks.length, 1);
  assert.equal(p.clicks[0].time, 8);
});

test('click pulses only exist during their length and report progress', () => {
  const p = addClick(createProject(source), 5, .3, .4);
  assert.deepEqual(clickPulses(p, 4.9), []);
  const [pulse] = clickPulses(p, 5 + DEFAULTS.clickPulse / 2);
  assert.equal(pulse.x, .3);
  assert.ok(Math.abs(pulse.progress - .5) < 1e-9);
  assert.deepEqual(clickPulses(p, 5 + DEFAULTS.clickPulse), []);
});

test('zooms never overlap: a new one is trimmed against its neighbours or dropped', () => {
  let p = addZoom(createProject(source), { start: 2, end: 6, x: .2, y: .2, scale: 2 });
  p = addZoom(p, { start: 5, end: 9, x: .8, y: .8, scale: 3 });
  assert.deepEqual(p.zooms.map(z => [z.start, z.end]), [[2, 6], [6, 9]]);
  const swallowed = addZoom(p, { start: 3, end: 4 });
  assert.equal(swallowed.zooms.length, 2, 'a zoom inside another one is not added');
  const tiny = addZoom(p, { start: 5.9, end: 6.1 });
  assert.equal(tiny.zooms.length, 2, 'what remains after trimming must be long enough');
  assert.equal(addZoom(p, { start: 1, end: 3, scale: 99 }).zooms[0].scale, ZOOM_SCALE.max);
});

test('updating a zoom keeps order and refuses to invade a neighbour', () => {
  let p = addZoom(createProject(source), { start: 2, end: 4 });
  p = addZoom(p, { start: 8, end: 10 });
  const [first, second] = p.zooms;
  p = updateZoom(p, first.id, { start: 3, end: 9 });
  assert.deepEqual(p.zooms.map(z => [z.start, z.end]), [[3, 8], [8, 10]]);
  p = updateZoom(p, second.id, { scale: 2.5, x: .1 });
  assert.equal(p.zooms[1].scale, 2.5);
  assert.equal(p.zooms[1].x, .1);
  p = removeZoom(p, first.id);
  assert.equal(p.zooms.length, 1);
});

test('zooms from clicks surround each click and skip clicks already covered', () => {
  let p = addClick(createProject(source), 5, .25, .75);
  p = addClick(p, 5.5, .6, .6);
  p = addClick(p, 12, .9, .1);
  p = zoomsFromClicks(p);
  assert.equal(p.zooms.length, 2, 'the second click falls inside the first zoom');
  assert.ok(Math.abs(p.zooms[0].start - (5 - DEFAULTS.zoomLead)) < 1e-9);
  assert.ok(Math.abs(p.zooms[0].end - (5 - DEFAULTS.zoomLead + DEFAULTS.zoomDuration)) < 1e-9);
  assert.deepEqual([p.zooms[0].x, p.zooms[0].y], [.25, .75]);
  assert.deepEqual([p.zooms[1].x, p.zooms[1].y], [.9, .1]);
  assert.equal(zoomsFromClicks(p).zooms.length, 2, 'running it again adds nothing');
});

test('the camera eases into a zoom, holds it, and eases out', () => {
  const p = addZoom(createProject(source), { start: 4, end: 8, x: .2, y: .3, scale: 2 });
  const tr = p.settings.transition;
  assert.deepEqual(cameraAt(p, 4 - tr), { x: .5, y: .5, scale: 1 });
  const mid = cameraAt(p, 4 - tr / 2);
  assert.ok(mid.scale > 1 && mid.scale < 2);
  assert.ok(mid.x > .2 && mid.x < .5);
  assert.deepEqual(cameraAt(p, 6), { x: .2, y: .3, scale: 2 });
  const leaving = cameraAt(p, 8 + tr / 2);
  assert.ok(leaving.scale > 1 && leaving.scale < 2);
  assert.deepEqual(cameraAt(p, 8 + tr), { x: .5, y: .5, scale: 1 });
});

test('two adjacent zooms blend directly without passing through the full view', () => {
  let p = addZoom(createProject(source), { start: 2, end: 6, x: .2, y: .2, scale: 2 });
  p = addZoom(p, { start: 6, end: 10, x: .8, y: .8, scale: 2 });
  for (const t of [5.8, 6, 6.2]) {
    const c = cameraAt(p, t);
    assert.ok(Math.abs(c.scale - 2) < 1e-9, `scale stays at 2 around the boundary (t=${t})`);
    assert.ok(c.x >= .2 && c.x <= .8);
  }
});

test('the visible rectangle keeps the aspect ratio and never leaves the recording', () => {
  assert.deepEqual(visibleRect({ x: .5, y: .5, scale: 1 }, 1920, 1080), { x: 0, y: 0, w: 1920, h: 1080 });
  assert.deepEqual(visibleRect({ x: .5, y: .5, scale: 2 }, 1920, 1080), { x: 480, y: 270, w: 960, h: 540 });
  assert.deepEqual(visibleRect({ x: 0, y: 1, scale: 2 }, 1920, 1080), { x: 0, y: 540, w: 960, h: 540 });
});

test('frame and source coordinates round-trip through the camera', () => {
  const frame = { x: 100, y: 50, w: 1600, h: 900 }, camera = { x: .3, y: .7, scale: 2.5 };
  for (const point of [{ x: .31, y: .68 }, { x: .2, y: .9 }]) {
    const px = sourceToFrame(point, camera, 1920, 1080, frame);
    const back = frameToSource(px, camera, 1920, 1080, frame);
    assert.ok(Math.abs(back.x - point.x) < 1e-9 && Math.abs(back.y - point.y) < 1e-9);
  }
  const outside = frameToSource({ x: -500, y: 5000 }, camera, 1920, 1080, frame);
  assert.deepEqual(outside, { x: 0, y: 1 });
});

test('trim is clamped to the recording and keeps a minimum length', () => {
  let p = setTrim(createProject(source), { start: -3, end: 50 });
  assert.deepEqual(p.trim, { start: 0, end: 20 });
  p = setTrim(p, { start: 5, end: 5 });
  assert.ok(outputDuration(p) >= .1 - 1e-9);
  p = setTrim(p, { start: 2.5, end: 9.25 });
  assert.equal(outputDuration(p), 6.75);
});

test('formatTime shows minutes and tenths', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(65.26), '1:05.3');
  assert.equal(formatTime(9.99, { decimals: 0 }), '0:10');
});

test('validateProject cleans a stored project and drops broken entries', () => {
  const p = validateProject({ frame: { padding: 9, radius: -4, shadow: 'yes' }, trim: { start: 1, end: 999 }, clicks: [{ time: 2, x: .1, y: .1 }, { time: 'x' }], zooms: [{ start: 3, end: 5, scale: .1 }, { start: 4 }], settings: { transition: 50 } }, source);
  assert.equal(p.frame.padding, .25);
  assert.equal(p.frame.radius, 0);
  assert.equal(p.frame.shadow, true);
  assert.deepEqual(p.trim, { start: 1, end: 20 });
  assert.equal(p.clicks.length, 1);
  assert.equal(p.zooms.length, 1);
  assert.equal(p.zooms[0].scale, ZOOM_SCALE.min);
  assert.equal(p.settings.transition, 2);
  assert.deepEqual(validateProject(null, source).trim, { start: 0, end: 20 });
});
