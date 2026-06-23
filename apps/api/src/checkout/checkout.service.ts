import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  JOB_NAMES,
  QUEUE_NAMES,
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
    @InjectQueue(QUEUE_NAMES.PAYMENT_WEBHOOK) private readonly paymentQueue: Queue,
  ) {}

  async createPaymentLink(
    hotelId: string,
    request: PaymentLinkRequest,
  ): Promise<PaymentLinkResult> {
    const provider = await this.getPaymentProvider(hotelId);
    const credentials = await this.getPaymentCredentials(hotelId);

    const metadata = {
      reservation_id: request.reservation_id,
      hold_id: request.hold_id,
      hotel_id: hotelId,
      ...request.metadata,
    };

    if (provider === 'wompi') {
      return this.wompi.createPaymentLink(credentials, request, metadata);
    }
    return this.stripe.createPaymentLink(credentials, request, metadata);
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
    const reservationId = payload.metadata.reservation_id;
    if (!reservationId) {
      this.logger.warn('Webhook missing reservation_id in metadata');
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { hotel: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
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

    if (payload.status === 'approved') {
      await this.confirmReservation(reservation);
    } else if (payload.status === 'declined' || payload.status === 'error') {
      await this.notifyPaymentFailed(reservation);
    }
  }

  private async confirmReservation(
    reservation: {
      id: string;
      hotelId: string;
      pmsReservationId: string | null;
      guestFirstName: string | null;
      guestLastName: string | null;
      guestEmail: string | null;
      guestPhone: string | null;
    },
  ) {
    if (!reservation.pmsReservationId) return;

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

    if (reservation.guestPhone) {
      const msg = this.renderer.renderConfirmation(
        reservation.guestFirstName ?? 'Huésped',
        result.confirmation_code,
      );
      await this.whatsapp.sendInteractive(
        reservation.hotelId,
        reservation.guestPhone,
        msg,
      );
    }

    await this.prisma.paymentEvent.updateMany({
      where: { reservationId: reservation.id },
      data: { processed: true },
    });
  }

  private async notifyPaymentFailed(
    reservation: { hotelId: string; guestPhone: string | null },
  ) {
    if (!reservation.guestPhone) return;
    const msg = this.renderer.renderPaymentFailed();
    await this.whatsapp.sendInteractive(
      reservation.hotelId,
      reservation.guestPhone,
      msg,
    );
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
      decrypted[key] = this.crypto.decrypt(cred.encryptedValue);
    }

    const integration = await this.prisma.hotelIntegration.findUniqueOrThrow({
      where: { hotelId },
    });

    return {
      provider: integration.paymentProvider as PaymentProvider,
      public_key: decrypted.public_key,
      private_key: decrypted.private_key,
      webhook_secret: decrypted.webhook_secret,
    };
  }
}
