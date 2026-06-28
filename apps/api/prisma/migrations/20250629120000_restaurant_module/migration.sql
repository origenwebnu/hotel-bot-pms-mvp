-- Restaurant module: settings, zones, calendar rates, add-ons, reservation fields

ALTER TABLE "conversation_sessions"
ADD COLUMN "booking_date" TEXT,
ADD COLUMN "booking_time" TEXT,
ADD COLUMN "party_size" INTEGER,
ADD COLUMN "selected_dining_zone_id" TEXT,
ADD COLUMN "occasion_type" TEXT,
ADD COLUMN "selected_addons_json" JSONB;

ALTER TABLE "reservations"
ADD COLUMN "booking_kind" TEXT NOT NULL DEFAULT 'hotel_stay',
ADD COLUMN "dining_zone_id" TEXT,
ADD COLUMN "dining_zone_name" TEXT,
ADD COLUMN "booking_date" TEXT,
ADD COLUMN "booking_time" TEXT,
ADD COLUMN "party_size" INTEGER,
ADD COLUMN "occasion_type" TEXT,
ADD COLUMN "guest_country_code" TEXT,
ADD COLUMN "special_requests" TEXT,
ADD COLUMN "addons_json" JSONB;

CREATE INDEX "reservations_hotel_id_booking_date_booking_time_idx"
ON "reservations"("hotel_id", "booking_date", "booking_time");

CREATE TABLE "restaurant_settings" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "require_payment" BOOLEAN NOT NULL DEFAULT true,
    "post_payment_message" TEXT,
    "post_payment_link" TEXT,
    "slot_interval_minutes" INTEGER NOT NULL DEFAULT 30,
    "default_duration_minutes" INTEGER NOT NULL DEFAULT 90,
    "max_covers_per_slot" INTEGER,
    "advance_booking_days" INTEGER NOT NULL DEFAULT 60,
    "min_advance_hours" INTEGER NOT NULL DEFAULT 2,
    "service_hours_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_settings_hotel_id_key" ON "restaurant_settings"("hotel_id");

CREATE TABLE "dining_zones" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "min_party_size" INTEGER NOT NULL DEFAULT 1,
    "max_party_size" INTEGER NOT NULL,
    "capacity_per_slot" INTEGER NOT NULL DEFAULT 1,
    "base_reservation_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "base_price_per_guest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "photo_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dining_zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dining_zones_hotel_id_idx" ON "dining_zones"("hotel_id");

CREATE TABLE "restaurant_date_rates" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "dining_zone_id" TEXT,
    "date" DATE NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "reservation_fee_override" DOUBLE PRECISION,
    "price_per_guest_override" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_date_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_date_rates_hotel_id_dining_zone_id_date_key"
ON "restaurant_date_rates"("hotel_id", "dining_zone_id", "date");

CREATE INDEX "restaurant_date_rates_hotel_id_date_idx"
ON "restaurant_date_rates"("hotel_id", "date");

CREATE TABLE "restaurant_addons" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "max_quantity" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_addons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restaurant_addons_hotel_id_idx" ON "restaurant_addons"("hotel_id");

ALTER TABLE "restaurant_settings" ADD CONSTRAINT "restaurant_settings_hotel_id_fkey"
FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dining_zones" ADD CONSTRAINT "dining_zones_hotel_id_fkey"
FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restaurant_date_rates" ADD CONSTRAINT "restaurant_date_rates_hotel_id_fkey"
FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restaurant_date_rates" ADD CONSTRAINT "restaurant_date_rates_dining_zone_id_fkey"
FOREIGN KEY ("dining_zone_id") REFERENCES "dining_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restaurant_addons" ADD CONSTRAINT "restaurant_addons_hotel_id_fkey"
FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
