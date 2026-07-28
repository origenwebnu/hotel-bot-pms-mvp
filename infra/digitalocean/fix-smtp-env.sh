#!/usr/bin/env bash
# Configura SMTP Gmail en /opt/hotel-bot/.env (formato correcto con comillas)
set -euo pipefail
cd /opt/hotel-bot

read -p "Email SMTP [noresponder@bookichat.com]: " SMTP_USER
SMTP_USER="${SMTP_USER:-noresponder@bookichat.com}"
read -s -p "Contraseña de aplicación Google (16 chars): " SMTP_PASS && echo

sed -i '/^SMTP_/d' .env
sed -i '/^# ─── Email/d' .env

cat >> .env << EOF

# ─── Email (verificación registro) ───
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM="BookiChat <${SMTP_USER}>"
EOF

unset SMTP_PASS

echo ""
echo "=== Variables SMTP (sin pass) ==="
grep SMTP .env | sed 's/SMTP_PASS=.*/SMTP_PASS=***OK***/'

echo ""
echo "==> Recreando API..."
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --force-recreate api
sleep 12

echo ""
echo "=== Dentro del contenedor ==="
docker compose exec api sh -c 'echo "USER=$SMTP_USER"; echo "HOST=$SMTP_HOST"; echo "PASS_LEN=${#SMTP_PASS}"'

echo ""
echo "✅ Listo. Prueba registro en https://app.bookichat.com/registro"
