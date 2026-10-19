import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extensionZip, ZIP_PATH, EXT_DIR, crc32 } from '../tools/build-extension.mjs';
import { stepsFromRecording } from '../remote.mjs';

test('rekko-extension.zip is up to date with the extension folder (run npm run build:extension)', () => {
  assert.ok(readFileSync(ZIP_PATH).equals(extensionZip()));
});

test('the manifest is a valid MV3 extension with the files it references', () => {
  const m = JSON.parse(readFileSync(`${EXT_DIR}/manifest.json`, 'utf8'));
  assert.equal(m.manifest_version, 3);
  for (const f of [m.background.service_worker, m.action.default_popup, ...m.content_scripts[0].js, ...Object.values(m.icons)]) assert.ok(readFileSync(`${EXT_DIR}/${f}`).length > 0, f);
  assert.ok(m.permissions.includes('tabs') && m.host_permissions.includes('<all_urls>'));
});

test('crc32 matches the reference value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('a recording becomes steps with click areas over the clicked element', () => {
  const step = { image: 'data:image/jpeg;base64,AAA', rect: { x: 100, y: 50, w: 80, h: 30 }, point: { x: 140, y: 65 }, viewport: { w: 1000, h: 500 }, label: 'Save' };
  const [s] = stepsFromRecording({ steps: [step, { image: 'javascript:alert(1)' }, null] }, 'en');
  assert.equal(stepsFromRecording({ steps: [step, { image: 'javascript:alert(1)' }] }).length, 1);
  assert.equal(s.text, 'Click “Save”');
  assert.deepEqual(s.hotspot, { x: .096, y: .092, w: .088, h: .076 });
  assert.deepEqual(stepsFromRecording(null), []);
});
