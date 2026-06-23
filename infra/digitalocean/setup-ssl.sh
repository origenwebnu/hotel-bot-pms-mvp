#!/usr/bin/env bash
# Renueva certificados SSL con Certbot + Nginx
set -euo pipefail

DOMAIN="${1:?Usage: ./setup-ssl.sh tu-dominio.com}"
EMAIL="${2:?Usage: ./setup-ssl.sh tu-dominio.com admin@tu-dominio.com}"

apt-get install -y certbot

docker compose -f /opt/hotel-bot/docker-compose.yml stop nginx

certbot certonly --standalone \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

mkdir -p /opt/hotel-bot/docker/certs
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /opt/hotel-bot/docker/certs/
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /opt/hotel-bot/docker/certs/

echo "Certificados copiados. Actualiza docker/nginx.conf para HTTPS y reinicia nginx."
