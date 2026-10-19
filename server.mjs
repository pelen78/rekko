// Servidor local mínimo. Rekko es una página estática: cualquier servidor sirve.
// La grabación de pantalla exige un contexto seguro: localhost cuenta como seguro.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip' };
const port = Number(process.env.PORT) || 5173;
http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || file.includes(`${path.sep}.git${path.sep}`)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('No encontrado'); }
}).listen(port, '127.0.0.1', () => console.log(`Rekko: http://127.0.0.1:${port}/`));
