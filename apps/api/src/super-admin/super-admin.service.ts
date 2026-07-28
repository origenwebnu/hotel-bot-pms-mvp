import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { SubscriptionPlanService } from '../subscription/subscription-plan.service';
import { ReservationsService } from '../reservations/reservations.service';
import type { ReservationOutcome } from '../reservations/reservation-outcome';

const DEFAULT_SETTINGS = [
  { key: 'platform_name', value: 'BookiChat' },
  { key: 'support_email', value: 'soporte@bookichat.com' },
  { key: 'registration_enabled', value: 'true' },
  { key: 'default_timezone', value: 'America/Bogota' },
  { key: 'default_currency', value: 'COP' },
  { key: 'whatsapp_verify_token', value: 'bookichat_wa_verify_2026' },
  { key: 'maintenance_mode', value: 'false' },
  { key: 'trial_duration_days', value: '15' },
  { key: 'trial_reservation_limit', value: '20' },
];

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscription: SubscriptionService,
    private readonly subscriptionPlans: SubscriptionPlanService,
    private readonly reservations: ReservationsService,
  ) {}

  async getStats() {
    const [
      hotelsTotal,
      hotelsActive,
      usersTotal,
      reservationsTotal,
      conversationsTotal,
      knowledgeDocsTotal,
      integrations,
    ] = await Promise.all([
      this.prisma.hotel.count(),
      this.prisma.hotel.count({ where: { isActive: true } }),
      this.prisma.adminUser.count(),
      this.prisma.reservation.count(),
      this.prisma.conversationSession.count(),
      this.prisma.knowledgeDocument.count(),
      this.prisma.hotelIntegration.findMany({
        select: {
          pmsConnected: true,
          paymentConnected: true,
          whatsappConnected: true,
        },
      }),
    ]);

    const connected = integrations.reduce(
      (acc, i) => ({
        pms: acc.pms + (i.pmsConnected ? 1 : 0),
        payment: acc.payment + (i.paymentConnected ? 1 : 0),
        whatsapp: acc.whatsapp + (i.whatsappConnected ? 1 : 0),
      }),
      { pms: 0, payment: 0, whatsapp: 0 },
    );

    return {
      hotels: { total: hotelsTotal, active: hotelsActive },
      users: { total: usersTotal },
      reservations: { total: reservationsTotal },
      conversations: { total: conversationsTotal },
      knowledge_documents: { total: knowledgeDocsTotal },
      integrations: {
        pms_connected: connected.pms,
        payment_connected: connected.payment,
        whatsapp_connected: connected.whatsapp,
      },
    };
  }

  async listHotels() {
    const hotels = await this.prisma.hotel.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        integration: true,
        subscription: { include: { plan: true } },
        _count: {
          select: {
            users: true,
            knowledge: true,
            reservations: true,
            conversations: true,
          },
        },
      },
    });

    const usageByHotel = await Promise.all(
      hotels.map(async (h) => ({
        id: h.id,
        usage: await this.subscription.getUsageSnapshot(h.id),
      })),
    );
    const usageMap = Object.fromEntries(
      usageByHotel.map((u) => [u.id, u.usage]),
    );

    return hotels.map((h) => ({
      id: h.id,
      name: h.name,
      slug: h.slug,
      timezone: h.timezone,
      currency: h.currency,
      is_active: h.isActive,
      whatsapp_phone_number_id: h.whatsappPhoneNumberId,
      created_at: h.createdAt,
      integration: h.integration
        ? {
            pms_provider: h.integration.pmsProvider,
            pms_connected: h.integration.pmsConnected,
            payment_provider: h.integration.paymentProvider,
            payment_connected: h.integration.paymentConnected,
            whatsapp_connected: h.integration.whatsappConnected,
          }
        : null,
      subscription: usageMap[h.id] ?? null,
      counts: {
        users: h._count.users,
        knowledge: h._count.knowledge,
        reservations: h._count.reservations,
        conversations: h._count.conversations,
      },
    }));
  }

  async getHotel(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        integration: true,
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            knowledge: true,
            reservations: true,
            conversations: true,
            credentials: true,
          },
        },
      },
    });

    if (!hotel) throw new NotFoundException('Hotel no encontrado');

    return {
      id: hotel.id,
      name: hotel.name,
      slug: hotel.slug,
      timezone: hotel.timezone,
      currency: hotel.currency,
      is_active: hotel.isActive,
      whatsapp_phone_number_id: hotel.whatsappPhoneNumberId,
      created_at: hotel.createdAt,
      updated_at: hotel.updatedAt,
      integration: hotel.integration,
      users: hotel.users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        created_at: u.createdAt,
      })),
      counts: hotel._count,
    };
  }

  async updateHotel(
    hotelId: string,
    data: {
      name?: string;
      timezone?: string;
      currency?: string;
      is_active?: boolean;
    },
  ) {
    await this.getHotel(hotelId);

    const updated = await this.prisma.hotel.update({
      where: { id: hotelId },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.timezone !== undefined && { timezone: data.timezone.trim() }),
        ...(data.currency !== undefined && { currency: data.currency.trim() }),
        ...(data.is_active !== undefined && { isActive: data.is_active }),
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      timezone: updated.timezone,
      currency: updated.currency,
      is_active: updated.isActive,
    };
  }

  async listUsers() {
    const users = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        hotel: { select: { id: true, name: true, slug: true, isActive: true } },
      },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      created_at: u.createdAt,
      hotel: {
        id: u.hotel.id,
        name: u.hotel.name,
        slug: u.hotel.slug,
        is_active: u.hotel.isActive,
      },
    }));
  }

  async updateUser(
    userId: string,
    data: { name?: string; role?: string },
  ) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('Usuario no encontrados');

    const allowedRoles = ['owner', 'admin', 'staff'];
    if (data.role && !allowedRoles.includes(data.role)) {
      throw new BadRequestException('Rol inválido');
    }

    const updated = await this.prisma.adminUser.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.role !== undefined && { role: data.role }),
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
    };
  }

  async listPlatformAdmins() {
    const admins = await this.prisma.platformAdmin.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return admins.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      is_active: a.isActive,
      created_at: a.createdAt,
    }));
  }

  async createPlatformAdmin(data: {
    email: string;
    password: string;
    name: string;
  }) {
    const email = data.email.trim().toLowerCase();

    const existing = await this.prisma.platformAdmin.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Este email ya es super administrador');
    }

    const hotelUser = await this.prisma.adminUser.findUnique({
      where: { email },
    });
    if (hotelUser) {
      // Same email can exist as hotel owner — platform admin is separate
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const admin = await this.prisma.platformAdmin.create({
      data: {
        email,
        passwordHash,
        name: data.name.trim(),
      },
    });

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      is_active: admin.isActive,
    };
  }

  async updatePlatformAdmin(
    adminId: string,
    data: { name?: string; is_active?: boolean; password?: string },
  ) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: adminId },
    });
    if (!admin) throw new NotFoundException('Super admin no encontrado');

    const updateData: {
      name?: string;
      isActive?: boolean;
      passwordHash?: string;
    } = {};

    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.is_active !== undefined) updateData.isActive = data.is_active;
    if (data.password?.trim()) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }

    const updated = await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: updateData,
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      is_active: updated.isActive,
    };
  }

  async getSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.platformSetting.findMany({
      orderBy: { key: 'asc' },
    });

    if (!rows.length) {
      await this.ensureDefaultSettings();
      return this.getSettings();
    }

    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async updateSettings(settings: Record<string, string>) {
    const allowedKeys = new Set(DEFAULT_SETTINGS.map((s) => s.key));

    for (const [key, value] of Object.entries(settings)) {
      if (!allowedKeys.has(key)) {
        throw new BadRequestException(`Configuración no permitida: ${key}`);
      }
      await this.prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }

    return this.getSettings();
  }

  async ensureDefaultSettings() {
    for (const setting of DEFAULT_SETTINGS) {
      await this.prisma.platformSetting.upsert({
        where: { key: setting.key },
        create: setting,
        update: {},
      });
    }
  }

  async bootstrapSuperAdmin(email: string, password: string, name: string) {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.platformAdmin.findUnique({
      where: { email: normalized },
    });

    if (existing) return existing;

    const passwordHash = await bcrypt.hash(password, 12);
    return this.prisma.platformAdmin.create({
      data: {
        email: normalized,
        passwordHash,
        name: name.trim(),
      },
    });
  }

  listSubscriptionPlans(includeInactive = true) {
    return this.subscriptionPlans.listPlans(includeInactive);
  }

  createSubscriptionPlan(data: {
    name: string;
    max_reservations_per_month: number;
    price_monthly: number;
    currency?: string;
    description?: string;
    sort_order?: number;
  }) {
    return this.subscriptionPlans.createPlan(data);
  }

  updateSubscriptionPlan(
    id: string,
    data: {
      name?: string;
      max_reservations_per_month?: number;
      price_monthly?: number;
      currency?: string;
      description?: string;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.subscriptionPlans.updatePlan(id, data);
  }

  getHotelSubscription(hotelId: string) {
    return this.subscription.getUsageSnapshot(hotelId);
  }

  assignHotelPlan(hotelId: string, planId: string | null) {
    return this.subscription.assignPlanToHotel(hotelId, planId);
  }

  resetHotelTrial(hotelId: string) {
    return this.subscription.resetTrialForHotel(hotelId);
  }

  listHotelReservations(
    hotelId: string,
    filters: {
      outcome?: ReservationOutcome;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.reservations.listForHotel(hotelId, filters);
  }

  getHotelReservationStats(
    hotelId: string,
    filters: { from?: string; to?: string },
  ) {
    return this.reservations.getStatsForHotel(hotelId, filters);
  }
}
