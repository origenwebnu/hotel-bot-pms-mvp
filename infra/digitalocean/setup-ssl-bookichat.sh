#!/usr/bin/env bash
# SSL para app.bookichat.com con certbot + nginx docker
set -euo pipefail

DOMAIN="app.bookichat.com"
EMAIL="${1:-admin@bookichat.com}"
APP_DIR="/opt/hotel-bot"

apt-get install -y certbot

cd "$APP_DIR"
docker compose stop web 2>/dev/null || true

certbot certonly --standalone \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

mkdir -p docker/certs
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" docker/certs/
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" docker/certs/

echo "✅ Certificados en docker/certs/"
echo "   Activa docker-compose.ssl.yml y reinicia: docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d"
