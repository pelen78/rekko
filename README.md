# Rekko

Crea demos interactivas de cualquier app, estilo Storylane, sin extensión y sin cuenta. Capturas pantallas, marcas dónde hay que hacer clic, escribes qué pasa, y Rekko te entrega un solo archivo HTML que cualquiera puede recorrer haciendo clic. Todo ocurre en tu navegador: nada se sube a ningún servidor.

Sirve para enseñar un producto propio, como el editor de tarjetas de Lumimila, y también para clases: cualquier programa o página que puedas mostrar en pantalla.

## Qué hace la versión 1

- **Extensión de Chrome «Rekko Recorder».** La forma más rápida de grabar: en cualquier sitio pulsas el ícono de Rekko y «Start recording». Cada clic captura la pestaña (sin compartir pantalla), marca la zona y escribe el globo. Sigue grabando al cambiar de página y en pestañas que abre la página. Con «Stop and open in Rekko» se crea la demo sola. Se descarga desde la página inicial (`rekko-extension.zip`) y se instala con «Load unpacked» en `chrome://extensions` con el modo de desarrollador activado.
- **Capturar pantallas sin ir y venir entre ventanas.**
  - **Clics automáticos en páginas web.** Rekko te da un marcador «⚡ Rekko clicks» para la barra de marcadores. Lo pulsas en la página que quieres grabar, compartes esa pestaña, y desde ahí cada clic captura la pantalla justo antes del clic, marca la zona sobre el botón pulsado y escribe el globo con su nombre. Sirve para cualquier sitio web, sin extensión.
  - **Captura sola cuando la pantalla cambia.** Mientras compartes una ventana, Rekko vigila la imagen y captura cuando cambia y se queda quieta. Funciona con cualquier programa; la zona la marcas después.
  - **Capturar a mano.** Botón «Capturar ahora» y, en Chrome, un botón flotante que queda encima de tu app.
  - **Subir o pegar imágenes** con ⌘V, o soltarlas sobre el editor.
- **Zona de clic por paso.** Dibujas un recuadro sobre el botón que la persona debe pulsar. Un toque corto crea una zona pequeña, arrastrar dibuja una a medida; se mueve arrastrando y se redimensiona desde la esquina.
- **Editar pantalla.** Desde la pestaña Step o el botón «Edit screen» sobre la imagen: recortar, difuminar datos privados y anotar con recuadros, flechas y texto, con colores, tamaños y deshacer (⌘Z). Atajos: C recortar, B difuminar, R recuadro, A flecha, T texto. Las ediciones no destruyen la captura: se guarda la original, se puede volver a editar o restaurarla, y al recortar la zona de clic se recoloca sola.
- **Globo por paso.** Título opcional, texto y posición (automática o forzada). Se avanza al hacer clic en la zona o con el botón «Siguiente».
- **Ordenar pasos** arrastrando o con flechas; duplicar y quitar.
- **Idioma de los textos generados**, español o inglés, por demo: globos automáticos, botones del reproductor y tarjeta final. Al cambiarlo se traduce lo que Rekko escribió solo y se respeta lo que escribiste tú. La interfaz del editor está en inglés; las demos nuevas generan textos en inglés por defecto.
- **Estilo y final.** Color de acento, fondo, barra de progreso, tarjeta final con texto y enlace opcional.
- **Vista previa** dentro del editor, con teclado (flechas, Enter, Espacio).
- **Exportar** a un solo archivo HTML con las imágenes incluidas. Se abre en cualquier navegador y se incrusta en una página con un `<iframe>`. También respaldo JSON para importar en otro navegador.
- **Guardado automático** en el navegador (IndexedDB).

## Cómo usarlo

En Mac, doble clic en **Abrir Rekko.command** desde Finder. Arranca el servidor local y abre `http://127.0.0.1:5173/`. Deja esa ventana de Terminal abierta mientras lo usas. La primera vez, si macOS pregunta, clic derecho → Abrir.

Desde la terminal, en la carpeta del proyecto:

```bash
npm start      # abre http://127.0.0.1:5173/
npm test       # pruebas de la lógica con node --test
```

Rekko es una página estática sin dependencias. Solo necesitas Node.js para el servidor local, o súbela tal cual a Cloudflare Pages, Netlify o GitHub Pages y úsala desde cualquier computadora. Compartir pantalla exige `localhost` o HTTPS, y funciona en Chrome, Edge y Safari de escritorio. Subir y pegar imágenes funciona en cualquier navegador, incluido el celular.

## Flujo típico para una página web

1. En Rekko, abre «Clics automáticos en páginas web» y arrastra «⚡ Rekko clicks» a la barra de marcadores (una sola vez).
2. Abre la página que quieres grabar y pulsa el marcador. Se abre Rekko con una demo nueva.
3. En Rekko, «Compartir ventana y capturar» y elige **esa pestaña** (en el selector de Chrome, la lista «Pestaña»).
4. Vuelve a la página y haz el recorrido con calma. Cada clic crea un paso con su zona y su globo.
5. En Rekko revisa los pasos, corrige textos, quita los sobrantes.
6. Vista previa, «Descargar HTML», súbelo a tu sitio y pega el código de incrustar.

Si tu página abre otra pestaña (un reporte, «ver como cliente», un recibo), la pestaña nueva se conecta sola cuando es de la misma web. Pero si compartiste solo una pestaña, Rekko seguirá viendo la anterior: en la barra de Chrome pulsa «Compartir esta pestaña en su lugar», o desde el principio comparte la **ventana** completa del navegador, que cubre todas sus pestañas. Si la pestaña nueva es de otra web, pulsa el marcador también ahí.

Para programas fuera del navegador: comparte la ventana, activa «Capturar sola cuando la pantalla cambie» y haz el recorrido. Después marca la zona en cada paso.

## Cómo está armado

| Archivo | Qué hace |
| --- | --- |
| `index.html`, `styles.css` | Biblioteca de demos y editor. |
| `app.mjs` | Une la interfaz con la lógica: pasos, zona de clic, captura, vista previa, exportación. |
| `model.mjs` | Lógica pura de la demo: pasos, zonas, colocación del globo, validación. Sin DOM, con pruebas. |
| `player.mjs` | El reproductor. Se usa en la vista previa y se copia tal cual dentro del HTML exportado. |
| `capture.mjs` | Compartir pantalla, búfer de cuadros recientes, vigilante de cambios, botón flotante (Document Picture-in-Picture). |
| `change-detector.mjs` | Decide cuándo la pantalla cambió y se quedó quieta. Puro, con pruebas. |
| `remote.mjs` | El marcador «Rekko clicks» y la conversión de clics de la página a zonas sobre la captura. Puro, con pruebas. |
| `screen-editor.mjs` | Editor de pantalla: recorte, difuminado y anotaciones sobre la captura, y el render final. |
| `images.mjs` | Normaliza capturas a WebP de hasta 2000 px para que las demos pesen poco. |
| `store.mjs` | Guardado en IndexedDB. |
| `export.mjs` | Arma el HTML autocontenido, el código de incrustar y el respaldo JSON. |
| `extension/` | La extensión Rekko Recorder (Manifest V3): popup, captura de la pestaña en cada clic y puente con la app. |
| `tools/build-extension.mjs` | Genera los íconos provisionales y `rekko-extension.zip`. Correr `npm run build:extension` tras cambiar la extensión; una prueba avisa si el zip quedó viejo. |
| `tests/` | Pruebas con `node --test`. |

## Límites conocidos

- Los clics automáticos funcionan en páginas web, porque el marcador corre dentro de la página. En programas de escritorio no hay forma de ver los clics desde una página web; ahí usa la captura por cambio de pantalla.
- Si una página bloquea los marcadores (CSP muy estricta), queda la captura por cambio de pantalla o el botón flotante.
- Las capturas son imágenes, no HTML en vivo: el texto de la pantalla no se puede editar después y el zoom del navegador lo pixela un poco. A cambio funciona con cualquier app, no solo con páginas web.
- Las demos viven en el navegador donde las hiciste. Descarga un respaldo antes de cambiar de computadora o limpiar datos.
- Un HTML con muchas pantallas pesa varios MB. Treinta capturas rondan 5 a 10 MB.

## Ideas para después

Varias zonas por paso, ramas (si pulsas A vas a un paso, si pulsas B a otro), resaltado con oscurecimiento alrededor de la zona, y publicar con un enlace en lugar de un archivo.
