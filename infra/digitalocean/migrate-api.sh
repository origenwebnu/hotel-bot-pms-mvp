#!/usr/bin/env bash
# Ejecuta migraciones Prisma dentro del contenedor API (ruta correcta)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/hotel-bot}"
cd "$APP_DIR"
source infra/digitalocean/compose-env.sh

echo "==> Migraciones Prisma en /app/apps/api ..."
$COMPOSE_CMD exec -T api sh -c 'cd /app/apps/api && npx prisma migrate deploy'

echo "OK: migraciones aplicadas"
