import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SubscriptionLimitError } from './subscription.errors';

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'quota_reached'
  | 'trial_expired'
  | 'suspended';

export interface UsageSnapshot {
  status: SubscriptionStatus;
  mode: 'trial' | 'plan';
  used: number;
  limit: number;
  remaining: number;
  trial_ends_at: string | null;
  trial_days_left: number | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_price_monthly: number | null;
  plan_currency: string | null;
  period_month: string | null;
  can_create_reservations: boolean;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async getTrialSettings() {
    const rows = await this.prisma.platformSetting.findMany({
      where: {
        key: { in: ['trial_duration_days', 'trial_reservation_limit'] },
      },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      durationDays: Math.max(1, parseInt(map.trial_duration_days ?? '15', 10)),
      reservationLimit: Math.max(
        1,
        parseInt(map.trial_reservation_limit ?? '20', 10),
      ),
    };
  }

  async initializeTrialForHotel(hotelId: string, startedAt = new Date()) {
    const existing = await this.prisma.hotelSubscription.findUnique({
      where: { hotelId },
    });
    if (existing) return existing;

    const { durationDays } = await this.getTrialSettings();
    const trialEndsAt = new Date(startedAt);
    trialEndsAt.setDate(trialEndsAt.getDate() + durationDays);

    return this.prisma.hotelSubscription.create({
      data: {
        hotelId,
        status: 'trial',
        trialStartedAt: startedAt,
        trialEndsAt,
      },
    });
  }

  getCurrentPeriodMonth(date = new Date()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    return `${year}-${month}`;
  }

  private getMonthBounds(periodMonth: string) {
    const [year, month] = periodMonth.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1, 5, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 4, 59, 59));
    return { start, end };
  }

  async countTrialReservations(hotelId: string) {
    return this.prisma.billableReservation.count({
      where: { hotelId, isTrialPeriod: true },
    });
  }

  async countMonthlyReservations(hotelId: string, periodMonth: string) {
    return this.prisma.billableReservation.count({
      where: { hotelId, periodMonth, isTrialPeriod: false },
    });
  }

  async refreshSubscriptionStatus(hotelId: string) {
    const sub = await this.prisma.hotelSubscription.findUnique({
      where: { hotelId },
      include: { plan: true, hotel: { select: { name: true } } },
    });
    if (!sub) return null;

    const trialSettings = await this.getTrialSettings();
    const now = new Date();

    if (sub.status === 'trial') {
      const trialUsed = await this.countTrialReservations(hotelId);
      const trialExpiredByTime = now > sub.trialEndsAt;
      const trialExpiredByQuota = trialUsed >= trialSettings.reservationLimit;

      if (trialExpiredByTime || trialExpiredByQuota) {
        await this.prisma.hotelSubscription.update({
          where: { id: sub.id },
          data: { status: 'trial_expired' },
        });

        if (!sub.trialQuotaNotifiedAt && trialExpiredByQuota) {
          await this.notifyTrialQuotaReached(sub.hotel.name, hotelId);
          await this.prisma.hotelSubscription.update({
            where: { id: sub.id },
            data: { trialQuotaNotifiedAt: now },
          });
        }

        if (trialExpiredByTime && !trialExpiredByQuota) {
          await this.notifyTrialExpired(sub.hotel.name, hotelId, 'time');
        }
      }
    }

    if (sub.status === 'quota_reached' && sub.plan) {
      const periodMonth = this.getCurrentPeriodMonth(now);
      const used = await this.countMonthlyReservations(hotelId, periodMonth);
      if (used < sub.plan.maxReservationsPerMonth) {
        await this.prisma.hotelSubscription.update({
          where: { id: sub.id },
          data: { status: 'active', quotaNotifiedAt: null },
        });
      }
    }

    if (sub.status === 'active' && sub.plan) {
      const periodMonth = this.getCurrentPeriodMonth(now);
      const used = await this.countMonthlyReservations(hotelId, periodMonth);
      if (used >= sub.plan.maxReservationsPerMonth) {
        await this.prisma.hotelSubscription.update({
          where: { id: sub.id },
          data: { status: 'quota_reached' },
        });
      }
    }

    return this.prisma.hotelSubscription.findUnique({
      where: { hotelId },
      include: { plan: true, hotel: { select: { name: true } } },
    });
  }

  async getUsageSnapshot(hotelId: string): Promise<UsageSnapshot> {
    await this.refreshSubscriptionStatus(hotelId);

    const sub = await this.prisma.hotelSubscription.findUnique({
      where: { hotelId },
      include: { plan: true },
    });

    if (!sub) {
      return {
        status: 'trial_expired',
        mode: 'trial',
        used: 0,
        limit: 0,
        remaining: 0,
        trial_ends_at: null,
        trial_days_left: null,
        plan_id: null,
        plan_name: null,
        plan_price_monthly: null,
        plan_currency: null,
        period_month: null,
        can_create_reservations: false,
      };
    }

    const trialSettings = await this.getTrialSettings();
    const now = new Date();
    const periodMonth = this.getCurrentPeriodMonth(now);

    if (sub.status === 'trial') {
      const used = await this.countTrialReservations(hotelId);
      const limit = trialSettings.reservationLimit;
      const msLeft = sub.trialEndsAt.getTime() - now.getTime();
      const trialDaysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

      return {
        status: 'trial',
        mode: 'trial',
        used,
        limit,
        remaining: Math.max(0, limit - used),
        trial_ends_at: sub.trialEndsAt.toISOString(),
        trial_days_left: trialDaysLeft,
        plan_id: null,
        plan_name: null,
        plan_price_monthly: null,
        plan_currency: null,
        period_month: null,
        can_create_reservations:
          used < limit && trialDaysLeft > 0 && now <= sub.trialEndsAt,
      };
    }

    if (!sub.planId || !sub.plan) {
      return {
        status: sub.status as SubscriptionStatus,
        mode: 'plan',
        used: 0,
        limit: 0,
        remaining: 0,
        trial_ends_at: sub.trialEndsAt.toISOString(),
        trial_days_left: 0,
        plan_id: null,
        plan_name: null,
        plan_price_monthly: null,
        plan_currency: null,
        period_month: periodMonth,
        can_create_reservations: false,
      };
    }

    const used = await this.countMonthlyReservations(hotelId, periodMonth);
    const limit = sub.plan.maxReservationsPerMonth;
    const canCreate =
      sub.status === 'active' && used < limit;

    return {
      status: sub.status as SubscriptionStatus,
      mode: 'plan',
      used,
      limit,
      remaining: Math.max(0, limit - used),
      trial_ends_at: sub.trialEndsAt.toISOString(),
      trial_days_left: 0,
      plan_id: sub.plan.id,
      plan_name: sub.plan.name,
      plan_price_monthly: sub.plan.priceMonthly,
      plan_currency: sub.plan.currency,
      period_month: periodMonth,
      can_create_reservations: canCreate,
    };
  }

  async assertCanCreateReservation(hotelId: string) {
    const snapshot = await this.getUsageSnapshot(hotelId);

    if (snapshot.status === 'trial_expired') {
      throw new SubscriptionLimitError(
        'trial_expired',
        'El periodo de prueba de este hotel finalizó. El equipo del hotel debe elegir un plan en el panel de BookiChat.',
      );
    }

    if (snapshot.status === 'quota_reached') {
      throw new SubscriptionLimitError(
        'quota_reached',
        'Este hotel alcanzó el límite de reservas de su plan este mes. Debe actualizar a un plan superior en el panel de BookiChat.',
      );
    }

    if (snapshot.status === 'suspended') {
      throw new SubscriptionLimitError(
        'no_plan',
        'Este hotel tiene la cuenta suspendida. Contacta recepción para más información.',
      );
    }

    if (!snapshot.can_create_reservations) {
      if (snapshot.mode === 'trial') {
        throw new SubscriptionLimitError(
          'trial_expired',
          'El periodo de prueba de este hotel finalizó o alcanzó el límite de reservas. Debe elegir un plan en el panel.',
        );
      }
      throw new SubscriptionLimitError(
        'quota_reached',
        'Este hotel alcanzó el límite de reservas de su plan este mes.',
      );
    }
  }

  async recordBillableReservation(hotelId: string, reservationId: string) {
    const sub = await this.prisma.hotelSubscription.findUnique({
      where: { hotelId },
      include: { plan: true, hotel: { select: { name: true } } },
    });
    if (!sub) return;

    const isTrial = sub.status === 'trial';
    const periodMonth = this.getCurrentPeriodMonth();

    try {
      await this.prisma.billableReservation.create({
        data: {
          hotelId,
          reservationId,
          isTrialPeriod: isTrial,
          periodMonth: isTrial ? `trial-${hotelId}` : periodMonth,
        },
      });
    } catch {
      return;
    }

    const hotelName = sub.hotel.name;
    const refreshed = await this.refreshSubscriptionStatus(hotelId);
    if (!refreshed) return;

    const trialSettings = await this.getTrialSettings();

    if (isTrial) {
      const used = await this.countTrialReservations(hotelId);
      if (
        used >= trialSettings.reservationLimit &&
        !refreshed.trialQuotaNotifiedAt
      ) {
        await this.notifyTrialQuotaReached(hotelName, hotelId);
        await this.prisma.hotelSubscription.update({
          where: { id: refreshed.id },
          data: {
            status: 'trial_expired',
            trialQuotaNotifiedAt: new Date(),
          },
        });
      }
      return;
    }

    if (refreshed.plan) {
      const used = await this.countMonthlyReservations(hotelId, periodMonth);
      if (
        used >= refreshed.plan.maxReservationsPerMonth &&
        !refreshed.quotaNotifiedAt
      ) {
        await this.notifyMonthlyQuotaReached(
          hotelName,
          hotelId,
          refreshed.plan.name,
          refreshed.plan.maxReservationsPerMonth,
        );
        await this.prisma.hotelSubscription.update({
          where: { id: refreshed.id },
          data: {
            status: 'quota_reached',
            quotaNotifiedAt: new Date(),
          },
        });
      }
    }
  }

  async assignPlanToHotel(hotelId: string, planId: string | null) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException('Hotel no encontrado');

    await this.initializeTrialForHotel(hotelId, hotel.createdAt);

    if (!planId) {
      return this.prisma.hotelSubscription.update({
        where: { hotelId },
        data: {
          planId: null,
          status: 'trial_expired',
        },
        include: { plan: true },
      });
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { id: planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    const periodMonth = this.getCurrentPeriodMonth();
    const { start, end } = this.getMonthBounds(periodMonth);

    return this.prisma.hotelSubscription.update({
      where: { hotelId },
      data: {
        planId: plan.id,
        status: 'active',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        quotaNotifiedAt: null,
      },
      include: { plan: true },
    });
  }

  async resetTrialForHotel(hotelId: string) {
    const { durationDays } = await this.getTrialSettings();
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + durationDays);

    await this.prisma.billableReservation.deleteMany({
      where: { hotelId, isTrialPeriod: true },
    });

    return this.prisma.hotelSubscription.upsert({
      where: { hotelId },
      create: {
        hotelId,
        status: 'trial',
        trialStartedAt: new Date(),
        trialEndsAt,
        planId: null,
      },
      update: {
        status: 'trial',
        trialStartedAt: new Date(),
        trialEndsAt,
        planId: null,
        quotaNotifiedAt: null,
        trialQuotaNotifiedAt: null,
      },
    });
  }

  private async getHotelOwnerEmails(hotelId: string) {
    const users = await this.prisma.adminUser.findMany({
      where: { hotelId, role: { in: ['owner', 'admin'] } },
      select: { email: true },
    });
    return users.map((u) => u.email);
  }

  private async notifyTrialQuotaReached(hotelName: string, hotelId: string) {
    const emails = await this.getHotelOwnerEmails(hotelId);
    const { reservationLimit } = await this.getTrialSettings();
    for (const email of emails) {
      await this.email.sendTrialQuotaReached(email, hotelName, reservationLimit);
    }
  }

  private async notifyTrialExpired(
    hotelName: string,
    hotelId: string,
    reason: 'time' | 'quota',
  ) {
    const emails = await this.getHotelOwnerEmails(hotelId);
    for (const email of emails) {
      await this.email.sendTrialExpired(email, hotelName, reason);
    }
  }

  private async notifyMonthlyQuotaReached(
    hotelName: string,
    hotelId: string,
    planName: string,
    limit: number,
  ) {
    const emails = await this.getHotelOwnerEmails(hotelId);
    for (const email of emails) {
      await this.email.sendMonthlyQuotaReached(email, hotelName, planName, limit);
    }
  }
}
