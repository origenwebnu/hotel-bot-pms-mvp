# HotelBot — Chatbot SaaS de Reservas para Hoteles (WhatsApp Native)

Plataforma SaaS que actúa como motor de reservas conversacional 24/7 integrado con **WhatsApp Business API**, sincronizado con **Cloudbeds** y **Lobby PMS**, con IA generativa (RAG) y pagos via **Wompi/Stripe**.

## Arquitectura

```
hotel-bot-pms-mvp/
├── apps/
│   ├── api/          # NestJS — Backend (4 módulos)
│   └── web/          # Next.js — Dashboard del hotelero
├── packages/
│   ├── shared/       # Tipos y constantes compartidos
│   └── pms-adapters/ # Adaptadores Cloudbeds + Lobby PMS
├── docker/           # Dockerfiles y nginx
├── infra/            # Scripts DigitalOcean
└── docs/             # Documentación de despliegue
```

### Módulos del Backend

| Módulo | Responsabilidad |
|--------|----------------|
| **Core Integrator** | Sincronización PMS, disponibilidad, hold/confirm reservas |
| **Conversation & AI** | WhatsApp webhooks, LLM + RAG, componentes interactivos |
| **Checkout** | Links de pago Wompi/Stripe, webhooks, confirmación automática |
| **Hotels + Knowledge** | API del dashboard, credenciales encriptadas, vector DB |

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (producción)
- PostgreSQL 16 + pgvector
- Redis 7+

## Desarrollo local

```bash
# 1. Clonar e instalar
git clone https://github.com/origenwebnu/hotel-bot-pms-mvp.git
cd hotel-bot-pms-mvp
pnpm install

# 2. Configurar entorno
cp .env.example .env
# Edita .env con tus keys

# 3. Levantar infraestructura
docker compose up postgres redis -d

# 4. Migrar base de datos
pnpm db:migrate

# 5. Iniciar desarrollo
pnpm dev
```

- **Dashboard:** http://localhost:3000
- **API:** http://localhost:4000/api
- **Health:** http://localhost:4000/api/health

## Despliegue en DigitalOcean

Ver guía completa: [docs/DEPLOY.md](docs/DEPLOY.md)

```bash
# En tu droplet Ubuntu 24.04
bash infra/digitalocean/setup-droplet.sh
```

## Flujos implementados

### Flujo A — Consulta y cotización
WhatsApp → IA extrae fechas/huéspedes → PMS consulta disponibilidad → List Message con habitaciones

### Flujo B — Reserva con pago
Selección habitación → Hold en PMS (10 min) → Link Wompi/Stripe → Webhook pago → Confirmación PMS + WhatsApp

## API Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Registrar hotel + admin |
| POST | `/api/auth/login` | Login dashboard |
| PUT | `/api/hotels/me/integration` | Configurar PMS y pagos |
| GET | `/api/hotels/me/integration/validate-pms` | Validar credenciales PMS |
| POST | `/api/hotels/me/knowledge` | Agregar documento RAG |
| POST | `/api/hotels/me/knowledge/test-chat` | Simulador IA |
| GET/POST | `/api/webhooks/whatsapp` | Webhook Meta |
| POST | `/api/webhooks/wompi` | Webhook Wompi |
| POST | `/api/webhooks/stripe` | Webhook Stripe |

## Seguridad

- Credenciales API encriptadas con AES-256-GCM
- Sin almacenamiento de datos de tarjeta (PCI-DSS delegado a pasarelas)
- Idempotencia en reservas via `whatsapp_session_id`
- Colas BullMQ para concurrencia de webhooks

## Próximos pasos (Roadmap)

- [ ] Upload de archivos PDF para Knowledge Base
- [ ] Multi-tenant con subdominios por hotel
- [ ] Panel de reservas y analytics
- [ ] Integración PayU
- [ ] Tests E2E del flujo completo

## Licencia

Privado — origenwebnu
