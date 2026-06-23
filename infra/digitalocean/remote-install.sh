#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/hotel-bot"
PUBLIC_IP="${PUBLIC_IP:-$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')}"

cd "$APP_DIR"

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

sed -i "s|APP_URL=.*|APP_URL=http://${PUBLIC_IP}|" .env
sed -i "s|API_URL=.*|API_URL=http://${PUBLIC_IP}|" .env

export API_URL="http://${PUBLIC_IP}"

echo "==> Reconstruyendo contenedores..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose build --no-cache api web
docker compose up -d

echo "==> Esperando servicios (hasta 90s)..."
OK=0
for i in $(seq 1 18); do
  API_OK=0
  WEB_OK=0
  docker compose exec -T api node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && API_OK=1 || true
  docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && WEB_OK=1 || true
  if [ "$API_OK" = "1" ] && [ "$WEB_OK" = "1" ]; then
    OK=1
    echo "✅ API y WEB responden"
    break
  fi
  echo "  intento $i/18 — api=$API_OK web=$WEB_OK"
  sleep 5
done

echo ""
bash infra/digitalocean/diagnose.sh

if [ "$OK" != "1" ]; then
  echo ""
  echo "❌ DEPLOY FALLÓ — servicios no responden"
  exit 1
fi

echo ""
echo "✅ Deploy OK"
echo "   http://${PUBLIC_IP}"
curl -sf "http://localhost/api/health" && echo ""
