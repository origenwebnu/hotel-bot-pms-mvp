-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'super_admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- Default platform settings
INSERT INTO "platform_settings" ("key", "value", "updated_at") VALUES
  ('platform_name', 'BookiChat', NOW()),
  ('support_email', 'soporte@bookichat.com', NOW()),
  ('registration_enabled', 'true', NOW()),
  ('default_timezone', 'America/Bogota', NOW()),
  ('default_currency', 'COP', NOW()),
  ('whatsapp_verify_token', 'bookichat_wa_verify_2026', NOW()),
  ('maintenance_mode', 'false', NOW())
ON CONFLICT ("key") DO NOTHING;
