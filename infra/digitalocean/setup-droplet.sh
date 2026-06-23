#!/usr/bin/env bash
# =============================================================================
# HotelBot — Script de configuración inicial en DigitalOcean Droplet
# Ubuntu 22.04/24.04 LTS
# =============================================================================
set -euo pipefail

echo "==> Actualizando sistema..."
apt-get update && apt-get upgrade -y

echo "==> Instalando dependencias..."
apt-get install -y \
  curl git ufw fail2ban \
  apt-transport-https ca-certificates gnupg lsb-release

echo "==> Instalando Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

echo "==> Instalando Docker Compose plugin..."
apt-get install -y docker-compose-plugin

echo "==> Configurando firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Configurando fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

echo "==> Creando directorio de aplicación..."
APP_DIR="/opt/hotel-bot"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ ! -d ".git" ]; then
  echo "==> Clonando repositorio..."
  read -rp "URL del repositorio Git: " REPO_URL
  git clone "$REPO_URL" .
fi

if [ ! -f ".env" ]; then
  echo "==> Creando archivo .env..."
  cp .env.example .env

  ENCRYPTION_KEY=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 48)

  sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
  sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env

  echo ""
  echo "⚠️  Edita /opt/hotel-bot/.env con tus credenciales:"
  echo "   - OPENAI_API_KEY"
  echo "   - WHATSAPP_* (Meta Business)"
  echo "   - APP_URL y API_URL (tu dominio)"
  echo ""
  read -rp "Presiona Enter cuando hayas editado .env..."
fi

echo "==> Construyendo e iniciando servicios..."
docker compose pull
docker compose build
docker compose up -d

echo "==> Esperando PostgreSQL..."
sleep 10
docker compose exec api npx prisma migrate deploy

echo ""
echo "✅ Instalación completada!"
echo ""
echo "   Dashboard:  http://$(curl -s ifconfig.me)"
echo "   API Health: http://$(curl -s ifconfig.me)/api/health"
echo ""
echo "Próximos pasos:"
echo "  1. Configura DNS apuntando a esta IP"
echo "  2. Configura SSL con Certbot (ver docs/DEPLOY.md)"
echo "  3. Registra webhook WhatsApp: https://tudominio.com/api/webhooks/whatsapp"
echo "  4. Registra webhooks de pago:"
echo "     - Wompi:  https://tudominio.com/api/webhooks/wompi"
echo "     - Stripe: https://tudominio.com/api/webhooks/stripe"
