CREATE TABLE "hotel_subscription_payments" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "period_month" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "plan_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hotel_subscription_payments_hotel_id_period_month_key" ON "hotel_subscription_payments"("hotel_id", "period_month");
CREATE INDEX "hotel_subscription_payments_hotel_id_idx" ON "hotel_subscription_payments"("hotel_id");

ALTER TABLE "hotel_subscription_payments" ADD CONSTRAINT "hotel_subscription_payments_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
