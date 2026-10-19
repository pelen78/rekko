// Builds the Chrome extension download: placeholder icons and rekko-extension.zip.
// Deterministic (fixed dates, sorted files) so tests can check the zip is up to date.
//   node tools/build-extension.mjs
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXT_DIR = path.join(ROOT, 'extension');
export const ZIP_PATH = path.join(ROOT, 'rekko-extension.zip');

// ---------- CRC32 ----------
const TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// ---------- PNG icons from the Rekko logo ----------
function png(size, draw) {
  const px = Buffer.alloc(size * size * 4);
  const S = 4; // supersampling
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = draw((x + (sx + .5) / S) / size, (y + (sy + .5) / S) / size);
      if (c) { acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; acc[3] += c[3]; }
    }
    const a = acc[3] / (S * S), i = (y * size + x) * 4;
    px[i] = acc[3] ? acc[0] / acc[3] : 0; px[i + 1] = acc[3] ? acc[1] / acc[3] : 0; px[i + 2] = acc[3] ? acc[2] / acc[3] : 0; px[i + 3] = Math.round(a * 255);
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Logo mark (same geometry as the SVG in index.html, 48×48 units): four rounded corner brackets
// with a blue gradient and a red "record" dot in the middle.
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const BLUE_A = [123, 134, 255], BLUE_B = [74, 99, 245], RED_A = [255, 97, 104], RED_B = [255, 70, 85];
function bracketDistance(x, y) {
  // Mirror into the top-left quadrant: the four brackets are reflections of one.
  const px = x < 24 ? x : 48 - x, py = y < 24 ? y : 48 - y;
  const c = 13, r = 9.8, e = 3.2, end = 17.5;
  const seg = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const arc = px <= c && py <= c ? Math.abs(Math.hypot(px - c, py - c) - r) : Infinity;
  return Math.min(arc, seg(e, c, e, end), seg(c, e, end, e));
}
const icon = (u, v) => {
  const x = u * 48, y = v * 48;
  if (Math.hypot(x - 24, y - 24) <= 12.5) return [...lerp(RED_A, RED_B, Math.min(1, Math.max(0, (x + y - 24) / 48))), 1];
  if (bracketDistance(x, y) <= 3.1) return [...lerp(BLUE_A, BLUE_B, (x + y) / 96), 1];
  return null;
};
export function iconFiles() { return Object.fromEntries([16, 32, 48, 128].map(s => [`icons/icon${s}.png`, png(s, icon)])); }

// ---------- ZIP (deflate, fixed timestamps) ----------
export function makeZip(entries) {
  const locals = [], centrals = []; let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (1 << 5) | 1; // 1980-01-01 00:00
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name), comp = deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp); centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
function listFiles(dir, base = dir) {
  return readdirSync(dir).filter(f => !f.startsWith('.')).sort().flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')]; });
}
// Everything goes inside a "rekko-extension/" folder, ready for "Load unpacked".
export function extensionZip() {
  return makeZip(listFiles(EXT_DIR).map(f => [`rekko-extension/${f}`, readFileSync(path.join(EXT_DIR, f))]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(path.join(EXT_DIR, 'icons'), { recursive: true });
  for (const [name, buf] of Object.entries(iconFiles())) writeFileSync(path.join(EXT_DIR, name), buf);
  const zip = extensionZip(); writeFileSync(ZIP_PATH, zip);
  console.log(`rekko-extension.zip · ${(zip.length / 1024).toFixed(1)} KB`);
}
