-- AlterTable
ALTER TABLE "hotels" ADD COLUMN "reservation_recommendations" TEXT;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "payment_access_token" TEXT;
ALTER TABLE "reservations" ADD COLUMN "payment_status" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "reservations_payment_access_token_key" ON "reservations"("payment_access_token");
