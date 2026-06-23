# Configuración DNS — BookiChat

## Estructura de dominios

| Dominio | Uso | Quién lo configura |
|---------|-----|-------------------|
| `bookichat.com` | Sitio web comercial (marketing) | Tú (otro proyecto) |
| `www.bookichat.com` | Redirige al sitio comercial | Tú |
| `app.bookichat.com` | **App SaaS** — login, registro, panel hoteles | Este proyecto |

## URLs de la aplicación

| Ruta | URL completa |
|------|----------------|
| Login | https://app.bookichat.com/ |
| Registro hoteles | https://app.bookichat.com/registro |
| Panel hotel | https://app.bookichat.com/dashboard |
| API health | https://app.bookichat.com/api/health |
| Webhook WhatsApp | https://app.bookichat.com/api/webhooks/whatsapp |

---

## Paso 1 — DNS en tu registrador

```
Tipo:  A
Nombre: app
Valor:  161.35.2.26
TTL:    3600
```

---

## Paso 2 — Variables en el servidor

```env
APP_URL=https://app.bookichat.com
API_URL=https://app.bookichat.com
CORS_ORIGINS=https://app.bookichat.com
```

```bash
cd /opt/hotel-bot && docker compose restart api web
```

---

## Paso 3 — SSL

```bash
bash infra/digitalocean/setup-ssl-bookichat.sh admin@bookichat.com
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
```

---

## Verificar

- https://app.bookichat.com → Login
- https://app.bookichat.com/registro → Registro
