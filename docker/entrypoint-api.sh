#!/bin/sh
set -e

echo "==> Esperando PostgreSQL..."
until nc -z postgres 5432 2>/dev/null; do
  sleep 2
done

echo "==> Ejecutando migraciones..."
cd /app/apps/api
npx prisma migrate deploy || echo "WARN: migrate falló, continuando..."

echo "==> Iniciando API..."
exec node dist/main.js
