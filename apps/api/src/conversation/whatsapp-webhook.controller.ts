import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../prisma/prisma.service';
import type { WhatsAppInboundMessage } from '@hotel-bot/shared';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly conversation: ConversationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('WhatsApp webhook verified');
      return challenge;
    }
    return 'Forbidden';
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() body: WhatsAppWebhookPayload) {
    if (body.object !== 'whatsapp_business_account') {
      return { status: 'ignored' };
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;

        const phoneNumberId = change.value.metadata?.phone_number_id;
        const hotelId = await this.resolveHotelId(phoneNumberId);

        for (const message of change.value.messages ?? []) {
          const inbound = this.parseMessage(message);
          await this.conversation.enqueueMessage(hotelId, inbound);
        }
      }
    }

    return { status: 'ok' };
  }

  private parseMessage(msg: WhatsAppRawMessage): WhatsAppInboundMessage {
    const base = {
      from: msg.from,
      message_id: msg.id,
      timestamp: msg.timestamp,
      type: msg.type as WhatsAppInboundMessage['type'],
    };

    if (msg.type === 'text') {
      return { ...base, text: msg.text?.body };
    }

    if (msg.type === 'interactive') {
      return {
        ...base,
        type: 'interactive',
        interactive: msg.interactive as WhatsAppInboundMessage['interactive'],
      };
    }

    if (msg.type === 'button') {
      return {
        ...base,
        button: msg.button as { payload: string; text: string },
      };
    }

    return { ...base, text: '' };
  }

  private async resolveHotelId(phoneNumberId?: string): Promise<string> {
    if (phoneNumberId) {
      const hotel = await this.prisma.hotel.findFirst({
        where: { whatsappPhoneNumberId: phoneNumberId, isActive: true },
      });
      if (hotel) return hotel.id;
    }
    return process.env.DEFAULT_HOTEL_ID ?? 'default';
  }
}

interface WhatsAppWebhookPayload {
  object: string;
  entry?: Array<{
    changes?: Array<{
      field: string;
      value: {
        metadata?: { phone_number_id: string };
        messages?: WhatsAppRawMessage[];
      };
    }>;
  }>;
}

interface WhatsAppRawMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  interactive?: unknown;
  button?: unknown;
}
