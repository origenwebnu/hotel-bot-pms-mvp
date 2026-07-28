-- Multi-business Phase 0: vertical + info-only mode
ALTER TABLE "hotels"
ADD COLUMN "business_vertical" TEXT NOT NULL DEFAULT 'hotel',
ADD COLUMN "info_only_mode" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "registration_verifications"
ADD COLUMN "business_vertical" TEXT NOT NULL DEFAULT 'hotel',
ADD COLUMN "info_only_mode" BOOLEAN NOT NULL DEFAULT false;
