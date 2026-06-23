#!/usr/bin/env bash
# Instalación completa en Ubuntu 24.04 — ejecutar como root
set -euo pipefail

APP_DIR="/opt/hotel-bot"
REPO="https://github.com/origenwebnu/hotel-bot-pms-mvp.git"
BRANCH="main"
PUBLIC_IP="${PUBLIC_IP:-$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')}"

echo "==> HotelBot — instalación automática"
echo "    IP detectada: $PUBLIC_IP"

if ! command -v docker &>/dev/null; then
  echo "==> Instalando Docker..."
  apt-get update -qq
  curl -fsSL https://get.docker.com | sh
  apt-get install -y -qq docker-compose-plugin git ufw
fi

if ! ufw status | grep -q "Status: active"; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "==> Actualizando repositorio..."
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  echo "==> Clonando repositorio..."
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
  sed -i "s/JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 48)/" .env
fi

sed -i "s|APP_URL=.*|APP_URL=http://${PUBLIC_IP}|" .env
sed -i "s|API_URL=.*|API_URL=http://${PUBLIC_IP}|" .env

if grep -q "sk-your-openai-key" .env || grep -q "OPENAI_API_KEY=$" .env; then
  echo ""
  echo "⚠️  IMPORTANTE: Edita OPENAI_API_KEY en $APP_DIR/.env"
  echo "    nano $APP_DIR/.env"
  echo ""
fi

echo "==> Construyendo e iniciando contenedores..."
docker compose build
docker compose up -d

echo "==> Esperando servicios..."
sleep 15
docker compose exec -T api npx prisma migrate deploy || true

echo ""
echo "✅ Instalación completada"
echo "   Dashboard:  http://${PUBLIC_IP}"
echo "   API Health: http://${PUBLIC_IP}/api/health"
echo ""
docker compose ps
