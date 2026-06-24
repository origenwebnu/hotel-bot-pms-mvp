#!/usr/bin/env bash
# Restaura HTTPS si el deploy dejó solo HTTP (nginx caído).
set -euo pipefail

APP_DIR="/opt/hotel-bot"
cd "$APP_DIR"

if [ ! -f docker/certs/fullchain.pem ] || [ ! -f docker/certs/privkey.pem ]; then
  echo "❌ No hay certificados en docker/certs/"
  echo "   Ejecuta primero: bash infra/digitalocean/setup-ssl-bookichat.sh tu@email.com"
  exit 1
fi

echo "==> Restaurando nginx + HTTPS..."
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --build
sleep 15

echo ""
echo "=== Test HTTP ==="
curl -sf -o /dev/null -w "HTTP 80: %{http_code}\n" http://localhost/api/health || echo "HTTP falló"

echo "=== Test HTTPS ==="
curl -sf -o /dev/null -w "HTTPS 443: %{http_code}\n" https://localhost/api/health -k || echo "HTTPS falló"

echo ""
docker compose -f docker-compose.yml -f docker-compose.ssl.yml ps
echo ""
echo "✅ Si HTTPS 443 = 200, abre https://app.bookichat.com"
