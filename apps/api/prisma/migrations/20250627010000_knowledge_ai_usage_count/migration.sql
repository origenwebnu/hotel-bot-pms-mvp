-- Contador de veces que la IA usa cada documento en respuestas RAG
ALTER TABLE "knowledge_documents" ADD COLUMN IF NOT EXISTS "ai_usage_count" INTEGER NOT NULL DEFAULT 0;
