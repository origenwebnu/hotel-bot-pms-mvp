-- Mercado Pago platform billing for BookiChat subscriptions

CREATE TABLE "platform_credentials" (
    "id" TEXT NOT NULL,
    "credential_type" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "key_hint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_credentials_credential_type_key" ON "platform_credentials"("credential_type");

ALTER TABLE "hotel_subscription_payments" ADD COLUMN "plan_id" TEXT;
ALTER TABLE "hotel_subscription_payments" ADD COLUMN "provider" TEXT;
ALTER TABLE "hotel_subscription_payments" ADD COLUMN "external_id" TEXT;
ALTER TABLE "hotel_subscription_payments" ADD COLUMN "checkout_url" TEXT;

CREATE UNIQUE INDEX "hotel_subscription_payments_external_id_key" ON "hotel_subscription_payments"("external_id");
