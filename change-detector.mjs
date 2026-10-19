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
