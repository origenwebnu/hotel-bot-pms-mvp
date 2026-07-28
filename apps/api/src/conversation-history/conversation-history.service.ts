import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CONVERSATION_HISTORY_MAX_BODY_CHARS,
  CONVERSATION_HISTORY_MAX_MESSAGES_PER_THREAD,
  CONVERSATION_HISTORY_MAX_THREADS,
  type WhatsAppInboundMessage,
  type WhatsAppOutboundMessage,
} from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';

const DASHBOARD_SESSION_PHONE = 'dashboard-manual';

export type ConversationHistoryLabel = 'completed' | 'abandoned';

function truncate(text: string, max = CONVERSATION_HISTORY_MAX_BODY_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export function summarizeInboundMessage(message: WhatsAppInboundMessage): string {
  if (message.text?.trim()) return truncate(message.text);
  if (message.interactive?.list_reply) {
    return truncate(`[Lista] ${message.interactive.list_reply.title}`);
  }
  if (message.interactive?.button_reply) {
    return truncate(`[Botón] ${message.interactive.button_reply.title}`);
  }
  if (message.button?.text) {
    return truncate(`[Botón] ${message.button.text}`);
  }
  if (message.type === 'image') return '[Imagen]';
  return '[Mensaje]';
}

export function summarizeOutboundMessage(message: WhatsAppOutboundMessage): string {
  if (message.type === 'text') return truncate(message.text.body);
  const bodyText = message.body?.text?.trim() ?? '';
  if (message.type === 'cta_url') {
    const label = message.action?.parameters?.display_text ?? 'Enlace';
    return truncate(bodyText ? `${bodyText}\n[${label}]` : `[${label}]`);
  }
  return truncate(bodyText || `[${message.type}]`);
}

@Injectable()
export class ConversationHistoryService {
  private readonly logger = new Logger(ConversationHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  logInbound(
    hotelId: string,
    sessionId: string,
    message: WhatsAppInboundMessage,
    sessionState: string,
    phone: string,
  ): void {
    if (phone === DASHBOARD_SESSION_PHONE) return;
    void this.persistMessage({
      hotelId,
      sessionId,
      direction: 'inbound',
      body: summarizeInboundMessage(message),
      messageType: message.type,
      externalId: message.message_id,
      sessionState,
    }).catch((err) => {
      this.logger.warn(`Failed to log inbound message: ${err instanceof Error ? err.message : err}`);
    });
  }

  logOutbound(
    hotelId: string,
    phone: string,
    message: WhatsAppOutboundMessage,
    caption?: string,
  ): void {
    if (phone === DASHBOARD_SESSION_PHONE) return;
    void this.persistOutbound(hotelId, phone, message, caption).catch((err) => {
      this.logger.warn(`Failed to log outbound message: ${err instanceof Error ? err.message : err}`);
    });
  }

  private async persistOutbound(
    hotelId: string,
    phone: string,
    message: WhatsAppOutboundMessage,
    caption?: string,
  ) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const session = await this.prisma.conversationSession.findUnique({
      where: { hotelId_whatsappPhone: { hotelId, whatsappPhone: normalizedPhone } },
      select: { id: true, state: true },
    });
    if (!session) return;

    const body = caption
      ? truncate(`${caption}\n[Imagen]`)
      : summarizeOutboundMessage(message);

    await this.persistMessage({
      hotelId,
      sessionId: session.id,
      direction: 'outbound',
      body,
      messageType: caption ? 'image' : message.type,
      sessionState: session.state,
    });
  }

  private async persistMessage(input: {
    hotelId: string;
    sessionId: string;
    direction: 'inbound' | 'outbound';
    body: string;
    messageType: string;
    externalId?: string;
    sessionState?: string;
  }) {
    if (!input.body.trim()) return;

    try {
      await this.prisma.conversationMessage.create({
        data: {
          hotelId: input.hotelId,
          sessionId: input.sessionId,
          direction: input.direction,
          body: input.body,
          messageType: input.messageType,
          externalId: input.externalId ?? null,
          sessionState: input.sessionState ?? null,
        },
      });
    } catch (error) {
      if (
        input.externalId &&
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        return;
      }
      throw error;
    }

    await this.capThreadMessages(input.sessionId);
    await this.enforceHotelRetention(input.hotelId);
  }

  private async capThreadMessages(sessionId: string) {
    const count = await this.prisma.conversationMessage.count({ where: { sessionId } });
    if (count <= CONVERSATION_HISTORY_MAX_MESSAGES_PER_THREAD) return;

    const excess = count - CONVERSATION_HISTORY_MAX_MESSAGES_PER_THREAD;
    const oldest = await this.prisma.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: excess,
      select: { id: true },
    });
    if (!oldest.length) return;

    await this.prisma.conversationMessage.deleteMany({
      where: { id: { in: oldest.map((row) => row.id) } },
    });
  }

  private async enforceHotelRetention(hotelId: string) {
    const staleSessions = await this.prisma.conversationSession.findMany({
      where: { hotelId, messages: { some: {} } },
      orderBy: { lastMessageAt: 'desc' },
      skip: CONVERSATION_HISTORY_MAX_THREADS,
      select: { id: true },
    });

    if (!staleSessions.length) return;

    await this.prisma.conversationMessage.deleteMany({
      where: { hotelId, sessionId: { in: staleSessions.map((s) => s.id) } },
    });
  }

  async listForHotel(hotelId: string, label?: ConversationHistoryLabel) {
    const sessions = await this.prisma.conversationSession.findMany({
      where: {
        hotelId,
        whatsappPhone: { not: DASHBOARD_SESSION_PHONE },
        messages: { some: {} },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: CONVERSATION_HISTORY_MAX_THREADS,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true, direction: true },
        },
        _count: { select: { messages: true } },
      },
    });

    const sessionIds = sessions.map((s) => s.id);
    const paidRows =
      sessionIds.length > 0
        ? await this.prisma.reservation.findMany({
            where: {
              hotelId,
              whatsappSessionId: { in: sessionIds },
              paymentStatus: 'approved',
            },
            select: { whatsappSessionId: true },
          })
        : [];
    const paidSessionIds = new Set(paidRows.map((r) => r.whatsappSessionId));

    let items = sessions.map((session) => {
      const preview = session.messages[0];
      const historyLabel: ConversationHistoryLabel = paidSessionIds.has(session.id)
        ? 'completed'
        : 'abandoned';
      return {
        id: session.id,
        whatsapp_phone: session.whatsappPhone,
        state: session.state,
        label: historyLabel,
        last_message_at: session.lastMessageAt.toISOString(),
        message_count: session._count.messages,
        preview: preview?.body ?? '',
        preview_direction: preview?.direction ?? null,
      };
    });

    if (label) {
      items = items.filter((item) => item.label === label);
    }

    return {
      items,
      limit: CONVERSATION_HISTORY_MAX_THREADS,
      retention_note:
        'Se conservan las últimas 30 conversaciones y hasta 60 mensajes por chat.',
    };
  }

  async getThread(hotelId: string, sessionId: string) {
    const session = await this.prisma.conversationSession.findFirst({
      where: {
        id: sessionId,
        hotelId,
        whatsappPhone: { not: DASHBOARD_SESSION_PHONE },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            direction: true,
            body: true,
            messageType: true,
            sessionState: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Conversación no encontrada');
    }

    const paid = await this.prisma.reservation.findFirst({
      where: {
        hotelId,
        whatsappSessionId: sessionId,
        paymentStatus: 'approved',
      },
      select: { id: true, totalAmount: true, currency: true },
    });

    const label: ConversationHistoryLabel = paid ? 'completed' : 'abandoned';

    return {
      session: {
        id: session.id,
        whatsapp_phone: session.whatsappPhone,
        state: session.state,
        label,
        last_message_at: session.lastMessageAt.toISOString(),
        reservation_id: paid?.id ?? null,
        paid_amount: paid?.totalAmount ?? null,
        paid_currency: paid?.currency ?? null,
      },
      messages: session.messages.map((msg) => ({
        id: msg.id,
        direction: msg.direction,
        body: msg.body,
        message_type: msg.messageType,
        session_state: msg.sessionState,
        created_at: msg.createdAt.toISOString(),
      })),
    };
  }
}
