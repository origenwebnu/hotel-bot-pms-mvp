import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('hotels/me/discount-tiers')
@UseGuards(JwtAuthGuard)
export class DiscountTiersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: { user: { hotelId: string } }) {
    const tiers = await this.prisma.hotelDiscountTier.findMany({
      where: { hotelId: req.user.hotelId },
      orderBy: [{ sortOrder: 'asc' }, { minTotal: 'asc' }],
    });
    return tiers.map((tier) => this.format(tier));
  }

  @Post()
  async create(
    @Req() req: { user: { hotelId: string } },
    @Body()
    body: {
      min_total: number;
      max_total?: number | null;
      discount_percent: number;
      sort_order?: number;
    },
  ) {
    this.validateTierInput(body.min_total, body.max_total, body.discount_percent);

    const tier = await this.prisma.hotelDiscountTier.create({
      data: {
        hotelId: req.user.hotelId,
        minTotal: body.min_total,
        maxTotal: body.max_total ?? null,
        discountPercent: body.discount_percent,
        sortOrder: body.sort_order ?? 0,
      },
    });
    return this.format(tier);
  }

  @Put(':id')
  async update(
    @Req() req: { user: { hotelId: string } },
    @Param('id') id: string,
    @Body()
    body: {
      min_total?: number;
      max_total?: number | null;
      discount_percent?: number;
      is_active?: boolean;
      sort_order?: number;
    },
  ) {
    const existing = await this.prisma.hotelDiscountTier.findFirst({
      where: { id, hotelId: req.user.hotelId },
    });
    if (!existing) throw new NotFoundException('Rango de descuento no encontrado');

    const minTotal = body.min_total ?? existing.minTotal;
    const maxTotal =
      body.max_total !== undefined ? body.max_total : existing.maxTotal;
    const discountPercent = body.discount_percent ?? existing.discountPercent;
    this.validateTierInput(minTotal, maxTotal, discountPercent);

    const tier = await this.prisma.hotelDiscountTier.update({
      where: { id },
      data: {
        ...(body.min_total !== undefined && { minTotal: body.min_total }),
        ...(body.max_total !== undefined && { maxTotal: body.max_total }),
        ...(body.discount_percent !== undefined && {
          discountPercent: body.discount_percent,
        }),
        ...(body.is_active !== undefined && { isActive: body.is_active }),
        ...(body.sort_order !== undefined && { sortOrder: body.sort_order }),
      },
    });
    return this.format(tier);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: { hotelId: string } },
    @Param('id') id: string,
  ) {
    await this.prisma.hotelDiscountTier.deleteMany({
      where: { id, hotelId: req.user.hotelId },
    });
    return { ok: true };
  }

  @Post('seed-default')
  async seedDefault(@Req() req: { user: { hotelId: string } }) {
    const hotelId = req.user.hotelId;
    const existing = await this.prisma.hotelDiscountTier.count({ where: { hotelId } });
    if (existing > 0) {
      return {
        message: 'Ya tienes rangos de descuento configurados.',
      };
    }

    const defaults = [
      { minTotal: 0, maxTotal: 500000, discountPercent: 5, sortOrder: 1 },
      { minTotal: 500001, maxTotal: 1000000, discountPercent: 10, sortOrder: 2 },
      { minTotal: 1000001, maxTotal: null, discountPercent: 15, sortOrder: 3 },
    ];

    for (const tier of defaults) {
      await this.prisma.hotelDiscountTier.create({
        data: { hotelId, ...tier },
      });
    }

    return {
      message: 'Rangos de descuento de ejemplo creados (5%, 10% y 15%).',
      tiers_created: defaults.length,
    };
  }

  private validateTierInput(
    minTotal: number,
    maxTotal: number | null | undefined,
    discountPercent: number,
  ) {
    if (minTotal < 0) {
      throw new BadRequestException('El mínimo del rango debe ser 0 o mayor');
    }
    if (maxTotal != null && maxTotal < minTotal) {
      throw new BadRequestException('El máximo debe ser mayor o igual al mínimo');
    }
    if (discountPercent <= 0 || discountPercent > 100) {
      throw new BadRequestException('El descuento debe estar entre 1 y 100');
    }
  }

  private format(tier: {
    id: string;
    minTotal: number;
    maxTotal: number | null;
    discountPercent: number;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
  }) {
    return {
      id: tier.id,
      min_total: tier.minTotal,
      max_total: tier.maxTotal,
      discount_percent: tier.discountPercent,
      is_active: tier.isActive,
      sort_order: tier.sortOrder,
      created_at: tier.createdAt,
    };
  }
}
