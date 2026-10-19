# Rekko

Crea demos interactivas de cualquier app, estilo Storylane, sin extensión y sin cuenta. Capturas pantallas, marcas dónde hay que hacer clic, escribes qué pasa, y Rekko te entrega un solo archivo HTML que cualquiera puede recorrer haciendo clic. Todo ocurre en tu navegador: nada se sube a ningún servidor.

Sirve para enseñar un producto propio, como el editor de tarjetas de Lumimila, y también para clases: cualquier programa o página que puedas mostrar en pantalla.

## Qué hace la versión 1

- **Capturar pantallas de tres formas.** Compartir una ventana o pestaña y pulsar «Capturar» cada vez que quieras una pantalla (en Chrome, con un botón flotante que queda encima de tu app). Subir imágenes. Pegar una captura con ⌘V o soltarla sobre el editor.
- **Zona de clic por paso.** Dibujas un recuadro sobre el botón que la persona debe pulsar. Un toque corto crea una zona pequeña, arrastrar dibuja una a medida; se mueve arrastrando y se redimensiona desde la esquina.
- **Globo por paso.** Título opcional, texto y posición (automática o forzada). Se avanza al hacer clic en la zona o con el botón «Siguiente».
- **Ordenar pasos** arrastrando o con flechas; duplicar y quitar.
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

## Flujo típico

1. Nueva demo y ponle nombre.
2. «Compartir ventana y capturar», elige la ventana de tu app, pulsa «Botón flotante».
3. Haz el recorrido en tu app y captura cada pantalla antes de dar el clic.
4. En cada paso, dibuja la zona sobre el botón y escribe el globo.
5. Vista previa, ajusta, y «Descargar HTML».
6. Sube el archivo a tu sitio y pega el código de incrustar donde quieras mostrarlo.

## Cómo está armado

| Archivo | Qué hace |
| --- | --- |
| `index.html`, `styles.css` | Biblioteca de demos y editor. |
| `app.mjs` | Une la interfaz con la lógica: pasos, zona de clic, captura, vista previa, exportación. |
| `model.mjs` | Lógica pura de la demo: pasos, zonas, colocación del globo, validación. Sin DOM, con pruebas. |
| `player.mjs` | El reproductor. Se usa en la vista previa y se copia tal cual dentro del HTML exportado. |
| `capture.mjs` | Compartir pantalla, tomar capturas y el botón flotante (Document Picture-in-Picture). |
| `images.mjs` | Normaliza capturas a WebP de hasta 2000 px para que las demos pesen poco. |
| `store.mjs` | Guardado en IndexedDB. |
| `export.mjs` | Arma el HTML autocontenido, el código de incrustar y el respaldo JSON. |
| `tests/` | Pruebas con `node --test`. |

## Límites conocidos

- Las capturas son imágenes, no HTML en vivo: el texto de la pantalla no se puede editar después y el zoom del navegador lo pixela un poco. A cambio funciona con cualquier app, no solo con páginas web.
- Las demos viven en el navegador donde las hiciste. Descarga un respaldo antes de cambiar de computadora o limpiar datos.
- Un HTML con muchas pantallas pesa varios MB. Treinta capturas rondan 5 a 10 MB.

## Ideas para después

Capturar también la posición del cursor para proponer la zona de clic sola, varias zonas por paso, ramas (si pulsas A vas a un paso, si pulsas B a otro), resaltado con oscurecimiento alrededor de la zona, y publicar con un enlace en lugar de un archivo.
