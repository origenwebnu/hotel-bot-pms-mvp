import { Injectable } from '@nestjs/common';
import {
  applyDiscountPercent,
  findApplicableDiscountTier,
  type DiscountTierRange,
} from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DiscountTierService {
  constructor(private readonly prisma: PrismaService) {}

  async listForHotel(hotelId: string) {
    return this.prisma.hotelDiscountTier.findMany({
      where: { hotelId },
      orderBy: [{ sortOrder: 'asc' }, { minTotal: 'asc' }],
    });
  }

  async findApplicableTier(hotelId: string, total: number) {
    const tiers = await this.listForHotel(hotelId);
    const active = tiers.filter((tier) => tier.isActive);
    return findApplicableDiscountTier(
      total,
      active.map((tier) => this.toRange(tier)),
    );
  }

  calculateDiscountedTotal(total: number, percent: number): number {
    return applyDiscountPercent(total, percent);
  }

  toRange(tier: {
    id: string;
    minTotal: number;
    maxTotal: number | null;
    discountPercent: number;
    isActive?: boolean;
  }): DiscountTierRange {
    return {
      id: tier.id,
      minTotal: tier.minTotal,
      maxTotal: tier.maxTotal,
      discountPercent: tier.discountPercent,
      isActive: tier.isActive,
    };
  }
}
