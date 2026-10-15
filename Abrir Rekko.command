#!/bin/zsh
# Doble clic desde Finder: arranca Rekko y lo abre en el navegador.
set -e
cd -- "${0:A:h}"
url='http://127.0.0.1:5173/'
if /usr/bin/curl --silent --fail --max-time 2 "${url}app.mjs" >/dev/null 2>&1; then
  /usr/bin/open "$url"
  exit 0
fi
node_bin=$(command -v node || true)
if [[ -z "$node_bin" ]]; then
  node_bin='/Users/pelen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
fi
if [[ ! -x "$node_bin" ]]; then
  print 'No se encontró Node.js para abrir Rekko. Instálalo desde https://nodejs.org y vuelve a intentar.'
  read '?Presiona Enter para cerrar.'
  exit 1
fi
"$node_bin" server.mjs &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM
for attempt in {1..30}; do
  if /usr/bin/curl --silent --fail --max-time 1 "${url}app.mjs" >/dev/null 2>&1; then
    /usr/bin/open "$url"
    print 'Rekko está abierto en tu navegador. Deja esta ventana abierta mientras lo usas; ciérrala al terminar.'
    wait "$server_pid"
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    print 'No pudimos iniciar Rekko. El puerto 5173 podría estar ocupado.'
    read '?Presiona Enter para cerrar.'
    exit 1
  fi
  sleep 0.2
done
print 'Rekko no respondió. Cierra esta ventana y vuelve a intentarlo.'
read '?Presiona Enter para cerrar.'
