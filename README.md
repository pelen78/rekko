# Rekko

Graba tu pantalla desde el navegador, marca dónde diste clic, agrega zooms suaves y descarga un video listo para compartir. Todo ocurre en tu computadora: la grabación nunca se sube a ningún servidor.

Pensado para tutoriales cortos y clases: grabar una pestaña o ventana, resaltar cada paso y exportar en un par de minutos.

## Qué hace la versión 1

- **Grabar** una pestaña, una ventana o la pantalla completa, con micrófono opcional. Cuenta regresiva de 3 segundos para cambiar a lo que vas a grabar.
- **Marcar clics** sobre el video, en el instante exacto. Cada marca se dibuja como un pulso al exportar.
- **Zooms** con entrada y salida suaves. Se crean con un botón en cada clic, o a mano en cualquier momento, y se ajusta inicio, duración, acercamiento y centro.
- **Recorte** del inicio y el final.
- **Marco**: fondo degradado, relleno, esquinas redondeadas y sombra.
- **Exportar** a MP4 (H.264 + AAC) en 1080p, 720p o vertical 1080 × 1920. Si el navegador no puede crear MP4, se guarda como WebM (VP9 + Opus) y la app lo avisa.

Atajos en el editor: `Espacio` reproduce o pausa, `←` `→` mueven 0,1 s (`Shift` mueve 1 s), `Z` cambia entre marcar clic y centrar zoom.

## Cómo usarlo

En Mac, doble clic en **Abrir Rekko.command** desde Finder. Arranca el servidor local y abre `http://127.0.0.1:5173/` en el navegador. Deja esa ventana de Terminal abierta mientras lo usas. La primera vez, si macOS pregunta, abre el archivo con clic derecho → Abrir.

Desde la terminal, en la carpeta del proyecto:

```bash
npm start      # abre http://127.0.0.1:5173/
npm test       # pruebas de la lógica con node --test
```

Rekko es una página estática sin dependencias de npm. Cualquier servidor sirve; el incluido es solo para desarrollo local. Solo necesitas tener Node.js instalado.

La grabación de pantalla exige un contexto seguro: `localhost` o un dominio con HTTPS. Funciona en Chrome, Edge y Safari de escritorio. No funciona en celular, porque los navegadores móviles no permiten grabar la pantalla desde una página.

Para publicarlo basta subir la carpeta tal cual a Cloudflare Pages, Netlify, GitHub Pages o similar.

## Cómo está armado

| Archivo | Qué hace |
| --- | --- |
| `index.html`, `styles.css` | La página: pantalla de grabación y editor. |
| `app.mjs` | Une la interfaz con la lógica. Vista previa en canvas, listas, atajos, exportación. |
| `timeline.mjs` | Lógica pura del proyecto: clics, zooms sin solaparse, recorte y la cámara en cada instante. Sin DOM, con pruebas. |
| `render.mjs` | Dibuja un cuadro del video final: fondo, marco, recorte de cámara y pulsos de clic. |
| `recorder.mjs` | Captura de pantalla y micrófono con `MediaRecorder`. |
| `export.mjs` | Decodifica la grabación, dibuja cada cuadro a 30 fps y codifica MP4 o WebM con WebCodecs. |
| `vendor/mediabunny.mjs` | [Mediabunny](https://mediabunny.dev/) 1.61.3, para leer y escribir contenedores de video (licencia MPL-2.0, ver `vendor/`). |
| `tests/` | Pruebas con `node --test`. |

La grabación vive solo en la pestaña abierta. Si recargas la página se pierde; descarga el video antes.

## Límites conocidos

- Los clics se marcan a mano después de grabar. Una página no puede saber dónde hiciste clic fuera de ella.
- No hay guardado de proyectos todavía: al cerrar la pestaña, la grabación y las marcas desaparecen.
- La exportación corre en el navegador: para clips de 1 a 10 minutos va bien; una clase completa de una hora puede tardar y ocupar mucha memoria.
- Los MP4 se crean completos en memoria antes de descargarse.

## Ideas para después

Detección automática de clics al grabar tus propias páginas, cursor suavizado y resaltado, guardado de proyectos en el navegador, recorte por tramos, subtítulos y una pista de audio separada.
