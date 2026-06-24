import { Injectable, Logger } from '@nestjs/common';
import type { WhatsAppOutboundMessage } from '@hotel-bot/shared';
import { WhatsAppCredentialsService } from './whatsapp-credentials.service';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

  constructor(private readonly credentials: WhatsAppCredentialsService) {}

  async sendText(hotelId: string, to: string, text: string) {
    await this.sendMessage(hotelId, to, { type: 'text', text: { body: text } });
  }

  async sendInteractive(
    hotelId: string,
    to: string,
    message: WhatsAppOutboundMessage,
  ) {
    await this.sendMessage(hotelId, to, message);
  }

  private async sendMessage(
    hotelId: string,
    to: string,
    message: WhatsAppOutboundMessage,
  ) {
    const { phoneNumberId, accessToken } =
      await this.credentials.resolve(hotelId);

    if (!phoneNumberId || !accessToken) {
      throw new Error(
        'WhatsApp no configurado para este hotel. Completa Phone Number ID y Access Token en Integraciones.',
      );
    }

    const payload = this.buildPayload(to, message);

    const response = await fetch(
      `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`WhatsApp send failed: ${response.status} ${error}`);
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    this.logger.debug(`Message sent to ${to} for hotel ${hotelId}`);
  }

  private buildPayload(to: string, message: WhatsAppOutboundMessage) {
    const base = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
    };

    if (message.type === 'text') {
      return { ...base, type: 'text', text: message.text };
    }

    if (message.type === 'list') {
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: message.header,
          body: message.body,
          footer: message.footer,
          action: message.action,
        },
      };
    }

    if (message.type === 'button') {
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          header: message.header,
          body: message.body,
          footer: message.footer,
          action: message.action,
        },
      };
    }

    return base;
  }
}
