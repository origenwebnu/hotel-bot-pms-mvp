-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "message_type" TEXT NOT NULL DEFAULT 'text',
    "external_id" TEXT,
    "session_state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_messages_session_id_created_at_idx" ON "conversation_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_messages_hotel_id_created_at_idx" ON "conversation_messages"("hotel_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_hotel_id_external_id_key" ON "conversation_messages"("hotel_id", "external_id");

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
