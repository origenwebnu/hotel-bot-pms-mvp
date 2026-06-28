import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import {
  JOB_NAMES,
  QUEUE_NAMES,
  buildPaymentPageUrl,
  buildPaymentResultUrl,
  type PaymentLinkRequest,
  type PaymentLinkResult,
  type PaymentProvider,
  type PaymentWebhookPayload,
} from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { CoreIntegratorService } from '../core-integrator/core-integrator.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WhatsAppRendererService } from '../whatsapp/whatsapp-renderer.service';
import { WompiProvider } from './providers/wompi.provider';
import { StripeProvider } from './providers/stripe.provider';
import { BoldProvider } from './providers/bold.provider';
import { EpaycoProvider } from './providers/epayco.provider';
import type { PaymentProviderAdapter } from './providers/payment-provider.interface';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly pms: CoreIntegratorService,
    private readonly whatsapp: WhatsAppService,
    private readonly renderer: WhatsAppRendererService,
    private readonly wompi: WompiProvider,
    private readonly stripe: StripeProvider,
    private readonly bold: BoldProvider,
    private readonly epayco: EpaycoProvider,
    @InjectQueue(QUEUE_NAMES.PAYMENT_WEBHOOK) private readonly paymentQueue: Queue,
  ) {}

  generatePaymentAccessToken(): string {
    return randomBytes(24).toString('hex');
  }

  buildPaymentPageUrl(reservationId: string, token: string): string {
    return buildPaymentPageUrl(
      reservationId,
      token,
      process.env.APP_URL ?? 'https://app.bookichat.com',
    );
  }

  async getPaymentSetupStatus(hotelId: string): Promise<{
    configured: boolean;
    provider: string | null;
    hasPrivateKey: boolean;
    reason?: string;
  }> {
    const integration = await this.prisma.hotelIntegration.findUnique({
      where: { hotelId },
    });

    if (!integration?.paymentProvider) {
      return {
        configured: false,
        provider: null,
        hasPrivateKey: false,
        reason: 'No hay proveedor de pagos seleccionado en Integraciones.',
      };
    }

    const privateKey = await this.prisma.encryptedCredential.findUnique({
      where: {
        hotelId_credentialType: {
          hotelId,
          credentialType: 'payment_private_key',
        },
      },
    });

    if (!privateKey) {
      return {
        configured: false,
        provider: integration.paymentProvider,
        hasPrivateKey: false,
        reason: `Falta la llave privada o API Key. Guárdala en Integraciones → Pagos.`,
      };
    }

    const publicKey = await this.prisma.encryptedCredential.findUnique({
      where: {
        hotelId_credentialType: {
          hotelId,
          credentialType: 'payment_public_key',
        },
      },
    });

    const requiresPublicKey = ['wompi', 'epayco'].includes(integration.paymentProvider);
    if (requiresPublicKey && !publicKey) {
      return {
        configured: false,
        provider: integration.paymentProvider,
        hasPrivateKey: true,
        reason: `Falta la llave pública. Guárdala en Integraciones → Pagos.`,
      };
    }

    return {
      configured: true,
      provider: integration.paymentProvider,
      hasPrivateKey: true,
    };
  }

  async validatePaymentSetup(hotelId: string): Promise<{
    valid: boolean;
    reason?: string;
    api_base?: string;
  }> {
    const setup = await this.getPaymentSetupStatus(hotelId);
    if (!setup.configured) {
      return { valid: false, reason: setup.reason };
    }

    try {
      const credentials = await this.getPaymentCredentials(hotelId);
      const provider = await this.getPaymentProvider(hotelId);
      const adapter = this.getProviderAdapter(provider);

      if (provider === 'wompi') {
        const apiBase = this.wompi.resolveApiBase(credentials.private_key);
        if (!credentials.public_key) {
          return {
            valid: false,
            reason: 'Falta la Public Key de Wompi. Guárdala en Integraciones → Pasarela de Pagos.',
            api_base: apiBase,
          };
        }

        const response = await fetch(
          `${apiBase}/merchants/${encodeURIComponent(credentials.public_key)}`,
          { headers: { Authorization: `Bearer ${credentials.private_key}` } },
        );

        if (!response.ok) {
          const body = await response.text();
          return {
            valid: false,
            reason: `Wompi rechazó las llaves (${response.status}): ${body.slice(0, 200)}`,
            api_base: apiBase,
          };
        }
      } else if (adapter.validateCredentials) {
        const valid = await adapter.validateCredentials(credentials);
        if (!valid) {
          return {
            valid: false,
            reason: `Las credenciales de ${this.providerLabel(provider)} no son válidas.`,
          };
        }
      } else if (!credentials.private_key && !credentials.public_key) {
        return {
          valid: false,
          reason: 'Faltan credenciales de pago. Guárdalas en Integraciones → Pagos.',
        };
      }

      await this.prisma.hotelIntegration.update({
        where: { hotelId },
        data: { paymentConnected: true, lastValidatedAt: new Date() },
      });

      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, reason: message };
    }
  }

  async ensureReservationPayment(
    hotelId: string,
    reservationId: string,
  ): Promise<{
    reservation: Awaited<ReturnType<typeof this.loadReservationForPayment>>;
    paymentReady: boolean;
    userMessage?: string;
  }> {
    const setup = await this.getPaymentSetupStatus(hotelId);
    if (!setup.configured) {
      const reservation = await this.loadReservationForPayment(reservationId);
      return {
        reservation,
        paymentReady: false,
        userMessage:
          `⚠️ ${setup.reason ?? 'Pagos no configurados.'}\n\n` +
          `Tu reserva quedó registrada. Configura la pasarela de pagos en el panel del hotel e intenta de nuevo escribiendo *pagar*.`,
      };
    }

    let reservation = await this.loadReservationForPayment(reservationId);
    let accessToken = reservation.paymentAccessToken;

    if (!accessToken) {
      accessToken = this.generatePaymentAccessToken();
      reservation = await this.prisma.reservation.update({
        where: { id: reservationId },
        data: { paymentAccessToken: accessToken },
      });
    }

    const hasValidPaymentLink = this.isValidStoredPaymentLink(
      setup.provider ?? 'wompi',
      reservation.paymentLink,
    );

    if (hasValidPaymentLink && reservation.paymentAccessToken) {
      return { reservation, paymentReady: true };
    }

    if (reservation.paymentLink && !hasValidPaymentLink) {
      reservation = await this.prisma.reservation.update({
        where: { id: reservationId },
        data: { paymentLink: null, paymentId: null },
      });
    }

    if (!reservation.totalAmount || !reservation.guestEmail) {
      return {
        reservation,
        paymentReady: false,
        userMessage:
          '⚠️ No pudimos generar el link de pago (faltan datos de la reserva). Escribe *menu* y vuelve a reservar.',
      };
    }

    try {
      const holdId = reservation.pmsReservationId ?? `local-${reservation.id}`;
      const holdExpiry =
        reservation.holdExpiresAt && reservation.holdExpiresAt > new Date()
          ? reservation.holdExpiresAt
          : new Date(Date.now() + 60 * 60 * 1000);
      const expiresAt = holdExpiry.toISOString();

      const hotelRecord = await this.prisma.hotel.findUnique({
        where: { id: hotelId },
        select: { name: true },
      });

      const payment = await this.createPaymentLink(hotelId, {
        amount: reservation.totalAmount,
        currency: reservation.currency ?? 'COP',
        reservation_id: reservation.id,
        hold_id: holdId,
        expires_at: expiresAt,
        guest_email: reservation.guestEmail,
        guest_name:
          [reservation.guestFirstName, reservation.guestLastName]
            .filter(Boolean)
            .join(' ') || 'Huésped',
        metadata: {
          payment_access_token: accessToken,
          hotel_name: hotelRecord?.name ?? 'Hotel',
        },
      });

      reservation = await this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'payment_pending',
          paymentLink: payment.payment_url,
          paymentId: payment.payment_id,
        },
      });

      if (!reservation.paymentLink) {
        throw new Error('La pasarela no devolvió URL de pago');
      }

      return { reservation, paymentReady: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `ensureReservationPayment failed for ${reservationId}: ${message}`,
      );

      const providerLabel = this.providerLabel(
        (setup.provider ?? 'wompi') as PaymentProvider,
      );
      let userMessage =
        `⚠️ No pudimos conectar con ${providerLabel} para generar el pago. Revisa las credenciales en Integraciones → Pagos.`;

      if (message.includes('401') || message.includes('403')) {
        userMessage =
          `⚠️ Las credenciales de ${providerLabel} parecen incorrectas (error de autenticación). Verifica las llaves en el panel.`;
      } else if (message.includes('sandbox') || message.includes('test')) {
        userMessage =
          `⚠️ Estás usando llaves de prueba: configura el entorno de pruebas o usa llaves de producción.`;
      }

      return { reservation, paymentReady: false, userMessage };
    }
  }

  private loadReservationForPayment(reservationId: string) {
    return this.prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
  }

  async createPaymentLink(
    hotelId: string,
    request: PaymentLinkRequest,
  ): Promise<PaymentLinkResult> {
    const provider = await this.getPaymentProvider(hotelId);
    const credentials = await this.getPaymentCredentials(hotelId);

    const accessToken = request.metadata?.payment_access_token ?? '';
    const metadata = {
      reservation_id: request.reservation_id,
      hold_id: request.hold_id,
      hotel_id: hotelId,
      payment_access_token: accessToken,
      redirect_url: buildPaymentResultUrl(request.reservation_id, accessToken),
      confirmation_url: `${(process.env.APP_URL ?? 'https://app.bookichat.com').replace(/\/$/, '')}/api/webhooks/epayco`,
      ...request.metadata,
    };

    return this.getProviderAdapter(provider).createPaymentLink(credentials, request, metadata);
  }

  private getProviderAdapter(provider: PaymentProvider): PaymentProviderAdapter {
    switch (provider) {
      case 'wompi':
        return this.wompi;
      case 'stripe':
        return this.stripe;
      case 'bold':
        return this.bold;
      case 'epayco':
        return this.epayco;
      default:
        throw new NotFoundException(`Proveedor de pagos no soportado: ${provider}`);
    }
  }

  private isValidStoredPaymentLink(provider: string, link: string | null | undefined): boolean {
    if (!link) return false;
    switch (provider) {
      case 'wompi':
        return link.includes('checkout.wompi.co/l/');
      case 'bold':
        return link.includes('checkout.bold.co/');
      case 'epayco':
        return link.includes('/payment/');
      case 'stripe':
        return link.includes('stripe.com') || link.includes('/payment/');
      default:
        return link.length > 8;
    }
  }

  private providerLabel(provider: PaymentProvider): string {
    switch (provider) {
      case 'wompi':
        return 'Wompi';
      case 'bold':
        return 'Bold';
      case 'epayco':
        return 'ePayco';
      case 'stripe':
        return 'Stripe';
      default:
        return provider;
    }
  }

  async enqueueWebhook(payload: PaymentWebhookPayload) {
    await this.paymentQueue.add(
      JOB_NAMES.CONFIRM_PAYMENT,
      payload,
      {
        jobId: `${payload.provider}-${payload.payment_id}`,
        removeOnComplete: true,
        attempts: 5,
      },
    );
  }

  async processPaymentWebhook(payload: PaymentWebhookPayload) {
    const reservation = await this.resolveReservationForWebhook(payload);
    if (!reservation) {
      this.logger.warn(
        `Webhook could not match reservation (tx=${payload.payment_id}, link=${payload.metadata.payment_link_id ?? 'n/a'})`,
      );
      return;
    }

    await this.prisma.paymentEvent.upsert({
      where: {
        provider_externalId: {
          provider: payload.provider,
          externalId: payload.payment_id,
        },
      },
      create: {
        hotelId: reservation.hotelId,
        reservationId: reservation.id,
        provider: payload.provider,
        externalId: payload.payment_id,
        status: payload.status,
        amount: payload.amount,
        currency: payload.currency,
        rawPayload: payload.raw as object,
        processed: false,
      },
      update: {
        status: payload.status,
        rawPayload: payload.raw as object,
      },
    });

    await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        paymentStatus: payload.status,
        ...(payload.status === 'declined' || payload.status === 'error'
          ? { status: 'rejected' }
          : {}),
      },
    });

    const terminalStatuses = ['approved', 'declined', 'error', 'expired'] as const;
    if (!terminalStatuses.includes(payload.status as (typeof terminalStatuses)[number])) {
      return;
    }

    const paymentEvent = await this.prisma.paymentEvent.findUnique({
      where: {
        provider_externalId: {
          provider: payload.provider,
          externalId: payload.payment_id,
        },
      },
    });

    if (paymentEvent?.processed) {
      this.logger.log(
        `Skipping duplicate payment webhook for ${payload.provider}/${payload.payment_id} (already processed)`,
      );
      return;
    }

    const freshReservation = await this.prisma.reservation.findUnique({
      where: { id: reservation.id },
      include: {
        hotel: {
          select: {
            name: true,
            reservationRecommendations: true,
            restaurantSettings: {
              select: {
                postPaymentMessage: true,
                postPaymentLink: true,
              },
            },
          },
        },
      },
    });

    if (!freshReservation) return;

    if (payload.status === 'approved') {
      if (freshReservation.status === 'confirmed') {
        await this.markPaymentEventProcessed(payload);
        this.logger.log(
          `Reservation ${freshReservation.id} already confirmed; skipping duplicate approval messages`,
        );
        return;
      }
      await this.confirmReservation(freshReservation, payload);
      return;
    }

    if (payload.status === 'declined' || payload.status === 'error') {
      await this.prisma.conversationSession.updateMany({
        where: { id: freshReservation.whatsappSessionId },
        data: { state: 'awaiting_payment', reservationId: freshReservation.id },
      });
      await this.notifyPaymentOutcome(freshReservation, payload);
    }
  }

  private async resolveReservationForWebhook(payload: PaymentWebhookPayload) {
    const include = {
      hotel: {
        select: {
          name: true,
          reservationRecommendations: true,
          restaurantSettings: {
            select: {
              postPaymentMessage: true,
              postPaymentLink: true,
            },
          },
        },
      },
    } as const;

    const reservationId = payload.metadata.reservation_id;
    if (reservationId) {
      const byId = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        include,
      });
      if (byId) return byId;
    }

    const paymentLinkId = payload.metadata.payment_link_id;
    if (paymentLinkId) {
      const byPaymentId = await this.prisma.reservation.findFirst({
        where: { paymentId: paymentLinkId },
        include,
      });
      if (byPaymentId) return byPaymentId;

      const byLinkUrl = await this.prisma.reservation.findFirst({
        where: { paymentLink: { contains: `/l/${paymentLinkId}` } },
        include,
      });
      if (byLinkUrl) return byLinkUrl;
    }

    return null;
  }

  private async confirmReservation(
    reservation: ReservationWithHotel,
    payload: PaymentWebhookPayload,
  ) {
    if (reservation.status === 'confirmed') {
      await this.markPaymentEventProcessed(payload);
      return;
    }

    if (reservation.pmsReservationId) {
      try {
        const result = await this.pms.confirmReservation(reservation.hotelId, {
          hold_id: reservation.id,
          pms_reservation_id: reservation.pmsReservationId,
          guest: {
            first_name: reservation.guestFirstName ?? '',
            last_name: reservation.guestLastName ?? '',
            email: reservation.guestEmail ?? '',
            phone: reservation.guestPhone ?? '',
          },
        });

        await this.prisma.reservation.update({
          where: { id: reservation.id },
          data: { status: 'confirmed' },
        });

        await this.prisma.conversationSession.updateMany({
          where: { id: reservation.whatsappSessionId },
          data: { state: 'confirmed' },
        });

        await this.sendWhatsAppPaymentReceipt(reservation, payload, {
          confirmationCode: result.confirmation_code,
        });
      } catch (error) {
        this.logger.error(`PMS confirm failed for ${reservation.id}: ${error}`);
        await this.sendWhatsAppPaymentReceipt(reservation, payload, {
          note: 'Pago recibido. El hotel confirmará tu reserva en breve.',
        });
      }
    } else {
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: 'confirmed' },
      });

      await this.prisma.conversationSession.updateMany({
        where: { id: reservation.whatsappSessionId },
        data: { state: 'confirmed' },
      });

      await this.sendWhatsAppPaymentReceipt(reservation, payload);
    }
  }

  private async markPaymentEventProcessed(payload: PaymentWebhookPayload) {
    await this.prisma.paymentEvent.updateMany({
      where: {
        provider: payload.provider,
        externalId: payload.payment_id,
      },
      data: { processed: true },
    });
  }

  private async claimPaymentNotification(
    payload: PaymentWebhookPayload,
  ): Promise<boolean> {
    const result = await this.prisma.paymentEvent.updateMany({
      where: {
        provider: payload.provider,
        externalId: payload.payment_id,
        processed: false,
      },
      data: { processed: true },
    });
    return result.count > 0;
  }

  private async notifyPaymentOutcome(
    reservation: ReservationWithHotel,
    payload: PaymentWebhookPayload,
  ) {
    await this.sendWhatsAppPaymentReceipt(reservation, payload);
  }

  private async sendWhatsAppPaymentReceipt(
    reservation: ReservationWithHotel,
    payload: PaymentWebhookPayload,
    extras?: { confirmationCode?: string; note?: string },
  ) {
    const claimed = await this.claimPaymentNotification(payload);
    if (!claimed) {
      this.logger.log(
        `Payment WhatsApp already sent for ${payload.provider}/${payload.payment_id}`,
      );
      return;
    }

    if (!reservation.guestPhone) {
      this.logger.warn(`No guest phone for reservation ${reservation.id}`);
      return;
    }

    let accessToken = reservation.paymentAccessToken;
    if (!accessToken) {
      accessToken = this.generatePaymentAccessToken();
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { paymentAccessToken: accessToken },
      });
    }

    const paymentPageUrl = buildPaymentPageUrl(
      reservation.id,
      accessToken,
    );
    const guests = (reservation.adults ?? 0) + (reservation.children ?? 0);
    const guestName =
      [reservation.guestFirstName, reservation.guestLastName]
        .filter(Boolean)
        .join(' ') || 'Huésped';

    if (reservation.bookingKind === 'restaurant_table') {
      const occasionLabels: Record<string, string> = {
        birthday: 'Cumpleaños',
        anniversary: 'Aniversario',
        romantic_dinner: 'Cena romántica',
        business: 'Negocios',
        celebration: 'Celebración',
        other: 'Otro',
      };
      const occasionLabel =
        occasionLabels[reservation.occasionType ?? 'other'] ??
        reservation.occasionType ??
        'Visita';

      const receipt = this.renderer.renderRestaurantReservationReceipt({
        businessName: reservation.hotel.name,
        reservationRef: reservation.id.slice(-8).toUpperCase(),
        guestName,
        guestPhone: reservation.guestPhone ?? undefined,
        zoneName: reservation.diningZoneName ?? 'Mesa',
        date: reservation.bookingDate ?? '',
        time: reservation.bookingTime ?? '',
        partySize: reservation.partySize ?? 1,
        occasionLabel,
        amount: reservation.totalAmount ?? payload.amount,
        currency: reservation.currency ?? payload.currency,
      });

      await this.whatsapp.sendText(
        reservation.hotelId,
        reservation.guestPhone,
        receipt.text.body,
      );

      if (payload.status === 'approved') {
        const settings = reservation.hotel.restaurantSettings;
        const thanks = this.renderer.renderRestaurantConfirmed({
          guestName: reservation.guestFirstName ?? 'Cliente',
          reservationRef: reservation.id.slice(-8).toUpperCase(),
          date: reservation.bookingDate ?? '',
          time: reservation.bookingTime ?? '',
          zoneName: reservation.diningZoneName ?? 'Mesa',
          partySize: reservation.partySize ?? 1,
          postPaymentMessage: settings?.postPaymentMessage,
          postPaymentLink: settings?.postPaymentLink,
        });
        await this.whatsapp.sendText(
          reservation.hotelId,
          reservation.guestPhone,
          thanks.text.body,
        );
      } else if (payload.status === 'declined' || payload.status === 'error') {
        const retry = this.renderer.renderPaymentDeclinedActions({
          guestName: reservation.guestFirstName ?? 'Cliente',
          paymentPageUrl,
        });
        try {
          await this.whatsapp.sendInteractive(
            reservation.hotelId,
            reservation.guestPhone,
            retry,
          );
        } catch (error) {
          this.logger.warn(`Interactive declined message failed: ${error}`);
          await this.whatsapp.sendText(
            reservation.hotelId,
            reservation.guestPhone,
            `❌ Tu pago no pudo completarse.\n\nEscribe *pagar* para intentar de nuevo.\n\n${paymentPageUrl}`,
          );
        }
      }
      return;
    }

    const receipt = this.renderer.renderPaymentStatusReceipt({
      hotelName: reservation.hotel.name,
      reservationRef: reservation.id.slice(-8).toUpperCase(),
      paymentRef: payload.payment_id.slice(-12).toUpperCase(),
      guestName,
      guestEmail: reservation.guestEmail ?? '—',
      roomName: reservation.roomName ?? 'Habitación',
      checkIn: reservation.checkIn ?? '',
      checkOut: reservation.checkOut ?? '',
      guests,
      amount: reservation.totalAmount ?? payload.amount,
      originalAmount: reservation.originalAmount ?? undefined,
      discountPercent: reservation.discountPercent ?? undefined,
      currency: reservation.currency ?? payload.currency,
      paymentStatus: payload.status,
    });

    await this.whatsapp.sendText(
      reservation.hotelId,
      reservation.guestPhone,
      receipt.text.body,
    );

    if (payload.status === 'approved') {
      const thanks = this.renderer.renderPaymentApprovedFollowUp({
        guestName: reservation.guestFirstName ?? 'Huésped',
        confirmationCode: extras?.confirmationCode,
        recommendations: reservation.hotel.reservationRecommendations,
        note: extras?.note,
      });
      await this.whatsapp.sendText(
        reservation.hotelId,
        reservation.guestPhone,
        thanks.text.body,
      );
      return;
    }

    if (payload.status === 'declined' || payload.status === 'error') {
      const retry = this.renderer.renderPaymentDeclinedActions({
        guestName: reservation.guestFirstName ?? 'Huésped',
        paymentPageUrl,
      });
      try {
        await this.whatsapp.sendInteractive(
          reservation.hotelId,
          reservation.guestPhone,
          retry,
        );
      } catch (error) {
        this.logger.warn(`Interactive declined message failed: ${error}`);
        await this.whatsapp.sendText(
          reservation.hotelId,
          reservation.guestPhone,
          `❌ Tu pago no pudo completarse.\n\nTu habitación sigue reservada por ahora. Escribe *pagar* para intentar de nuevo o *menu* para cambiar la reserva.\n\n${paymentPageUrl}`,
        );
      }
    }
  }

  private async getPaymentProvider(hotelId: string): Promise<PaymentProvider> {
    const integration = await this.prisma.hotelIntegration.findUnique({
      where: { hotelId },
    });
    if (!integration?.paymentProvider) {
      throw new NotFoundException('Payment provider not configured');
    }
    return integration.paymentProvider as PaymentProvider;
  }

  private async getPaymentCredentials(hotelId: string) {
    const creds = await this.prisma.encryptedCredential.findMany({
      where: {
        hotelId,
        credentialType: { startsWith: 'payment_' },
      },
    });

    const decrypted: Record<string, string> = {};
    for (const cred of creds) {
      const key = cred.credentialType.replace('payment_', '');
      try {
        decrypted[key] = this.crypto.decrypt(cred.encryptedValue);
      } catch (error) {
        this.logger.error(
          `Failed to decrypt ${cred.credentialType} for hotel ${hotelId}: ${error}`,
        );
        throw new Error(
          'No se pudieron leer las llaves de pago guardadas. Vuelve a guardarlas en Integraciones.',
        );
      }
    }

    const integration = await this.prisma.hotelIntegration.findUniqueOrThrow({
      where: { hotelId },
    });

    return {
      provider: integration.paymentProvider as PaymentProvider,
      public_key: decrypted.public_key,
      private_key: decrypted.private_key,
      webhook_secret: decrypted.webhook_secret,
      customer_id: decrypted.customer_id,
    };
  }
}

type ReservationWithHotel = {
  id: string;
  hotelId: string;
  whatsappSessionId: string;
  status: string;
  bookingKind: string;
  pmsReservationId: string | null;
  guestFirstName: string | null;
  guestLastName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  roomName: string | null;
  diningZoneName: string | null;
  bookingDate: string | null;
  bookingTime: string | null;
  partySize: number | null;
  occasionType: string | null;
  checkIn: string | null;
  checkOut: string | null;
  adults: number | null;
  children: number | null;
  totalAmount: number | null;
  originalAmount: number | null;
  discountPercent: number | null;
  currency: string | null;
  paymentAccessToken: string | null;
  hotel: {
    name: string;
    reservationRecommendations: string | null;
    restaurantSettings?: {
      postPaymentMessage: string | null;
      postPaymentLink: string | null;
    } | null;
  };
};
