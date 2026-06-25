import { Injectable, NotFoundException } from '@nestjs/common';
import { buildWompiWebhookUrl } from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { CoreIntegratorService } from '../core-integrator/core-integrator.service';
import { WhatsAppCredentialsService } from '../whatsapp/whatsapp-credentials.service';

@Injectable()
export class HotelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly pms: CoreIntegratorService,
    private readonly whatsappCredentials: WhatsAppCredentialsService,
  ) {}

  async getHotel(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { integration: true },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  async updateIntegration(
    hotelId: string,
    data: {
      pms_provider?: string;
      pms_property_id?: string;
      payment_provider?: string;
      pms_api_key?: string;
      pms_api_secret?: string;
      payment_public_key?: string;
      payment_private_key?: string;
      payment_webhook_secret?: string;
      reservation_recommendations?: string;
    },
  ) {
    if (data.reservation_recommendations !== undefined) {
      await this.prisma.hotel.update({
        where: { id: hotelId },
        data: { reservationRecommendations: data.reservation_recommendations.trim() || null },
      });
    }

    await this.prisma.hotelIntegration.upsert({
      where: { hotelId },
      create: {
        hotelId,
        pmsProvider: data.pms_provider,
        pmsPropertyId: data.pms_property_id,
        paymentProvider: data.payment_provider,
      },
      update: {
        pmsProvider: data.pms_provider,
        pmsPropertyId: data.pms_property_id,
        paymentProvider: data.payment_provider,
      },
    });

    const credentialUpdates: Array<{ type: string; value?: string }> = [
      { type: 'pms_api_key', value: data.pms_api_key },
      { type: 'pms_api_secret', value: data.pms_api_secret },
      { type: 'payment_public_key', value: data.payment_public_key },
      { type: 'payment_private_key', value: data.payment_private_key },
      { type: 'payment_webhook_secret', value: data.payment_webhook_secret },
    ];

    for (const { type, value } of credentialUpdates) {
      if (value) {
        await this.prisma.encryptedCredential.upsert({
          where: { hotelId_credentialType: { hotelId, credentialType: type } },
          create: {
            hotelId,
            credentialType: type,
            encryptedValue: this.crypto.encrypt(value),
          },
          update: { encryptedValue: this.crypto.encrypt(value) },
        });
      }
    }

    let pmsConnected = false;
    let paymentConnected = false;

    if (data.pms_provider === 'local') {
      pmsConnected = await this.pms.validatePmsCredentials(hotelId);
    } else if (data.pms_provider && data.pms_api_key) {
      pmsConnected = await this.pms.validatePmsCredentials(hotelId);
    }

    if (data.payment_provider && data.payment_private_key) {
      paymentConnected = true;
    }

    return this.prisma.hotelIntegration.update({
      where: { hotelId },
      data: {
        pmsConnected,
        paymentConnected,
        lastValidatedAt: new Date(),
      },
    });
  }

  async getIntegrationStatus(hotelId: string) {
    const [integration, hotel] = await Promise.all([
      this.prisma.hotelIntegration.findUnique({ where: { hotelId } }),
      this.prisma.hotel.findUnique({
        where: { id: hotelId },
        select: { whatsappPhoneNumberId: true },
      }),
    ]);

    if (!integration) throw new NotFoundException('Integration not found');

    return {
      pms_provider: integration.pmsProvider,
      pms_connected: integration.pmsConnected,
      payment_provider: integration.paymentProvider,
      payment_connected: integration.paymentConnected,
      whatsapp_connected: integration.whatsappConnected,
      whatsapp_phone_number_id: hotel?.whatsappPhoneNumberId ?? null,
      whatsapp_has_token: await this.whatsappCredentials.hasOwnToken(hotelId),
      last_validated_at: integration.lastValidatedAt,
    };
  }

  async getPaymentConfig(hotelId: string) {
    const [integration, hotel] = await Promise.all([
      this.prisma.hotelIntegration.findUnique({ where: { hotelId } }),
      this.prisma.hotel.findUnique({
        where: { id: hotelId },
        select: { reservationRecommendations: true },
      }),
    ]);

    const appUrl = process.env.APP_URL ?? 'https://app.bookichat.com';

    return {
      provider: integration?.paymentProvider ?? null,
      connected: integration?.paymentConnected ?? false,
      webhook_url: buildWompiWebhookUrl(appUrl),
      stripe_webhook_url: `${appUrl.replace(/\/$/, '')}/api/webhooks/stripe`,
      reservation_recommendations: hotel?.reservationRecommendations ?? '',
      setup_steps: [
        'En Wompi → Configuración → Eventos, agrega la URL de eventos (webhook) indicada abajo.',
        'Copia el *Events Secret* de Wompi y pégalo en *Webhook Secret*.',
        'Ingresa tu Public Key y Private Key de Wompi (modo producción o pruebas).',
        'Opcional: escribe recomendaciones post-pago que el bot enviará tras un pago aprobado.',
        'Guarda y realiza una reserva de prueba desde WhatsApp.',
      ],
    };
  }

  async getWhatsAppConfig(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { whatsappPhoneNumberId: true },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    const integration = await this.prisma.hotelIntegration.findUnique({
      where: { hotelId },
    });

    const appUrl = process.env.APP_URL ?? 'https://app.bookichat.com';

    return {
      phone_number_id: hotel.whatsappPhoneNumberId,
      connected: integration?.whatsappConnected ?? false,
      has_token: await this.whatsappCredentials.hasOwnToken(hotelId),
      webhook_url: `${appUrl.replace(/\/$/, '')}/api/webhooks/whatsapp`,
      verify_token_hint: process.env.WHATSAPP_VERIFY_TOKEN
        ? 'Configurado en la plataforma (contacta soporte si necesitas cambiarlo)'
        : null,
      setup_steps: [
        'En Meta Business → WhatsApp, copia el Phone Number ID de tu número.',
        'Genera un Access Token permanente (Usuario del sistema → Generar identificador).',
        'El webhook lo configura BookiChat una sola vez; todos los hoteles usan la misma URL.',
        'Guarda aquí tu Phone Number ID y token, luego pulsa Validar.',
      ],
    };
  }

  async updateWhatsApp(
    hotelId: string,
    data: { phone_number_id?: string; access_token?: string },
  ) {
    if (data.phone_number_id !== undefined) {
      await this.prisma.hotel.update({
        where: { id: hotelId },
        data: { whatsappPhoneNumberId: data.phone_number_id.trim() || null },
      });
    }

    if (data.access_token?.trim()) {
      await this.prisma.encryptedCredential.upsert({
        where: {
          hotelId_credentialType: {
            hotelId,
            credentialType: 'whatsapp_access_token',
          },
        },
        create: {
          hotelId,
          credentialType: 'whatsapp_access_token',
          encryptedValue: this.crypto.encrypt(data.access_token.trim()),
        },
        update: {
          encryptedValue: this.crypto.encrypt(data.access_token.trim()),
        },
      });
    }

    await this.ensureIntegration(hotelId);

    return this.getWhatsAppConfig(hotelId);
  }

  async validateWhatsApp(hotelId: string): Promise<boolean> {
    const { phoneNumberId, accessToken } =
      await this.whatsappCredentials.resolve(hotelId);

    if (!phoneNumberId || !accessToken) {
      await this.setWhatsAppConnected(hotelId, false);
      return false;
    }

    const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const valid = response.ok;
    await this.setWhatsAppConnected(hotelId, valid);
    return valid;
  }

  private async ensureIntegration(hotelId: string) {
    await this.prisma.hotelIntegration.upsert({
      where: { hotelId },
      create: { hotelId },
      update: {},
    });
  }

  private async setWhatsAppConnected(hotelId: string, connected: boolean) {
    await this.ensureIntegration(hotelId);
    await this.prisma.hotelIntegration.update({
      where: { hotelId },
      data: { whatsappConnected: connected, lastValidatedAt: new Date() },
    });
  }
}
