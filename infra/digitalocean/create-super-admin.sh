#!/usr/bin/env bash
# Crea o actualiza el super admin en platform_admins (PostgreSQL)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/hotel-bot}"
cd "$APP_DIR"
source infra/digitalocean/compose-env.sh

EMAIL="${1:-nayith@origenweb.co}"
NAME="${2:-Nayith Origen Web}"
PASSWORD="${3:-}"

if [ -z "$PASSWORD" ]; then
  echo "Uso: bash infra/digitalocean/create-super-admin.sh [email] [nombre] [contraseña]"
  echo ""
  echo "Ejemplo:"
  echo "  bash infra/digitalocean/create-super-admin.sh nayith@origenweb.co 'Nayith Origen Web' 'MiClave123'"
  exit 1
fi

echo "==> Verificando tabla platform_admins..."
$COMPOSE_CMD exec -T postgres psql -U hotelbot -d hotelbot -c \
  "SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_admins';" | grep -q 1 || {
  echo "ERROR: La tabla platform_admins no existe."
  echo "Primero ejecuta:"
  echo "  \$COMPOSE_CMD build api"
  echo "  \$COMPOSE_CMD up -d --force-recreate api"
  echo "  bash infra/digitalocean/migrate-api.sh"
  exit 1
}

echo "==> Creando/actualizando super admin: $EMAIL"
$COMPOSE_CMD exec -T api node -e "
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const email = process.argv[1].trim().toLowerCase();
const name = process.argv[2];
const password = process.argv[3];

(async () => {
  const hash = await bcrypt.hash(password, 12);
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.platformAdmin.upsert({
      where: { email },
      create: { email, passwordHash: hash, name },
      update: { passwordHash: hash, name, isActive: true },
    });
    console.log('OK: Super admin listo ->', admin.email);
  } finally {
    await prisma.\$disconnect();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
" "$EMAIL" "$NAME" "$PASSWORD"

echo ""
echo "Ahora inicia sesión en https://app.bookichat.com con:"
echo "  Email:    $EMAIL"
echo "  Password: (la que acabas de usar en este script)"
