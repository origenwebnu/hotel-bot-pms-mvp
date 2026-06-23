# Despliegue automático con GitHub Actions

Con esta configuración, **cada push a `main` despliega solo** en tu droplet. Solo configuras los secretos una vez.

## Paso 1 — Hacer el repo público (recomendado, 1 minuto)

GitHub → **hotel-bot-pms-mvp** → **Settings** → **Danger Zone** → **Change visibility** → **Public**

> Alternativa: mantener privado y usar token en el servidor (más complejo).

## Paso 2 — Agregar secretos en GitHub

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secreto | Valor |
|---------|-------|
| `DROPLET_IP` | `161.35.2.26` |
| `SSH_PRIVATE_KEY` | Contenido completo de tu clave privada SSH (ver abajo) |

### Obtener la clave privada (en tu Mac)

```bash
cat ~/.ssh/id_ed25519
```

Copia **todo** el bloque, incluyendo:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

> Esta es la misma clave cuya parte **pública** ya agregaste en DigitalOcean al crear el droplet.

## Paso 3 — Disparar el deploy

Opción A — Push automático (ya configurado): cualquier merge a `main` despliega.

Opción B — Manual: GitHub → **Actions** → **Deploy to DigitalOcean** → **Run workflow**

## Paso 4 — Configurar OpenAI en el servidor (una vez)

Después del primer deploy, entra por SSH:

```bash
ssh root@161.35.2.26
nano /opt/hotel-bot/.env
# Cambia OPENAI_API_KEY=sk-tu-key-real
docker compose -f /opt/hotel-bot/docker-compose.yml restart api
```

## Instalación manual (sin Actions)

Si el repo es **público**, en el droplet:

```bash
curl -fsSL https://raw.githubusercontent.com/origenwebnu/hotel-bot-pms-mvp/main/infra/digitalocean/remote-install.sh | bash
```

## Verificar

- http://161.35.2.26 — Dashboard
- http://161.35.2.26/api/health — API OK
