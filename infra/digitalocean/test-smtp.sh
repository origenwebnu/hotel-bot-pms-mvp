#!/usr/bin/env bash
# Prueba conexión SMTP desde el contenedor API — ejecutar en el droplet
set -uo pipefail
cd /opt/hotel-bot

source infra/digitalocean/compose-env.sh 2>/dev/null || COMPOSE_CMD="docker compose"

echo "=== Variables en contenedor (sin pass) ==="
$COMPOSE_CMD exec api sh -c 'echo "HOST=$SMTP_HOST PORT=$SMTP_PORT USER=$SMTP_USER FROM=$SMTP_FROM PASS_LEN=${#SMTP_PASS}"'

echo ""
echo "=== Test conexión SMTP (verify) ==="
$COMPOSE_CMD exec api node << 'NODE'
const nodemailer = require('nodemailer');

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = Number(process.env.SMTP_PORT || 587);
const secure = process.env.SMTP_SECURE === 'true' || port === 465;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!user || !pass) {
  console.error('FALTA: SMTP_USER o SMTP_PASS no están en el contenedor');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host,
  port,
  secure,
  requireTLS: !secure,
  auth: { user, pass },
  tls: { minVersion: 'TLSv1.2' },
});

transport.verify()
  .then(() => {
    console.log('OK: Gmail aceptó usuario y contraseña');
    process.exit(0);
  })
  .catch((err) => {
    console.error('FALLO:', err.code || 'ERROR', '-', err.message);
    if (err.response) console.error('Respuesta:', err.response);
    process.exit(1);
  });
NODE

echo ""
echo "=== Si FALLO con EAUTH ==="
echo "  1. Entra a noresponder@bookichat.com → verificación 2 pasos ON"
echo "  2. Nueva contraseña de aplicación: https://myaccount.google.com/apppasswords"
echo "  3. bash infra/digitalocean/fix-smtp-env.sh"
