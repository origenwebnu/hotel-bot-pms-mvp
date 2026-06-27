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

  async updateHotel(
    hotelId: string,
    data: { name?: string; timezone?: string; currency?: string },
  ) {
    const hotel = await this.prisma.hotel.update({
      where: { id: hotelId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
      },
    });

    return {
      id: hotel.id,
      name: hotel.name,
      slug: hotel.slug,
      timezone: hotel.timezone,
      currency: hotel.currency,
    };
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

    const existing = await this.prisma.hotelIntegration.findUnique({
      where: { hotelId },
    });

    const integrationData: {
      pmsProvider?: string;
      pmsPropertyId?: string;
      paymentProvider?: string;
    } = {};

    if (data.pms_provider !== undefined) {
      integrationData.pmsProvider = data.pms_provider;
    }
    if (data.pms_property_id?.trim()) {
      integrationData.pmsPropertyId = data.pms_property_id.trim();
    }
    if (data.payment_provider !== undefined) {
      integrationData.paymentProvider = data.payment_provider;
    }

    await this.prisma.hotelIntegration.upsert({
      where: { hotelId },
      create: {
        hotelId,
        pmsProvider: data.pms_provider ?? 'local',
        pmsPropertyId: data.pms_property_id?.trim() || null,
        paymentProvider: data.payment_provider ?? 'wompi',
      },
      update: integrationData,
    });

    const credentialUpdates: Array<{ type: string; value?: string }> = [
      { type: 'pms_api_key', value: data.pms_api_key?.trim() },
      { type: 'pms_api_secret', value: data.pms_api_secret?.trim() },
      { type: 'payment_public_key', value: data.payment_public_key?.trim() },
      { type: 'payment_private_key', value: data.payment_private_key?.trim() },
      { type: 'payment_webhook_secret', value: data.payment_webhook_secret?.trim() },
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

    let pmsConnected = existing?.pmsConnected ?? false;
    let paymentConnected = existing?.paymentConnected ?? false;

    const pmsProvider = data.pms_provider ?? existing?.pmsProvider;
    if (pmsProvider === 'local') {
      pmsConnected = await this.pms.validatePmsCredentials(hotelId);
    } else if (data.pms_api_key?.trim()) {
      pmsConnected = await this.pms.validatePmsCredentials(hotelId);
    }

    if (data.payment_private_key?.trim()) {
      paymentConnected = true;
    } else {
      const storedPrivateKey = await this.prisma.encryptedCredential.findUnique({
        where: {
          hotelId_credentialType: {
            hotelId,
            credentialType: 'payment_private_key',
          },
        },
      });
      if (!storedPrivateKey) {
        paymentConnected = false;
      }
    }

    await this.prisma.hotelIntegration.update({
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
    const [integration, hotel, paymentCreds] = await Promise.all([
      this.prisma.hotelIntegration.findUnique({ where: { hotelId } }),
      this.prisma.hotel.findUnique({
        where: { id: hotelId },
        select: { reservationRecommendations: true },
      }),
      this.prisma.encryptedCredential.findMany({
        where: {
          hotelId,
          credentialType: {
            in: [
              'payment_public_key',
              'payment_private_key',
              'payment_webhook_secret',
            ],
          },
        },
      }),
    ]);

    const credTypes = new Set(paymentCreds.map((c) => c.credentialType));
    let publicKeyHint: string | null = null;

    const publicCred = paymentCreds.find(
      (c) => c.credentialType === 'payment_public_key',
    );
    if (publicCred) {
      try {
        const full = this.crypto.decrypt(publicCred.encryptedValue);
        publicKeyHint =
          full.length > 12 ? `${full.slice(0, 12)}…${full.slice(-4)}` : `${full.slice(0, 4)}…`;
      } catch {
        publicKeyHint = 'configurada';
      }
    }

    const appUrl = process.env.APP_URL ?? 'https://app.bookichat.com';

    return {
      provider: integration?.paymentProvider ?? null,
      connected: integration?.paymentConnected ?? false,
      has_public_key: credTypes.has('payment_public_key'),
      has_private_key: credTypes.has('payment_private_key'),
      has_webhook_secret: credTypes.has('payment_webhook_secret'),
      public_key_hint: publicKeyHint,
      webhook_url: buildWompiWebhookUrl(appUrl),
      stripe_webhook_url: `${appUrl.replace(/\/$/, '')}/api/webhooks/stripe`,
      reservation_recommendations: hotel?.reservationRecommendations ?? '',
      setup_steps: [
        'En Wompi → Configuración → Eventos, agrega la URL de eventos (webhook) indicada abajo.',
        'Copia el *Events Secret* de Wompi y pégalo en *Webhook Secret*.',
        'Ingresa tu Public Key y Private Key de Wompi (modo producción o pruebas).',
        'Pulsa *Validar pasarela de pagos* para confirmar que Wompi acepta tus llaves.',
        'Opcional: escribe recomendaciones post-pago que el bot enviará tras un pago aprobado.',
        'Guarda y realiza una reserva de prueba desde WhatsApp.',
      ],
    };
  }

  async getWhatsAppConfig(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { whatsappPhoneNumberId: true, whatsappDisplayPhone: true },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');

    const integration = await this.prisma.hotelIntegration.findUnique({
      where: { hotelId },
    });

    const appUrl = process.env.APP_URL ?? 'https://app.bookichat.com';

    return {
      phone_number_id: hotel.whatsappPhoneNumberId,
      display_phone: hotel.whatsappDisplayPhone,
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
        'Al validar se detecta el número público para el botón "Continuar reserva" en la galería de fotos.',
      ],
    };
  }

  async updateWhatsApp(
    hotelId: string,
    data: { phone_number_id?: string; access_token?: string; display_phone?: string },
  ) {
    if (data.phone_number_id !== undefined) {
      await this.prisma.hotel.update({
        where: { id: hotelId },
        data: { whatsappPhoneNumberId: data.phone_number_id.trim() || null },
      });
    }

    if (data.display_phone !== undefined) {
      await this.prisma.hotel.update({
        where: { id: hotelId },
        data: {
          whatsappDisplayPhone: data.display_phone.trim().replace(/\s+/g, '') || null,
        },
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
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const valid = response.ok;
    if (valid) {
      try {
        const data = (await response.json()) as { display_phone_number?: string };
        if (data.display_phone_number?.trim()) {
          await this.prisma.hotel.update({
            where: { id: hotelId },
            data: {
              whatsappDisplayPhone: data.display_phone_number.replace(/\D/g, ''),
            },
          });
        }
      } catch {
        // ignore parse errors; connection still valid
      }
    }

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
