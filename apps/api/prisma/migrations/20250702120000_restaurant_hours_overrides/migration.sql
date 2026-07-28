-- Per-date service hour overrides for restaurant reservations

ALTER TABLE "restaurant_date_rates" ADD COLUMN "open_time_override" TEXT;
ALTER TABLE "restaurant_date_rates" ADD COLUMN "close_time_override" TEXT;
