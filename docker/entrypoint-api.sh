#!/bin/sh
set -e

echo "==> Esperando PostgreSQL..."
until nc -z postgres 5432 2>/dev/null; do
  sleep 2
done

echo "==> Ejecutando migraciones..."
cd /app/apps/api
npx prisma migrate deploy || echo "WARN: migrate falló, continuando..."

if [ -z "${ENCRYPTION_KEY:-}" ] || [ "${#ENCRYPTION_KEY}" -ne 64 ]; then
  echo "ERROR: ENCRYPTION_KEY debe tener exactamente 64 caracteres hex en .env"
  echo "  Genera una con: openssl rand -hex 32"
  exit 1
fi

echo "==> Iniciando API..."
exec node dist/main.js
