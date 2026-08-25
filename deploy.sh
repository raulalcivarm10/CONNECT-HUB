#!/usr/bin/env bash
#
# Despliegue de CONNECT-HUB. Se ejecuta EN EL SERVIDOR:
#
#   cd /root/app && ./deploy.sh
#
# POR QUÉ EXISTE ESTE GUION: el despliegue se venía haciendo con `git pull` y
# `docker compose up -d`, y eso NO reconstruye las imágenes. El resultado fue un
# panel corriendo durante seis días con código viejo mientras el arreglo ya
# estaba en el servidor: la agenda parecía importarse y se perdía en silencio, y
# nadie lo relacionó con el despliegue porque el código SÍ estaba puesto.
#
# Aquí se reconstruye SIEMPRE. Es más lento y es a propósito.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Antes:  $(git log --oneline -1)"
ANTES=$(git rev-parse HEAD)
CADDY_ANTES=$(git hash-object Caddyfile 2>/dev/null || echo '-')

git pull --ff-only origin main

DESPUES=$(git rev-parse HEAD)
CADDY_DESPUES=$(git hash-object Caddyfile 2>/dev/null || echo '-')

if [ "$ANTES" = "$DESPUES" ]; then
  echo "==> Sin commits nuevos. Se reconstruye igual (puede haber cambios sin desplegar)."
else
  echo "==> Llegaron estos cambios:"
  git log --oneline "$ANTES..$DESPUES" | sed 's/^/      /'
fi

echo "==> Reconstruyendo api y web…"
docker compose up -d --build api web

# El Caddyfile va montado como ARCHIVO suelto, no como carpeta. Al reescribirlo
# `git pull` crea un inode nuevo y el contenedor sigue viendo el viejo: reiniciar
# no basta, hay que recrear el contenedor.
if [ "$CADDY_ANTES" != "$CADDY_DESPUES" ]; then
  echo "==> El Caddyfile cambió: recreando caddy (montaje por inode)…"
  docker compose up -d --force-recreate caddy
fi

echo "==> Esperando a que el API esté sano…"
for i in $(seq 1 30); do
  ESTADO=$(docker compose ps api --format '{{.Status}}' || true)
  case "$ESTADO" in
    *healthy*) echo "      OK: $ESTADO"; break ;;
  esac
  if [ "$i" = "30" ]; then
    echo "      El API no llegó a estado sano. Últimos registros:" >&2
    docker compose logs api --tail 40 >&2
    exit 1
  fi
  sleep 2
done

# Comprobación de humo: que respondan de verdad, no solo que el contenedor viva.
DOMINIO=$(grep -E '^DOMAIN=' .env | cut -d= -f2- | tr -d '"')
echo "==> Comprobando https://$DOMINIO"
FALLOS=0
for RUTA in "/api/health" "/login"; do
  COD=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMINIO$RUTA" || echo 000)
  case "$COD" in
    2*|3*) echo "      $RUTA -> $COD" ;;
    *)     echo "      $RUTA -> $COD  ← revisar" >&2; FALLOS=$((FALLOS + 1)) ;;
  esac
done

docker compose ps --format 'table {{.Service}}\t{{.Status}}'

if [ "$FALLOS" -gt 0 ]; then
  echo "==> Desplegado, pero con $FALLOS comprobación(es) en rojo." >&2
  exit 1
fi
echo "==> Listo: $(git log --oneline -1)"
