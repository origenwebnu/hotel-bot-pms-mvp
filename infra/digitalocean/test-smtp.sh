#!/usr/bin/env bash
# Prueba conexión SMTP desde el contenedor API — ejecutar en el droplet
set -uo pipefail
cd /opt/hotel-bot

source infra/digitalocean/compose-env.sh 2>/dev/null || COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.ssl.yml"

echo "=== Variables en contenedor (sin pass) ==="
$COMPOSE_CMD exec -T api sh -c 'echo "HOST=$SMTP_HOST PORT=$SMTP_PORT USER=$SMTP_USER FROM=$SMTP_FROM PASS_LEN=${#SMTP_PASS}"'

echo ""
echo "=== Test conexión SMTP (verify) ==="
$COMPOSE_CMD exec -T api node -e "
const nodemailer = require('nodemailer');
const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = Number(process.env.SMTP_PORT || 587);
const secure = process.env.SMTP_SECURE === 'true' || port === 465;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
if (!user || !pass) { console.error('FALTA SMTP_USER o SMTP_PASS'); process.exit(1); }
const t = nodemailer.createTransport({ host, port, secure, requireTLS: !secure, auth: { user, pass }, tls: { minVersion: 'TLSv1.2' } });
t.verify().then(() => { console.log('OK: Gmail aceptó usuario y contraseña'); process.exit(0); })
  .catch((err) => { console.error('FALLO:', err.code || 'ERROR', '-', err.message); if (err.response) console.error('Respuesta:', err.response); process.exit(1); });
"

echo ""
echo "=== Test envío real (opcional) ==="
$COMPOSE_CMD exec -T api node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, requireTLS: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
const from = process.env.SMTP_FROM || process.env.SMTP_USER;
t.sendMail({ from, to: process.env.SMTP_USER, subject: 'Test BookiChat SMTP', text: 'Si recibes esto, SMTP funciona.' })
  .then(() => console.log('OK: Email de prueba enviado a', process.env.SMTP_USER))
  .catch((err) => { console.error('FALLO envío:', err.code, err.response || err.message); process.exit(1); });
"

echo ""
echo "=== Si FALLO envío con alias @bookichat.com ==="
echo "  Cambia en .env: SMTP_FROM=\"BookiChat <noresponder@janpublicidad.com>\""
echo "  Luego: docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --force-recreate api"
