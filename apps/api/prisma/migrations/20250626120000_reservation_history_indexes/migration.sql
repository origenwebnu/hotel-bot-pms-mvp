-- Indexes for reservation history and dashboard stats queries
CREATE INDEX "reservations_hotel_id_created_at_idx" ON "reservations"("hotel_id", "created_at" DESC);
CREATE INDEX "conversation_sessions_hotel_id_last_message_at_idx" ON "conversation_sessions"("hotel_id", "last_message_at" DESC);
