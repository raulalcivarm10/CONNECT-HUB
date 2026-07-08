#!/usr/bin/env bash
# Actualiza CONNECT-HUB en el servidor: baja la última versión de main y
# reconstruye los contenedores. Se ejecuta en el server (o vía SSH desde CI).
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git fetch + reset a origin/main"
git fetch --quiet origin main
git reset --hard --quiet origin/main
echo "    ahora en $(git rev-parse --short HEAD)"

echo "==> docker compose build + up"
docker compose up -d --build

echo "==> estado"
docker compose ps
echo "==> deploy OK"
