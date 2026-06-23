#!/usr/bin/env bash
# Diagnóstico rápido — ejecutar en el droplet: bash infra/digitalocean/diagnose.sh
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/hotel-bot}"
cd "$APP_DIR" 2>/dev/null || { echo "❌ No existe $APP_DIR"; exit 1; }

echo "=== docker compose ps ==="
docker compose ps -a

echo ""
echo "=== Últimos logs API ==="
docker compose logs api --tail 40 2>&1 || true

echo ""
echo "=== Últimos logs WEB ==="
docker compose logs web --tail 40 2>&1 || true

echo ""
echo "=== Últimos logs NGINX ==="
docker compose logs nginx --tail 20 2>&1 || true

echo ""
echo "=== Test interno API ==="
docker compose exec -T api node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>r.text()).then(console.log).catch(e=>console.error(e))" 2>&1 || echo "API no responde"

echo ""
echo "=== Test interno WEB ==="
docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/').then(r=>console.log(r.status)).catch(e=>console.error(e))" 2>&1 || echo "WEB no responde"

echo ""
echo "=== ENCRYPTION_KEY en .env ==="
grep -E "^ENCRYPTION_KEY=" .env | head -1 | awk -F= '{print "length: " length($2)}'
