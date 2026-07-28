import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(includeInactive = true) {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { maxReservationsPerMonth: 'asc' }],
    });
    return plans.map((p) => this.formatPlan(p));
  }

  async createPlan(data: {
    name: string;
    max_reservations_per_month: number;
    price_monthly: number;
    currency?: string;
    description?: string;
    sort_order?: number;
  }) {
    if (data.max_reservations_per_month < 1) {
      throw new BadRequestException('El límite de reservas debe ser al menos 1');
    }
    if (data.price_monthly < 0) {
      throw new BadRequestException('El precio no puede ser negativo');
    }

    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        name: data.name.trim(),
        maxReservationsPerMonth: data.max_reservations_per_month,
        priceMonthly: data.price_monthly,
        currency: data.currency ?? 'COP',
        description: data.description?.trim(),
        sortOrder: data.sort_order ?? 0,
      },
    });
    return this.formatPlan(plan);
  }

  async updatePlan(
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
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Plan no encontrado');

    const plan = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.max_reservations_per_month !== undefined && {
          maxReservationsPerMonth: data.max_reservations_per_month,
        }),
        ...(data.price_monthly !== undefined && {
          priceMonthly: data.price_monthly,
        }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.description !== undefined && {
          description: data.description.trim(),
        }),
        ...(data.sort_order !== undefined && { sortOrder: data.sort_order }),
        ...(data.is_active !== undefined && { isActive: data.is_active }),
      },
    });
    return this.formatPlan(plan);
  }

  private formatPlan(p: {
    id: string;
    name: string;
    maxReservationsPerMonth: number;
    priceMonthly: number;
    currency: string;
    description: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      name: p.name,
      max_reservations_per_month: p.maxReservationsPerMonth,
      price_monthly: p.priceMonthly,
      currency: p.currency,
      description: p.description,
      is_active: p.isActive,
      sort_order: p.sortOrder,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    };
  }
}
