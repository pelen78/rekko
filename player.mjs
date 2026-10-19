// Rekko · Reproductor de una demo. Se usa en la vista previa y, tal cual, dentro del HTML exportado.
import { fitRect, placeTooltip } from './model.mjs';

export const PLAYER_CSS = `
.rk{position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;background:var(--rk-bg,#15161c);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;user-select:none;-webkit-user-select:none}
.rk *{box-sizing:border-box}
.rk-stage{position:absolute;inset:0}
.rk-img{position:absolute;display:block;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.45);transition:opacity .25s}
.rk-img.rk-enter{opacity:0}
.rk-hot{position:absolute;border:2px solid var(--rk-accent,#f88c80);border-radius:8px;cursor:pointer;background:transparent;padding:0;outline:none}
.rk-hot::before{content:"";position:absolute;inset:-2px;border-radius:8px;border:2px solid var(--rk-accent,#f88c80);animation:rk-pulse 1.6s ease-out infinite}
.rk-hot:focus-visible{box-shadow:0 0 0 3px #fff}
@keyframes rk-pulse{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.25);opacity:0}}
.rk-tip{position:absolute;max-width:min(320px,80vw);padding:14px 16px;border-radius:14px;background:#fff;box-shadow:0 14px 40px rgba(0,0,0,.35);font-size:15px;line-height:1.45;z-index:2}
.rk-tip h3{margin:0 0 4px;font-size:15px;font-weight:700}
.rk-tip p{margin:0;white-space:pre-wrap}
.rk-tip .rk-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.rk-tip small{color:#777;font-size:12px}
.rk-btn{appearance:none;border:0;border-radius:999px;padding:8px 14px;background:var(--rk-accent,#f88c80);color:#1d1210;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
.rk-btn.rk-ghost{background:transparent;color:#555;padding:8px 6px}
.rk-tip::after{content:"";position:absolute;width:14px;height:14px;background:#fff;transform:rotate(45deg)}
.rk-tip[data-side="bottom"]::after{top:-7px;left:calc(var(--rk-arrow,50%) - 7px)}
.rk-tip[data-side="top"]::after{bottom:-7px;left:calc(var(--rk-arrow,50%) - 7px)}
.rk-tip[data-side="right"]::after{left:-7px;top:calc(var(--rk-arrow,50%) - 7px)}
.rk-tip[data-side="left"]::after{right:-7px;top:calc(var(--rk-arrow,50%) - 7px)}
.rk-tip.rk-center{left:50%!important;top:50%!important;transform:translate(-50%,-50%);text-align:center}
.rk-tip.rk-center::after{display:none}
.rk-progress{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.15)}
.rk-progress i{display:block;height:100%;background:var(--rk-accent,#f88c80);transition:width .3s}
.rk-count{position:absolute;right:12px;bottom:12px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:12px}
.rk-restart{position:absolute;left:12px;bottom:12px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;border:0;cursor:pointer;font-family:inherit}
.rk-shake{animation:rk-shake .35s}
@keyframes rk-shake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.rk-end{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.55)}
.rk-end .rk-tip{position:static;max-width:380px;text-align:center}
.rk-end .rk-tip h3{font-size:20px}
.rk-end .rk-tip p{margin-top:6px;color:#444}
.rk-end .rk-row{justify-content:center;margin-top:16px}
.rk-end a.rk-btn{text-decoration:none;display:inline-block}
`;

export function mountPlayer(container, demo, { onStep = () => {}, startAt = 0 } = {}) {
  const doc = container.ownerDocument;
  container.classList.add('rk');
  container.style.setProperty('--rk-accent', demo.theme?.accent || '#f88c80');
  container.style.setProperty('--rk-bg', demo.theme?.background || '#15161c');
  container.innerHTML = '<div class="rk-stage"></div>';
  const stage = container.querySelector('.rk-stage');
  let index = Math.min(startAt, demo.steps.length), image = null, finished = false;
  const images = demo.steps.map(s => { const im = new Image(); im.src = s.image.src; im.decoding = 'async'; return im; });

  function render() {
    stage.innerHTML = '';
    if (!demo.steps.length) { stage.innerHTML = `<div class="rk-end"><div class="rk-tip"><h3>Esta demo todavía no tiene pasos</h3></div></div>`; return; }
    if (index >= demo.steps.length) return renderEnd();
    const step = demo.steps[index];
    const box = { w: container.clientWidth, h: container.clientHeight };
    const fit = fitRect(step.image.width, step.image.height, box.w - 24, box.h - 24);
    const img = images[index]; image = img;
    img.className = 'rk-img rk-enter'; img.alt = `Paso ${index + 1}`; img.draggable = false;
    Object.assign(img.style, { left: `${fit.x + 12}px`, top: `${fit.y + 12}px`, width: `${fit.w}px`, height: `${fit.h}px` });
    stage.append(img); requestAnimationFrame(() => img.classList.remove('rk-enter'));
    const imageBox = { x: fit.x + 12, y: fit.y + 12, w: fit.w, h: fit.h };
    const tip = doc.createElement('div'); tip.className = 'rk-tip';
    const total = demo.steps.length, isLast = index === total - 1;
    tip.innerHTML = `${step.tooltip.title ? `<h3></h3>` : ''}<p></p><div class="rk-row"><small>${index + 1} de ${total}</small>${step.advance === 'button' || !step.hotspot ? `<button class="rk-btn" type="button">${isLast ? 'Terminar' : 'Siguiente →'}</button>` : `<small>Haz clic en la zona marcada</small>`}</div>`;
    if (step.tooltip.title) tip.querySelector('h3').textContent = step.tooltip.title;
    tip.querySelector('p').textContent = step.tooltip.text || '';
    tip.querySelector('.rk-btn')?.addEventListener('click', next);
    stage.append(tip);
    if (step.hotspot) {
      const h = step.hotspot;
      const hot = doc.createElement('button'); hot.className = 'rk-hot'; hot.type = 'button'; hot.setAttribute('aria-label', step.tooltip.text || 'Siguiente');
      Object.assign(hot.style, { left: `${imageBox.x + h.x * imageBox.w}px`, top: `${imageBox.y + h.y * imageBox.h}px`, width: `${h.w * imageBox.w}px`, height: `${h.h * imageBox.h}px` });
      if (step.advance === 'hotspot') hot.addEventListener('click', next); else hot.style.cursor = 'default';
      stage.append(hot);
      const size = { w: tip.offsetWidth, h: tip.offsetHeight };
      const pos = placeTooltip({ hotspot: h, image: imageBox, tooltip: size, box, placement: step.tooltip.placement });
      tip.style.left = `${pos.x}px`; tip.style.top = `${pos.y}px`; tip.dataset.side = pos.side;
      const cx = imageBox.x + (h.x + h.w / 2) * imageBox.w, cy = imageBox.y + (h.y + h.h / 2) * imageBox.h;
      const arrow = pos.side === 'top' || pos.side === 'bottom' ? Math.max(14, Math.min(size.w - 14, cx - pos.x)) : Math.max(14, Math.min(size.h - 14, cy - pos.y));
      tip.style.setProperty('--rk-arrow', `${arrow}px`);
      if (step.advance === 'hotspot') img.addEventListener('click', () => { hot.classList.remove('rk-shake'); void hot.offsetWidth; hot.classList.add('rk-shake'); });
    } else tip.classList.add('rk-center');
    if (demo.settings?.showProgress !== false) {
      stage.insertAdjacentHTML('beforeend', `<div class="rk-progress"><i style="width:${((index + 1) / total) * 100}%"></i></div>`);
    }
    if (index > 0) { const r = doc.createElement('button'); r.className = 'rk-restart'; r.type = 'button'; r.textContent = '↺ Empezar de nuevo'; r.addEventListener('click', () => go(0)); stage.append(r); }
    onStep(index, total);
  }
  function renderEnd() {
    finished = true;
    const s = demo.settings || {};
    stage.innerHTML = `<div class="rk-end"><div class="rk-tip"><h3></h3><p></p><div class="rk-row"><button class="rk-btn rk-ghost" type="button">↺ Ver de nuevo</button>${s.finalLink ? `<a class="rk-btn" target="_blank" rel="noopener"></a>` : ''}</div></div></div>`;
    stage.querySelector('h3').textContent = s.finalTitle || '¡Eso es todo!';
    stage.querySelector('p').textContent = s.finalText || '';
    stage.querySelector('.rk-ghost').addEventListener('click', () => go(0));
    const a = stage.querySelector('a'); if (a) { a.href = s.finalLink; a.textContent = s.finalLinkLabel || 'Probarlo'; }
    onStep(demo.steps.length, demo.steps.length);
  }
  function go(i) { index = Math.max(0, Math.min(i, demo.steps.length)); finished = false; render(); }
  function next() { go(index + 1); }
  function prev() { go(index - 1); }
  const onKey = e => { if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!finished) next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); } };
  container.tabIndex = 0; container.addEventListener('keydown', onKey);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => render()) : null; ro?.observe(container);
  render();
  return { next, prev, go, get index() { return index; }, destroy() { ro?.disconnect(); container.removeEventListener('keydown', onKey); container.innerHTML = ''; } };
}
