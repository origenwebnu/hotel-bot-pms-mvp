-- CreateTable
CREATE TABLE "hotel_discount_tiers" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "min_total" DOUBLE PRECISION NOT NULL,
    "max_total" DOUBLE PRECISION,
    "discount_percent" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_discount_tiers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "original_amount" DOUBLE PRECISION;
ALTER TABLE "reservations" ADD COLUMN "discount_percent" DOUBLE PRECISION;
ALTER TABLE "reservations" ADD COLUMN "discount_tier_id" TEXT;

-- CreateIndex
CREATE INDEX "hotel_discount_tiers_hotel_id_idx" ON "hotel_discount_tiers"("hotel_id");

-- AddForeignKey
ALTER TABLE "hotel_discount_tiers" ADD CONSTRAINT "hotel_discount_tiers_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
