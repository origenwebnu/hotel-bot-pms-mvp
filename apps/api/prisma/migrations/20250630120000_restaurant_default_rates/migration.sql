-- Default restaurant-wide reservation rates (shown on calendar as base tariff)

ALTER TABLE "restaurant_settings"
ADD COLUMN "default_reservation_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "default_price_per_guest" DOUBLE PRECISION NOT NULL DEFAULT 0;
