// Rekko · Clics que llegan desde una página conectada con el marcador. Lógica pura, con pruebas.
import { normalizeHotspot, clamp, strings, MAX_STEPS } from './model.mjs';

// Convierte el rectángulo del elemento pulsado (en píxeles CSS de la página) a coordenadas
// normalizadas del cuadro capturado, según qué se esté compartiendo.
export function mapRemoteRect(msg, surface = 'browser') {
  const v = msg.viewport, o = msg.outer || v, s = msg.screen || { x: 0, y: 0, w: v.w, h: v.h };
  let ox = 0, oy = 0, W = v.w, H = v.h;
  if (surface === 'window') { ox = Math.max(0, (o.w - v.w) / 2); oy = Math.max(0, o.h - v.h - ox); W = o.w; H = o.h; }
  else if (surface === 'monitor') { const side = Math.max(0, (o.w - v.w) / 2); ox = s.x + side; oy = s.y + Math.max(0, o.h - v.h - side); W = s.w; H = s.h; }
  if (!(W > 0 && H > 0)) return null;
  const r = msg.rect;
  return normalizeHotspot({ x: (ox + r.x) / W, y: (oy + r.y) / H, w: r.w / W, h: r.h / H });
}

// Si el elemento pulsado es enorme (una sección entera), marca una zona pequeña alrededor del punto.
export function sensibleRect(msg) {
  const { rect, point, viewport } = msg;
  if (rect.w > viewport.w * .5 || rect.h > viewport.h * .5 || rect.w <= 0 || rect.h <= 0) return { x: point.x - 48, y: point.y - 22, w: 96, h: 44 };
  const pad = 4;
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
}

export function tooltipFor(msg, language = 'es') {
  const t = strings(language);
  if (msg.view) return t.newTab(String(msg.title || '').replace(/\s+/g, ' ').trim().slice(0, 60));
  const label = String(msg.label || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return label ? t.clickOn(label) : t.clickHere;
}

export function hotspotFromMessage(msg, surface) {
  if (!msg?.rect || !msg?.viewport || !msg?.point) return null;
  return mapRemoteRect({ ...msg, rect: sensibleRect(msg) }, surface);
}

// Código del marcador. Se genera con la URL donde vive Rekko para que la página sepa a quién hablar.
function rekkoAgent(url, child) {
  var W = window, D = document;
  if (child) W.__rekkoChild = true;
  function send(m) { try { W.__rekkoWin && W.__rekkoWin.postMessage(Object.assign({ rekko: 1 }, m), '*'); } catch (e) { } }
  function badge(text, ms) { var b = D.getElementById('__rekko_badge'); if (!b) { b = D.createElement('div'); b.id = '__rekko_badge'; b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#4a5ff0;color:#fff;font:600 13px system-ui,sans-serif;padding:6px 12px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.3);pointer-events:none'; D.body.appendChild(b); } b.textContent = text; clearTimeout(b.__t); b.__t = setTimeout(function () { b.remove(); }, ms || 1500); }
  function hello() { send({ type: 'hello', title: D.title, href: location.href, child: !!W.__rekkoChild }); }
  // Pestañas que esta página abre (misma web): se conectan solas.
  function adopt(w) {
    if (!w) return;
    var tries = 0, timer = setInterval(function () {
      tries++;
      try {
        if (w.closed || tries > 150) return clearInterval(timer);
        if (w.document && w.document.readyState === 'complete' && w.document.body && w.location.href !== 'about:blank') {
          clearInterval(timer);
          if (!w.__rekkoHooked) { w.__rekkoWin = W.__rekkoWin; w.__rekkoReady = W.__rekkoReady; var sc = w.document.createElement('script'); sc.textContent = '(' + rekkoAgent.toString() + ')(' + JSON.stringify(url) + ', true)'; w.document.body.appendChild(sc); }
        }
      } catch (e) { /* otra web: no se puede entrar */ }
    }, 200);
  }
  if (!W.__rekkoWin || W.__rekkoWin.closed) { W.__rekkoWin = W.open('', 'rekko'); W.__rekkoReady = false; }
  if (!W.__rekkoHooked) {
    W.__rekkoHooked = true;
    var origOpen = W.open;
    W.open = function () { var w = origOpen.apply(W, arguments); adopt(w); return w; };
    D.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"][href]') : null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      try { if (new URL(a.href, location.href).origin !== location.origin) return; } catch (x) { return; }
      e.preventDefault(); adopt(origOpen.call(W, a.href, '_blank'));
    }, true);
    W.addEventListener('message', function (e) {
      var d = e.data; if (!d || d.rekko !== 1) return;
      if (d.type === 'ready') { W.__rekkoReady = true; badge(d.sharing ? 'Rekko connected: every click captures' : 'Rekko connected. Share this tab in Rekko to capture', d.sharing ? 1500 : 4000); }
      if (d.type === 'captured') badge('Capture ' + d.count, 900);
    });
    D.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var el = e.target && e.target.closest ? (e.target.closest('button,a,input,select,textarea,label,summary,[role=button],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[contenteditable]') || e.target) : e.target;
      if (!el || !el.getBoundingClientRect) return;
      var r = el.getBoundingClientRect();
      var label = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder'))) || (el.tagName === 'INPUT' ? '' : (el.innerText || el.textContent || ''));
      send({ type: 'click', rect: { x: r.left, y: r.top, w: r.width, h: r.height }, point: { x: e.clientX, y: e.clientY }, viewport: { w: W.innerWidth, h: W.innerHeight }, outer: { w: W.outerWidth, h: W.outerHeight }, screen: { x: W.screenX, y: W.screenY, w: screen.width, h: screen.height }, label: String(label).trim().slice(0, 60), title: D.title, href: location.href, t: Date.now() });
    }, true);
  }
  badge('Rekko: connecting…', 2000);
  hello();
  var retry = function () { if (!W.__rekkoReady) hello(); };
  setTimeout(function () { if (!W.__rekkoReady) { try { W.__rekkoWin.location.href = url + '#conectar'; } catch (e) { } setTimeout(retry, 2500); setTimeout(retry, 5000); } }, 800);
}
// Grabación que llega de la extensión Rekko Recorder: la captura es justo el viewport de la pestaña.
export function stepsFromRecording(rec, language = 'es') {
  return (Array.isArray(rec?.steps) ? rec.steps : [])
    .filter(s => typeof s?.image === 'string' && s.image.startsWith('data:image/'))
    .slice(0, MAX_STEPS)
    .map(s => ({ dataUrl: s.image, hotspot: s.view ? null : hotspotFromMessage(s, 'browser'), text: tooltipFor(s, language) }));
}

export const bookmarkletCode = url => `javascript:(${rekkoAgent.toString()})(${JSON.stringify(url)})`;
export { clamp };
