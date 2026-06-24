#!/usr/bin/env bash
# Detecta si usar HTTPS (nginx) según certificados presentes.
# Uso: source infra/digitalocean/compose-env.sh

APP_DIR="${APP_DIR:-/opt/hotel-bot}"
cd "$APP_DIR"

COMPOSE_FILES="-f docker-compose.yml"
COMPOSE_CMD="docker compose ${COMPOSE_FILES}"
SSL_ENABLED=0

if [ -f docker/certs/fullchain.pem ] && [ -f docker/certs/privkey.pem ]; then
  COMPOSE_FILES="-f docker-compose.yml -f docker-compose.ssl.yml"
  COMPOSE_CMD="docker compose ${COMPOSE_FILES}"
  SSL_ENABLED=1
fi

export APP_DIR COMPOSE_FILES COMPOSE_CMD SSL_ENABLED
