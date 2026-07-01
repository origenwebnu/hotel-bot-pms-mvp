import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { SubscriptionPlanService } from '../subscription/subscription-plan.service';
import { MercadoPagoBillingService } from './mercadopago-billing.service';
import { PlatformCredentialService, PLATFORM_CREDENTIAL_TYPES } from './platform-credential.service';

@Injectable()
export class SubscriptionBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscription: SubscriptionService,
    private readonly plans: SubscriptionPlanService,
    private readonly mercadopago: MercadoPagoBillingService,
    private readonly credentials: PlatformCredentialService,
  ) {}

  async getPlatformBillingConfig() {
    return this.credentials.getBillingConfigStatus();
  }

  async updatePlatformBillingConfig(body: {
    mercadopago_access_token?: string;
    mercadopago_public_key?: string;
  }) {
    if (body.mercadopago_access_token !== undefined) {
      await this.credentials.upsertCredential(
        PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_ACCESS_TOKEN,
        body.mercadopago_access_token,
      );
    }
    if (body.mercadopago_public_key !== undefined) {
      await this.credentials.upsertCredential(
        PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_PUBLIC_KEY,
        body.mercadopago_public_key,
      );
    }
    return this.credentials.getBillingConfigStatus();
  }

  async validatePlatformBillingConfig() {
    return this.mercadopago.validateAccessToken();
  }

  async listActivePlansForHotel() {
    return this.plans.listPlans(false);
  }

  async createCheckout(hotelId: string, planId: string, payerEmail?: string) {
    const config = await this.credentials.getBillingConfigStatus();
    if (!config.configured) {
      throw new BadRequestException(
        'Los pagos de suscripción aún no están habilitados. Contacta a soporte BookiChat.',
      );
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        id: true,
        name: true,
        users: { take: 1, select: { email: true, name: true } },
      },
    });
    if (!hotel) throw new NotFoundException('Negocio no encontrado');

    const periodMonth = this.subscription.getCurrentPeriodMonth();
    const userEmail = payerEmail?.trim() || hotel.users[0]?.email || undefined;
    const userName = hotel.users[0]?.name || hotel.name;

    const paymentRecord = await this.prisma.hotelSubscriptionPayment.upsert({
      where: {
        hotelId_periodMonth: { hotelId, periodMonth },
      },
      create: {
        hotelId,
        periodMonth,
        planId: plan.id,
        amount: plan.priceMonthly,
        currency: plan.currency,
        planName: plan.name,
        status: 'pending',
        provider: 'mercadopago',
        description: `Suscripción ${plan.name} — ${periodMonth}`,
      },
      update: {
        planId: plan.id,
        amount: plan.priceMonthly,
        currency: plan.currency,
        planName: plan.name,
        status: 'pending',
        provider: 'mercadopago',
        description: `Suscripción ${plan.name} — ${periodMonth}`,
        paidAt: null,
        externalId: null,
        checkoutUrl: null,
      },
    });

    const appUrl = (process.env.APP_URL ?? 'https://app.bookichat.com').replace(/\/$/, '');
    const returnBase = `${appUrl}/dashboard?tab=account`;

    const preference = await this.mercadopago.createPreference({
      items: [
        {
          title: `BookiChat — Plan ${plan.name}`,
          quantity: 1,
          unit_price: plan.priceMonthly,
          currency_id: plan.currency,
        },
      ],
      payer: {
        email: userEmail,
        name: userName,
      },
      external_reference: paymentRecord.id,
      metadata: {
        hotel_id: hotelId,
        plan_id: plan.id,
        period_month: periodMonth,
        payment_record_id: paymentRecord.id,
      },
      back_urls: {
        success: `${returnBase}&subscription=success`,
        failure: `${returnBase}&subscription=failure`,
        pending: `${returnBase}&subscription=pending`,
      },
      auto_return: 'approved',
    });

    await this.prisma.hotelSubscriptionPayment.update({
      where: { id: paymentRecord.id },
      data: {
        externalId: preference.preference_id,
        checkoutUrl: preference.checkout_url,
      },
    });

    return {
      payment_id: paymentRecord.id,
      checkout_url: preference.checkout_url,
      preference_id: preference.preference_id,
      plan: {
        id: plan.id,
        name: plan.name,
        amount: plan.priceMonthly,
        currency: plan.currency,
      },
    };
  }

  async handleMercadoPagoWebhook(paymentId: string) {
    const payment = await this.mercadopago.getPayment(paymentId);
    const paymentRecordId = payment.external_reference;
    if (!paymentRecordId) {
      return { ignored: true, reason: 'missing external_reference' };
    }

    const record = await this.prisma.hotelSubscriptionPayment.findUnique({
      where: { id: paymentRecordId },
    });
    if (!record) {
      return { ignored: true, reason: 'payment record not found' };
    }

    if (payment.status === 'approved') {
      if (!record.planId) {
        return { ignored: true, reason: 'payment record missing plan_id' };
      }
      await this.subscription.activatePlanFromPayment(record.hotelId, record.planId, {
          provider: 'mercadopago',
          externalId: String(payment.id),
          periodMonth: record.periodMonth,
        },
      );
      return { ok: true, status: 'approved' };
    }

    if (['rejected', 'cancelled', 'refunded'].includes(payment.status)) {
      await this.prisma.hotelSubscriptionPayment.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          description: `Pago ${payment.status}: ${payment.status_detail ?? ''}`.trim(),
        },
      });
      return { ok: true, status: payment.status };
    }

    return { ok: true, status: payment.status, pending: true };
  }
}
