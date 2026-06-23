import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { getOpenAiClient } from '../common/openai.client';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(forwardRef(() => KnowledgeService))
    private readonly knowledge: KnowledgeService,
  ) {}

  async generateResponse(
    hotelId: string,
    userMessage: string,
    systemContext: string,
  ): Promise<string> {
    const ragContext = await this.knowledge.searchSimilar(hotelId, userMessage, 5);

    const systemPrompt = `Eres el asistente virtual de un hotel. Responde con un tono cálido y profesional.
REGLAS ESTRICTAS:
- Solo responde con información verificada del hotel (contexto RAG abajo).
- Si no tienes la información, di amablemente que no la tienes y ofrece contactar recepción.
- Nunca inventes precios, políticas ni servicios.
- Responde en el mismo idioma del huésped.
- Sé conciso (máximo 3 párrafos cortos).

CONTEXTO DEL HOTEL (Knowledge Base):
${ragContext || 'No hay documentos cargados aún.'}

CONTEXTO DE LA CONVERSACIÓN:
${systemContext}`;

    const openai = getOpenAiClient();
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content ?? 'Lo siento, no pude procesar tu mensaje.';
  }

  async extractBookingIntent(message: string): Promise<{
    intent: 'book' | 'faq' | 'select_room' | 'confirm' | 'unknown';
    dates?: { check_in?: string; check_out?: string };
    guests?: { adults?: number; children?: number };
    room_id?: string;
  }> {
    const openai = getOpenAiClient();
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analiza el mensaje del huésped y extrae la intención. Responde SOLO JSON válido:
{"intent":"book|faq|select_room|confirm|unknown","dates":{"check_in":"YYYY-MM-DD","check_out":"YYYY-MM-DD"},"guests":{"adults":N,"children":N},"room_id":"id si seleccionó habitación"}`,
        },
        { role: 'user', content: message },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    try {
      return JSON.parse(response.choices[0]?.message?.content ?? '{}');
    } catch {
      return { intent: 'unknown' };
    }
  }
}
