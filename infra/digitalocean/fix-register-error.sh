#!/usr/bin/env bash
# Repara errores comunes: Internal Server Error en registro/login
set -euo pipefail
cd /opt/hotel-bot

echo "=== 1. Estado contenedores ==="
docker compose ps -a

echo ""
echo "=== 2. Validar ENCRYPTION_KEY ==="
KEY=$(grep '^ENCRYPTION_KEY=' .env | cut -d= -f2 || true)
KEY_LEN=${#KEY}
if [ "$KEY_LEN" -ne 64 ]; then
  echo "⚠️  ENCRYPTION_KEY inválida (length=$KEY_LEN). Generando nueva..."
  sed -i "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
  echo "✅ ENCRYPTION_KEY actualizada"
else
  echo "✅ ENCRYPTION_KEY OK (64 chars)"
fi

echo ""
echo "=== 3. Comillas en WHATSAPP_ACCESS_TOKEN (evita romper .env) ==="
TOKEN=$(grep '^WHATSAPP_ACCESS_TOKEN=' .env | cut -d= -f2- | tr -d '"' || true)
if [ -n "$TOKEN" ] && ! grep -q '^WHATSAPP_ACCESS_TOKEN="' .env; then
  sed -i "s|^WHATSAPP_ACCESS_TOKEN=.*|WHATSAPP_ACCESS_TOKEN=\"$TOKEN\"|" .env
  echo "✅ Token WhatsApp entre comillas"
fi

echo ""
echo "=== 4. Migraciones DB ==="
docker compose exec -T api sh -c "cd /app/apps/api && npx prisma migrate deploy" || true

echo ""
echo "=== 5. Reiniciar servicios ==="
docker compose restart api web
sleep 15

echo ""
echo "=== 6. Test interno API ==="
docker compose exec -T web node -e \
  "fetch('http://api:4000/api/health').then(r=>r.text()).then(t=>console.log('API:',t)).catch(e=>console.error('FALLA:',e.message))"

echo ""
echo "=== 7. Test registro (interno) — flujo verificación ==="
docker compose exec -T web node -e "
fetch('http://api:4000/api/auth/register/send-code',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'diag-' + Date.now() + '@test.com',password:'test12345',passwordConfirm:'test12345',name:'Diag',hotelName:'Hotel Diag'})
}).then(r=>r.text()).then(t=>console.log('Send code:',t)).catch(e=>console.error('FALLA:',e.message))
"

echo ""
echo "=== 8. Logs API (si sigue fallando) ==="
docker compose logs api --tail 25

echo ""
echo "=== Listo. Prueba en navegador: /registro ==="
