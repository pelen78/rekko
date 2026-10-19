import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRemoteRect, sensibleRect, tooltipFor, hotspotFromMessage, bookmarkletCode } from '../remote.mjs';

const msg = { rect: { x: 100, y: 200, w: 200, h: 50 }, point: { x: 150, y: 220 }, viewport: { w: 1000, h: 800 }, outer: { w: 1000, h: 900 }, screen: { x: 0, y: 40, w: 2000, h: 1200 }, label: '  Deshacer  último  ' };

test('sharing a tab maps page pixels straight onto the frame', () => {
  assert.deepEqual(mapRemoteRect(msg, 'browser'), { x: .1, y: .25, w: .2, h: .0625 });
});

test('sharing a window accounts for the browser chrome above the page', () => {
  const r = mapRemoteRect(msg, 'window');
  assert.equal(r.x, .1);
  assert.ok(Math.abs(r.y - (100 + 200) / 900) < 1e-4);
  assert.ok(Math.abs(r.h - 50 / 900) < 1e-4);
});

test('sharing the whole screen adds the window position', () => {
  const r = mapRemoteRect(msg, 'monitor');
  assert.ok(Math.abs(r.x - 100 / 2000) < 1e-4);
  assert.ok(Math.abs(r.y - (40 + 100 + 200) / 1200) < 1e-4);
});

test('huge targets become a small box around the click; normal ones get a little padding', () => {
  assert.deepEqual(sensibleRect({ ...msg, rect: { x: 0, y: 0, w: 900, h: 700 } }), { x: 102, y: 198, w: 96, h: 44 });
  assert.deepEqual(sensibleRect(msg), { x: 96, y: 196, w: 208, h: 58 });
});

test('the tooltip names the button when there is a label', () => {
  assert.equal(tooltipFor(msg), 'Haz clic en «Deshacer último»');
  assert.equal(tooltipFor({ label: '' }), 'Haz clic aquí');
  assert.equal(tooltipFor({ label: 'x'.repeat(100) }).length, 'Haz clic en «»'.length + 40);
});

test('hotspotFromMessage rejects incomplete messages and clamps inside the frame', () => {
  assert.equal(hotspotFromMessage({ type: 'click' }, 'browser'), null);
  const h = hotspotFromMessage({ ...msg, rect: { x: 990, y: 790, w: 40, h: 40 } }, 'browser');
  assert.ok(h.x + h.w <= 1 && h.y + h.h <= 1);
});

test('the bookmarklet embeds the Rekko URL and is a javascript: URL', () => {
  const code = bookmarkletCode('https://rekko.example/app/');
  assert.ok(code.startsWith('javascript:(function rekkoAgent(url)'));
  assert.ok(code.includes('"https://rekko.example/app/"'));
  assert.ok(code.includes("W.open('', 'rekko')"));
});
