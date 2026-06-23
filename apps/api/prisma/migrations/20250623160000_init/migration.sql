-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "hotels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "whatsapp_phone_number_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hotel_integrations" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "pms_provider" TEXT,
    "pms_property_id" TEXT,
    "payment_provider" TEXT,
    "pms_connected" BOOLEAN NOT NULL DEFAULT false,
    "payment_connected" BOOLEAN NOT NULL DEFAULT false,
    "last_validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "encrypted_credentials" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "credential_type" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encrypted_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'text',
    "file_name" TEXT,
    "is_indexed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_vectors" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_vectors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_sessions" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "whatsapp_phone" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "check_in" TEXT,
    "check_out" TEXT,
    "adults" INTEGER,
    "children" INTEGER,
    "selected_room_type_id" TEXT,
    "reservation_id" TEXT,
    "context_json" JSONB,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "whatsapp_session_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inquiry',
    "room_type_id" TEXT,
    "room_name" TEXT,
    "check_in" TEXT,
    "check_out" TEXT,
    "adults" INTEGER,
    "children" INTEGER,
    "total_amount" DOUBLE PRECISION,
    "currency" TEXT,
    "pms_reservation_id" TEXT,
    "hold_expires_at" TIMESTAMP(3),
    "payment_link" TEXT,
    "payment_id" TEXT,
    "guest_first_name" TEXT,
    "guest_last_name" TEXT,
    "guest_email" TEXT,
    "guest_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "reservation_id" TEXT,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hotels_slug_key" ON "hotels"("slug");
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
CREATE UNIQUE INDEX "hotel_integrations_hotel_id_key" ON "hotel_integrations"("hotel_id");
CREATE UNIQUE INDEX "encrypted_credentials_hotel_id_credential_type_key" ON "encrypted_credentials"("hotel_id", "credential_type");
CREATE INDEX "knowledge_vectors_hotel_id_idx" ON "knowledge_vectors"("hotel_id");
CREATE UNIQUE INDEX "conversation_sessions_hotel_id_whatsapp_phone_key" ON "conversation_sessions"("hotel_id", "whatsapp_phone");
CREATE UNIQUE INDEX "reservations_idempotency_key_key" ON "reservations"("idempotency_key");
CREATE UNIQUE INDEX "payment_events_provider_external_id_key" ON "payment_events"("provider", "external_id");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hotel_integrations" ADD CONSTRAINT "hotel_integrations_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "encrypted_credentials" ADD CONSTRAINT "encrypted_credentials_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_vectors" ADD CONSTRAINT "knowledge_vectors_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
