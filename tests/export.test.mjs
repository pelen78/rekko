import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildHtml, safeJson, esc, slug, embedSnippet, backupJson } from '../export.mjs';
import { createDemo, addStep, setHotspot, playableDemo } from '../model.mjs';
import { PLAYER_CSS } from '../player.mjs';

const img = n => ({ width: 1600, height: 900, type: 'image/webp', dataUrl: `data:image/webp;base64,${n}` });

test('JSON inside a script tag cannot close the tag', () => {
  const out = safeJson({ text: '</script><script>alert(1)</script> <!-- x' });
  assert.ok(!out.includes('</script>'));
  assert.deepEqual(JSON.parse(out), { text: '</script><script>alert(1)</script> <!-- x' });
});

test('esc escapes markup and slug makes a file name', () => {
  assert.equal(esc(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  assert.equal(slug('Editor de tarjetas · Lumimila ✨'), 'editor-de-tarjetas-lumimila');
  assert.equal(slug('???'), 'demo');
  assert.ok(embedSnippet('demo.html', 'Mi "demo"').includes('title="Mi &quot;demo&quot;"'));
});

test('the exported HTML is self-contained: data, styles and a working player without imports', async () => {
  let demo = addStep(createDemo('Demo <ejemplo>'), img(1)); demo = addStep(demo, img(2));
  demo = setHotspot(demo, demo.steps[0].id, { x: .1, y: .1, w: .2, h: .1 });
  const playable = playableDemo(demo, demo.steps.map(s => s.image.dataUrl));
  const [playerSource, modelSource] = await Promise.all([readFile(new URL('../player.mjs', import.meta.url), 'utf8'), readFile(new URL('../model.mjs', import.meta.url), 'utf8')]);
  const html = buildHtml({ demo: playable, playerSource, playerCss: PLAYER_CSS, modelSource });
  assert.ok(html.includes('<title>Demo &lt;ejemplo&gt;</title>'));
  assert.ok(html.includes('data:image/webp;base64,2'));
  assert.ok(!/^\s*import /m.test(html), 'no import statements remain');
  assert.ok(!/^\s*export /m.test(html), 'no export statements remain');
  assert.ok(html.includes('.rk-hot'));
  // The inline script must at least parse as a classic script.
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});

test('backupJson keeps hotspots and swaps blobs for data URLs', () => {
  let demo = addStep(createDemo('X'), { width: 10, height: 10, type: 'image/webp', blob: { fake: true } });
  demo = setHotspot(demo, demo.steps[0].id, { x: .2, y: .2, w: .2, h: .2 });
  const parsed = JSON.parse(backupJson(demo, ['data:a']));
  assert.equal(parsed.steps[0].image.dataUrl, 'data:a');
  assert.equal('blob' in parsed.steps[0].image, false);
  assert.deepEqual(parsed.steps[0].hotspot, { x: .2, y: .2, w: .2, h: .2 });
});
