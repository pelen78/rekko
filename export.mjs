// Rekko · Exporta una demo a un solo archivo HTML, o a un respaldo JSON. Las partes puras se prueban con node.
import { playableDemo } from './model.mjs';

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Dentro de <script> no puede aparecer "</script"; se escapa en el JSON.
export const safeJson = value => JSON.stringify(value).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\u0021--');

export function buildHtml({ demo, playerSource, playerCss, modelSource }) {
  const playable = demo.steps?.[0]?.image?.src !== undefined ? demo : null;
  if (!playable) throw new Error('buildHtml espera una demo reproducible (con image.src).');
  const player = playerSource.replace(/^import .*?;\s*$/m, '').replace(/^export\s+/gm, '');
  const model = modelSource.replace(/^export\s+/gm, '');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(demo.title)}</title>
<meta name="robots" content="noindex">
<style>html,body{margin:0;height:100%;background:${esc(demo.theme?.background || '#15161c')}}#rekko{width:100%;height:100%}${playerCss}</style>
</head>
<body>
<div id="rekko" aria-label="${esc(demo.title)}"></div>
<script type="application/json" id="rekko-demo">${safeJson(demo)}</script>
<script>
(function(){
${model}
${player}
var demo = JSON.parse(document.getElementById('rekko-demo').textContent);
var player = mountPlayer(document.getElementById('rekko'), demo);
window.rekko = player;
window.addEventListener('message', function (e) { if (e.data === 'rekko:next') player.next(); if (e.data === 'rekko:restart') player.go(0); });
})();
</script>
<!-- Creado con Rekko -->
</body>
</html>`;
}

export const embedSnippet = (fileName, title) => `<iframe src="${esc(fileName)}" title="${esc(title)}" style="width:100%;aspect-ratio:16/10;border:0;border-radius:12px" allowfullscreen loading="lazy"></iframe>`;

export const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'demo';

// Respaldo: la demo completa con imágenes en data URL, para importar en otro navegador.
export const backupJson = (demo, dataUrls) => JSON.stringify({ ...demo, steps: demo.steps.map((s, i) => ({ ...s, image: { width: s.image.width, height: s.image.height, type: s.image.type, dataUrl: dataUrls[i] } })) });

export { playableDemo };
