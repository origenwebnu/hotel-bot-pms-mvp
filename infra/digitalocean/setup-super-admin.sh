#!/usr/bin/env bash
# Configura variables SUPER_ADMIN_* en /opt/hotel-bot/.env (valores con comillas seguras)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/hotel-bot}"
cd "$APP_DIR"

EMAIL="${1:-nayith@origenweb.co}"
NAME="${2:-Nayith Origen Web}"
PASSWORD="${3:-}"

if [ -z "$PASSWORD" ]; then
  echo "Uso: bash infra/digitalocean/setup-super-admin.sh [email] [nombre] [contraseña]"
  echo ""
  echo "Ejemplo (usa comillas simples por los caracteres especiales):"
  echo "  bash infra/digitalocean/setup-super-admin.sh nayith@origenweb.co 'Nayith Origen Web' 'TuContraseña#123'"
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: No existe $APP_DIR/.env"
  exit 1
fi

# Quitar entradas anteriores
sed -i '/^SUPER_ADMIN_/d' .env
sed -i '/^# ─── Super Admin/d' .env

cat >> .env << EOF

# ─── Super Admin (panel de plataforma) ───────────────────────────────────────
SUPER_ADMIN_EMAIL=${EMAIL}
SUPER_ADMIN_NAME="${NAME}"
SUPER_ADMIN_PASSWORD="${PASSWORD}"
EOF

echo "OK: Variables SUPER_ADMIN_* agregadas a .env"
grep SUPER_ADMIN .env | sed 's/SUPER_ADMIN_PASSWORD=.*/SUPER_ADMIN_PASSWORD=***OK***/'

echo ""
echo "Siguiente paso — rebuild (incluye migraciones nuevas) y reinicio:"
echo "  source infra/digitalocean/compose-env.sh"
echo "  \$COMPOSE_CMD build api web"
echo "  \$COMPOSE_CMD up -d --force-recreate api web"
echo ""
echo "Las migraciones corren solas al iniciar la API (entrypoint)."
echo "Si necesitas ejecutarlas manualmente:"
echo "  \$COMPOSE_CMD exec -T api sh -c 'cd /app/apps/api && npx prisma migrate deploy'"
