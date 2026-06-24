#!/usr/bin/env bash
# Diagnóstico rápido — ejecutar en el droplet: bash infra/digitalocean/diagnose.sh
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/hotel-bot}"
cd "$APP_DIR" 2>/dev/null || { echo "❌ No existe $APP_DIR"; exit 1; }

source infra/digitalocean/compose-env.sh 2>/dev/null || COMPOSE_CMD="docker compose"

echo "=== Modo SSL: $SSL_ENABLED ==="
echo "=== docker compose ps ==="
$COMPOSE_CMD ps -a

echo ""
echo "=== Últimos logs API ==="
$COMPOSE_CMD logs api --tail 40 2>&1 || true

echo ""
echo "=== Últimos logs WEB ==="
$COMPOSE_CMD logs web --tail 40 2>&1 || true

echo ""
echo "=== Últimos logs NGINX ==="
$COMPOSE_CMD logs nginx --tail 20 2>&1 || true

echo "=== Test vía puerto 80 ==="
curl -sf http://localhost/api/health && echo "" || echo "❌ HTTP /api/health no responde"
curl -sf -o /dev/null -w "WEB HTTP status: %{http_code}\n" http://localhost/ || echo "❌ WEB HTTP no responde"

if [ "${SSL_ENABLED:-0}" = "1" ]; then
  echo ""
  echo "=== Test vía puerto 443 (HTTPS) ==="
  curl -sfk https://localhost/api/health && echo "" || echo "❌ HTTPS /api/health no responde"
  curl -sfk -o /dev/null -w "WEB HTTPS status: %{http_code}\n" https://localhost/ || echo "❌ WEB HTTPS no responde"
fi

echo ""
echo "=== ENCRYPTION_KEY en .env ==="
grep -E "^ENCRYPTION_KEY=" .env | head -1 | awk -F= '{print "length: " length($2)}'
