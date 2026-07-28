#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/hotel-bot"
PUBLIC_IP="${PUBLIC_IP:-$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')}"

cd "$APP_DIR"
source infra/digitalocean/compose-env.sh

echo "==> Validando .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
  sed -i "s/JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 48)/" .env
fi

KEY_LEN=$(grep '^ENCRYPTION_KEY=' .env | cut -d= -f2 | wc -c)
if [ "$KEY_LEN" -lt 64 ]; then
  sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
fi

sed -i "s|APP_URL=.*|APP_URL=https://app.bookichat.com|" .env
sed -i "s|API_URL=.*|API_URL=https://app.bookichat.com|" .env
grep -q '^CORS_ORIGINS=' .env && sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://app.bookichat.com|" .env || echo "CORS_ORIGINS=https://app.bookichat.com" >> .env
grep -q '^ROOM_HOLD_TTL_MINUTES=' .env && sed -i "s|ROOM_HOLD_TTL_MINUTES=.*|ROOM_HOLD_TTL_MINUTES=30|" .env || echo "ROOM_HOLD_TTL_MINUTES=30" >> .env
grep -q '^RESERVATION_RESUME_HOURS=' .env && sed -i "s|RESERVATION_RESUME_HOURS=.*|RESERVATION_RESUME_HOURS=24|" .env || echo "RESERVATION_RESUME_HOURS=24" >> .env

export API_URL="http://${PUBLIC_IP}"

if [ "$SSL_ENABLED" = "1" ]; then
  echo "==> SSL detectado (docker/certs/) — despliegue con nginx HTTPS"
else
  echo "==> Sin certificados SSL — despliegue HTTP puerto 80"
fi

echo "==> Reconstruyendo contenedores..."
$COMPOSE_CMD down --remove-orphans 2>/dev/null || true

for svc in postgres redis api web nginx; do
  docker rm -f "hotel-bot-${svc}-1" 2>/dev/null || true
done

if [ "$SSL_ENABLED" != "1" ]; then
  docker stop hotel-bot-nginx-1 2>/dev/null || true
  docker rm hotel-bot-nginx-1 2>/dev/null || true
fi

$COMPOSE_CMD build --no-cache api web
$COMPOSE_CMD up -d

echo "==> Migraciones de base de datos..."
bash infra/digitalocean/migrate-api.sh || {
  echo "WARN: migrate deploy falló — revisar logs del contenedor api"
}

echo "==> Esperando servicios (hasta 90s)..."
OK=0
for i in $(seq 1 18); do
  API_OK=0
  WEB_OK=0
  PUBLIC_OK=0
  $COMPOSE_CMD exec -T api node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && API_OK=1 || true
  $COMPOSE_CMD exec -T web node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && WEB_OK=1 || true
  curl -sf http://localhost/api/health >/dev/null 2>&1 && PUBLIC_OK=1 || PUBLIC_OK=0
  if [ "$SSL_ENABLED" = "1" ]; then
    curl -sfk https://localhost/api/health >/dev/null 2>&1 && PUBLIC_OK=1 || PUBLIC_OK=0
  fi
  if [ "$API_OK" = "1" ] && [ "$WEB_OK" = "1" ] && [ "$PUBLIC_OK" = "1" ]; then
    OK=1
    echo "✅ API y WEB responden"
    break
  fi
  echo "  intento $i/18 — api=$API_OK web=$WEB_OK public=$PUBLIC_OK ssl=$SSL_ENABLED"
  sleep 5
done

echo ""
bash infra/digitalocean/diagnose.sh

if [ "$OK" != "1" ]; then
  echo ""
  echo "❌ DEPLOY FALLÓ — servicios no responden"
  exit 1
fi

DEMO_HOTEL_CLEANUP_MARKER="$APP_DIR/.demo-hotel-cleanup-v1.done"
if [ ! -f "$DEMO_HOTEL_CLEANUP_MARKER" ]; then
  echo ""
  echo "==> Limpieza one-time: conservar solo hotel demo..."
  if bash infra/digitalocean/cleanup-test-hotels.sh "hotel-origen-web-1782248576158"; then
    touch "$DEMO_HOTEL_CLEANUP_MARKER"
    echo "✅ Limpieza de hoteles de prueba completada"
  else
    echo "WARN: limpieza de hoteles de prueba falló — reintentará en el próximo deploy"
  fi
fi

echo ""
echo "✅ Deploy OK"
echo "   http://${PUBLIC_IP}"
if [ "$SSL_ENABLED" = "1" ]; then
  echo "   https://app.bookichat.com"
  curl -sfk "https://localhost/api/health" && echo ""
else
  curl -sf "http://localhost/api/health" && echo ""
fi
