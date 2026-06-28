import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  BUSINESS_VERTICAL_LABELS,
  type BusinessVertical,
} from '@hotel-bot/shared';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { getOpenAiClient } from '../common/openai.client';

export type BusinessAssistantProfile = {
  name: string;
  vertical: BusinessVertical;
};

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
    business?: BusinessAssistantProfile,
  ): Promise<string> {
    const ragContext = await this.knowledge.searchSimilar(hotelId, userMessage, 5);
    const businessLabel = business
      ? BUSINESS_VERTICAL_LABELS[business.vertical]
      : 'Hotel';
    const businessName = business?.name ?? 'el negocio';

    const systemPrompt = `Eres el asistente virtual de *${businessName}* (${businessLabel}). Responde con un tono cálido y profesional.
REGLAS ESTRICTAS:
- Solo responde con información verificada del negocio (contexto RAG abajo).
- Si no tienes la información, di amablemente que no la tienes y ofrece contactar al equipo del negocio.
- Nunca inventes precios, políticas ni servicios.
- Responde en el mismo idioma del cliente.
- Sé conciso (máximo 3 párrafos cortos).
${business && business.vertical !== 'hotel' ? '- Las reservas/ventas online para este tipo de negocio llegarán pronto; no prometas reservar o pagar por chat si el cliente lo pide.' : ''}

CONTEXTO DEL NEGOCIO (Knowledge Base):
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

  async extractBookingIntent(message: string): Promise<BookingIntent> {
    const today = new Date().toISOString().slice(0, 10);
    const openai = getOpenAiClient();
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analiza el mensaje del huésped de un hotel y extrae datos de reserva.
Hoy es ${today} (YYYY-MM-DD). Usa el año correcto si no lo mencionan (si la fecha ya pasó este año, usa el próximo).

REGLAS:
- Si preguntan precio, tarifa, cuánto vale, disponibilidad o habitación CON fechas → intent = "book"
- Extrae fechas aunque digan "del 28 al 29 de junio", "28-29 jun", etc. → formato YYYY-MM-DD
- "2 personas", "para 2", "2 adultos", "una pareja" → guests.adults (pareja = 2)
- Si hay fechas Y huéspedes en el mismo mensaje, extrae ambos
- intent = "faq" solo para preguntas generales SIN intención de reservar/cotizar
- NUNCA inventes guests.adults. Solo inclúyelo si el mensaje menciona explícitamente personas, adultos, huéspedes, pareja, o es solo un número (ej: "2").
- Si el huésped pide descuento, oferta, algo más barato o dice que es caro → price_sensitivity = true (aunque también quiera reservar)

Responde SOLO JSON:
{"intent":"book|faq|select_room|confirm|unknown","dates":{"check_in":"YYYY-MM-DD","check_out":"YYYY-MM-DD"},"guests":{"adults":N,"children":N},"room_id":"","price_sensitivity":true|false}`,
        },
        { role: 'user', content: message },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    try {
      return JSON.parse(response.choices[0]?.message?.content ?? '{}') as BookingIntent;
    } catch {
      return { intent: 'unknown' };
    }
  }
}

export type BookingIntent = {
  intent: 'book' | 'faq' | 'select_room' | 'confirm' | 'unknown';
  dates?: { check_in?: string; check_out?: string };
  guests?: { adults?: number; children?: number };
  room_id?: string;
  price_sensitivity?: boolean;
};
