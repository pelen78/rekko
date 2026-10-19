// Rekko · Decide cuándo la pantalla "cambió y se quedó quieta". Lógica pura, con pruebas.
// Las muestras son arreglos de grises (0..255) del mismo tamaño.
export function frameDiff(a, b, tolerance = 28) { if (!a || !b || a.length !== b.length) return 1; let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > tolerance) n++; return n / a.length; }

export function createChangeDetector({ threshold = .035, cooldown = 900 } = {}) {
  let lastShot = null, prev = null, lastShotAt = -Infinity;
  return {
    // Llamar al tomar cualquier captura, para no repetir la misma pantalla.
    markShot(sample, now) { lastShot = sample; prev = sample; lastShotAt = now; },
    // Devuelve true cuando conviene capturar: distinto a la última captura, estable respecto a la muestra anterior y pasado el tiempo de espera.
    feed(sample, now) {
      const changed = frameDiff(sample, lastShot) > threshold, settled = frameDiff(sample, prev) < threshold / 4;
      prev = sample;
      if (changed && settled && now - lastShotAt > cooldown) { lastShot = sample; lastShotAt = now; return true; }
      return false;
    },
  };
}

// Recuadro (normalizado 0..1) de la zona que más cambió entre dos muestras de w×h. Sirve para adivinar dónde se hizo clic
// cuando solo vemos la imagen. Agrupa los píxeles cambiados en bloques vecinos y se queda con el grupo más grande, así un
// reloj o el ruido de compresión en otra esquina no estiran el recuadro. Devuelve null si no cambió nada o si el grupo
// ocupa casi toda la pantalla (cambio de página).
export function changeBox(a, b, w, h, { tolerance = 28, maxArea = .45, pad = .012, minSide = .04, cell = 4, minPixels = 6 } = {}) {
  if (!a || !b || a.length !== b.length || a.length !== w * h) return null;
  const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell), count = new Uint16Array(cw * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (Math.abs(a[i] - b[i]) > tolerance) count[((y / cell) | 0) * cw + ((x / cell) | 0)]++; }
  const seen = new Uint8Array(cw * ch); let best = null;
  for (let start = 0; start < count.length; start++) {
    if (!count[start] || seen[start]) continue;
    // Grupo de bloques cambiados conectados (vecinos en 8 direcciones, con un bloque de holgura).
    const stack = [start]; seen[start] = 1; let n = 0, x1 = cw, y1 = ch, x2 = -1, y2 = -1;
    while (stack.length) {
      const k = stack.pop(), cx = k % cw, cy = (k / cw) | 0; n += count[k];
      if (cx < x1) x1 = cx; if (cx > x2) x2 = cx; if (cy < y1) y1 = cy; if (cy > y2) y2 = cy;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const j = ny * cw + nx; if (count[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (!best || n > best.n) best = { n, x1, y1, x2, y2 };
  }
  if (!best || best.n < minPixels) return null;
  const px1 = best.x1 * cell, py1 = best.y1 * cell, px2 = Math.min(w, (best.x2 + 1) * cell), py2 = Math.min(h, (best.y2 + 1) * cell);
  let bx = px1 / w - pad, by = py1 / h - pad, bw = (px2 - px1) / w + pad * 2, bh = (py2 - py1) / h + pad * 2;
  if (bw < minSide) { bx -= (minSide - bw) / 2; bw = minSide; }
  if (bh < minSide) { by -= (minSide - bh) / 2; bh = minSide; }
  bx = Math.max(0, bx); by = Math.max(0, by); bw = Math.min(1 - bx, bw); bh = Math.min(1 - by, bh);
  if (bw * bh > maxArea) return null;
  return { x: bx, y: by, w: bw, h: bh };
}

// Adivina dónde se hizo clic entre la captura anterior (prev) y la nueva (next), usando los cuadros intermedios.
// 1) Justo antes del cambio, el botón pulsado suele verse distinto (hover, presionado, foco): eso es lo mejor.
// 2) Si no, la zona que cambió (por ejemplo un menú que se abrió).
export function guessClick(prev, history, next, w, h) {
  if (!prev || !next) return null;
  // El último cuadro que todavía se parece a la captura anterior es el momento justo antes del clic.
  for (let i = history.length - 1; i >= 0; i--) {
    const g = history[i];
    if (frameDiff(g, next) < .004) continue;          // ya es la pantalla nueva
    if (frameDiff(g, prev) > .2) continue;            // a medio cambiar
    // Los hover suelen ser cambios de color suaves: aquí se mira con más sensibilidad.
    const box = changeBox(prev, g, w, h, { maxArea: .12, tolerance: 12, minPixels: Math.max(6, w * h * .0007) });
    if (box) return box;
    break;
  }
  // Cambió media pantalla o más: es otra página y no sabemos dónde fue el clic.
  if (frameDiff(prev, next) > .2) return null;
  return changeBox(prev, next, w, h);
}
