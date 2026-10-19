import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, addStep, updateStep, setLanguage, demoLanguage, validateDemo, setTitle, STRINGS } from '../model.mjs';
import { tooltipFor } from '../remote.mjs';

const img = { width: 100, height: 100, type: 'image/webp', dataUrl: 'data:x' };

test('a demo is Spanish by default and English on request, with matching defaults', () => {
  const es = createDemo(''), en = createDemo('', 'en');
  assert.equal(demoLanguage(es), 'es'); assert.equal(es.title, 'Demo sin título'); assert.equal(es.settings.finalTitle, '¡Eso es todo!');
  assert.equal(demoLanguage(en), 'en'); assert.equal(en.title, 'Untitled demo'); assert.equal(en.settings.finalText, 'Now you know how it works.');
  assert.equal(addStep(en, img).steps[0].tooltip.text, 'Click here');
  assert.equal(createDemo('x', 'fr').settings.language, 'es', 'unknown languages fall back to Spanish');
});

test('generated tooltips follow the language', () => {
  assert.equal(tooltipFor({ label: 'Guardar' }, 'es'), 'Haz clic en «Guardar»');
  assert.equal(tooltipFor({ label: 'Save' }, 'en'), 'Click “Save”');
  assert.equal(tooltipFor({ label: '' }, 'en'), 'Click here');
});

test('switching language translates what Rekko wrote and keeps what the person wrote', () => {
  let d = addStep(addStep(addStep(createDemo(''), img), img), img);
  const [a, b, c] = d.steps;
  d = updateStep(d, a.id, { tooltip: { text: 'Haz clic en «Pagar»' } });
  d = updateStep(d, c.id, { tooltip: { text: 'Aquí escribes el nombre de tu hijo' } });
  d = setLanguage(d, 'en');
  assert.equal(demoLanguage(d), 'en');
  assert.equal(d.steps[0].tooltip.text, 'Click “Pagar”');
  assert.equal(d.steps[1].tooltip.text, 'Click here');
  assert.equal(d.steps[2].tooltip.text, 'Aquí escribes el nombre de tu hijo');
  assert.equal(d.settings.finalTitle, 'That’s it!'); assert.equal(d.title, 'Untitled demo');
  d = setLanguage(d, 'es');
  assert.equal(d.steps[0].tooltip.text, 'Haz clic en «Pagar»'); assert.equal(d.settings.finalTitle, '¡Eso es todo!');
  const custom = setLanguage({ ...d, settings: { ...d.settings, finalTitle: 'Gracias por ver' } }, 'en');
  assert.equal(custom.settings.finalTitle, 'Gracias por ver', 'a custom final title is not touched');
  assert.equal(setLanguage(d, 'de'), d, 'unknown language changes nothing');
});

test('validateDemo keeps the language and setTitle falls back in that language', () => {
  const d = validateDemo({ title: 'X', settings: { language: 'en' }, steps: [] });
  assert.equal(demoLanguage(d), 'en');
  assert.equal(setTitle(d, '   ').title, 'Untitled demo');
  assert.equal(demoLanguage(validateDemo({ settings: { language: 'zz' } })), 'es');
  assert.deepEqual(Object.keys(STRINGS.es).sort(), Object.keys(STRINGS.en).sort(), 'both languages define the same strings');
});
