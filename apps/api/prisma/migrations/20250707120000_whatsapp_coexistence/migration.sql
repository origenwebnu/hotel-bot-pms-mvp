ALTER TABLE "hotels" ADD COLUMN "whatsapp_waba_id" TEXT;
ALTER TABLE "hotel_integrations" ADD COLUMN "whatsapp_coexistence" BOOLEAN NOT NULL DEFAULT false;
