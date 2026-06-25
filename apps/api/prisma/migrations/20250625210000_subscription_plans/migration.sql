-- Subscription plans and hotel billing model
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_reservations_per_month" INTEGER NOT NULL,
    "price_monthly" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hotel_subscriptions" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "trial_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_ends_at" TIMESTAMP(3) NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "quota_notified_at" TIMESTAMP(3),
    "trial_quota_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billable_reservations" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "is_trial_period" BOOLEAN NOT NULL DEFAULT false,
    "billed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_month" TEXT NOT NULL,

    CONSTRAINT "billable_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hotel_subscriptions_hotel_id_key" ON "hotel_subscriptions"("hotel_id");
CREATE UNIQUE INDEX "billable_reservations_reservation_id_key" ON "billable_reservations"("reservation_id");
CREATE INDEX "billable_reservations_hotel_id_period_month_idx" ON "billable_reservations"("hotel_id", "period_month");

ALTER TABLE "hotel_subscriptions" ADD CONSTRAINT "hotel_subscriptions_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hotel_subscriptions" ADD CONSTRAINT "hotel_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "platform_settings" ("key", "value", "updated_at") VALUES
  ('trial_duration_days', '15', NOW()),
  ('trial_reservation_limit', '20', NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "subscription_plans" (
  "id", "name", "max_reservations_per_month", "price_monthly", "currency", "description", "sort_order", "updated_at"
) VALUES (
  'plan_starter_0_50',
  'Plan 0-50 reservas',
  50,
  190000,
  'COP',
  'Hasta 50 reservas efectivas por mes. Ideal para hoteles pequeños.',
  1,
  NOW()
);

-- Backfill trial for existing hotels without subscription
INSERT INTO "hotel_subscriptions" (
  "id", "hotel_id", "status", "trial_started_at", "trial_ends_at", "updated_at"
)
SELECT
  'sub_' || h.id,
  h.id,
  'trial',
  h.created_at,
  h.created_at + INTERVAL '15 days',
  NOW()
FROM "hotels" h
WHERE NOT EXISTS (
  SELECT 1 FROM "hotel_subscriptions" hs WHERE hs.hotel_id = h.id
);
