#!/usr/bin/env bash
# Elimina hoteles de prueba dejando solo el demo indicado por slug.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/hotel-bot}"
KEEP_SLUG="${1:-hotel-origen-web-1782248576158}"

cd "$APP_DIR"
source infra/digitalocean/compose-env.sh

echo "==> Hoteles actuales:"
$COMPOSE_CMD exec -T postgres psql -U hotelbot -d hotelbot -c \
  "SELECT id, name, slug, created_at FROM hotels ORDER BY created_at;"

echo ""
echo "==> Conservando slug: ${KEEP_SLUG}"
echo "==> Eliminando el resto..."

$COMPOSE_CMD exec -T postgres psql -U hotelbot -d hotelbot -v ON_ERROR_STOP=1 <<SQL
BEGIN;

DO \$\$
DECLARE
  demo_count INT;
BEGIN
  SELECT COUNT(*) INTO demo_count FROM hotels WHERE slug = '${KEEP_SLUG}';
  IF demo_count = 0 THEN
    RAISE EXCEPTION 'No existe hotel demo con slug: ${KEEP_SLUG}';
  END IF;
END \$\$;

DELETE FROM payment_events
WHERE hotel_id NOT IN (SELECT id FROM hotels WHERE slug = '${KEEP_SLUG}');

DELETE FROM billable_reservations
WHERE hotel_id NOT IN (SELECT id FROM hotels WHERE slug = '${KEEP_SLUG}');

DELETE FROM hotels
WHERE slug <> '${KEEP_SLUG}';

COMMIT;
SQL

echo ""
echo "==> Hoteles restantes:"
$COMPOSE_CMD exec -T postgres psql -U hotelbot -d hotelbot -c \
  "SELECT h.id, h.name, h.slug, (SELECT COUNT(*) FROM admin_users u WHERE u.hotel_id = h.id) AS admins, (SELECT COUNT(*) FROM reservations r WHERE r.hotel_id = h.id) AS reservations FROM hotels h ORDER BY h.created_at;"

echo ""
echo "OK: limpieza completada."
