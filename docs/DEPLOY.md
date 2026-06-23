# Guía de Despliegue — DigitalOcean

## 1. Crear el Droplet

1. Inicia sesión en [DigitalOcean](https://cloud.digitalocean.com)
2. **Create → Droplets**
3. Configuración recomendada para MVP:
   - **Imagen:** Ubuntu 24.04 LTS
   - **Plan:** Basic — 2 vCPU / 4 GB RAM ($24/mo) mínimo recomendado
   - **Región:** La más cercana a tus hoteles (ej. NYC para LATAM)
   - **Autenticación:** SSH Key (recomendado)
4. Crea el droplet y anota la IP pública

## 2. Configurar DNS

En tu registrador de dominio, crea un registro A:

```
bot.tudominio.com  →  IP_DEL_DROPLET
```

## 3. Ejecutar script de setup

```bash
ssh root@IP_DEL_DROPLET
curl -fsSL https://raw.githubusercontent.com/origenwebnu/hotel-bot-pms-mvp/main/infra/digitalocean/setup-droplet.sh | bash
```

O manualmente:

```bash
git clone https://github.com/origenwebnu/hotel-bot-pms-mvp.git /opt/hotel-bot
cd /opt/hotel-bot
cp .env.example .env
nano .env   # Configura todas las variables
bash infra/digitalocean/setup-droplet.sh
```

## 4. Variables de entorno críticas

| Variable | Descripción |
|----------|-------------|
| `APP_URL` | `https://bot.tudominio.com` |
| `API_URL` | `https://bot.tudominio.com` |
| `ENCRYPTION_KEY` | 64 chars hex (generar con `openssl rand -hex 32`) |
| `JWT_SECRET` | String largo aleatorio |
| `OPENAI_API_KEY` | API key de OpenAI |
| `WHATSAPP_VERIFY_TOKEN` | Token que defines tú para Meta |
| `WHATSAPP_ACCESS_TOKEN` | Token permanente de Meta Business |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de WhatsApp Business |

## 5. Configurar WhatsApp Business API (Meta)

1. Crea una app en [Meta for Developers](https://developers.facebook.com)
2. Agrega producto **WhatsApp**
3. En **Configuration → Webhook:**
   - Callback URL: `https://bot.tudominio.com/api/webhooks/whatsapp`
   - Verify Token: el valor de `WHATSAPP_VERIFY_TOKEN` en tu `.env`
   - Suscríbete a: `messages`
4. Obtén el **Phone Number ID** y **Access Token** permanentes

## 6. SSL con Let's Encrypt

```bash
bash infra/digitalocean/setup-ssl.sh bot.tudominio.com admin@tudominio.com
```

## 7. Webhooks de pagos

### Wompi
- URL: `https://bot.tudominio.com/api/webhooks/wompi`
- Configura en el dashboard de Wompi → Eventos

### Stripe
- URL: `https://bot.tudominio.com/api/webhooks/stripe`
- Eventos: `checkout.session.completed`, `payment_intent.payment_failed`
- Copia el signing secret a `STRIPE_WEBHOOK_SECRET`

## 8. Comandos útiles

```bash
cd /opt/hotel-bot

# Ver logs
docker compose logs -f api

# Reiniciar servicios
docker compose restart

# Actualizar código
git pull && docker compose build && docker compose up -d

# Backup de base de datos
docker compose exec postgres pg_dump -U hotelbot hotelbot > backup.sql
```

## 9. Arquitectura en producción

```
Internet
    │
    ▼
[Nginx :80/:443]
    ├── /api/*     → NestJS API :4000
    └── /*         → Next.js Dashboard :3000

[NestJS API]
    ├── PostgreSQL + pgvector (RAG)
    ├── Redis (BullMQ colas)
    ├── OpenAI (LLM + embeddings)
    ├── WhatsApp Graph API
    ├── Cloudbeds / Lobby PMS
    └── Wompi / Stripe
```

## 10. Monitoreo recomendado

- Health check: `GET /api/health`
- Configura alertas en DigitalOcean Monitoring
- Considera agregar Sentry para errores (fase 2)
