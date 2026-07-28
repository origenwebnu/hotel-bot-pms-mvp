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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { filterValidMediaUrls } from '@hotel-bot/shared';

@Controller('hotels/me/inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: { user: { hotelId: string } }) {
    const rooms = await this.prisma.roomType.findMany({
      where: { hotelId: req.user.hotelId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rooms.map((r) => this.format(r));
  }

  @Post()
  async create(
    @Req() req: { user: { hotelId: string } },
    @Body()
    body: {
      name: string;
      description?: string;
      price_per_night: number;
      currency?: string;
      max_occupancy?: number;
      total_units?: number;
      photo_urls?: string[];
    },
  ) {
    const room = await this.prisma.roomType.create({
      data: {
        hotelId: req.user.hotelId,
        name: body.name.trim(),
        description: body.description?.trim(),
        pricePerNight: body.price_per_night,
        currency: body.currency ?? 'COP',
        maxOccupancy: body.max_occupancy ?? 2,
        totalUnits: body.total_units ?? 1,
        photoUrls: filterValidMediaUrls(body.photo_urls ?? []),
      },
    });
    return this.format(room);
  }

  @Put(':id')
  async update(
    @Req() req: { user: { hotelId: string } },
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      price_per_night?: number;
      currency?: string;
      max_occupancy?: number;
      total_units?: number;
      photo_urls?: string[];
      is_active?: boolean;
      sort_order?: number;
    },
  ) {
    const existing = await this.prisma.roomType.findFirst({
      where: { id, hotelId: req.user.hotelId },
    });
    if (!existing) throw new NotFoundException('Habitación no encontrada');

    const room = await this.prisma.roomType.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && {
          description: body.description.trim(),
        }),
        ...(body.price_per_night !== undefined && {
          pricePerNight: body.price_per_night,
        }),
        ...(body.currency !== undefined && { currency: body.currency }),
        ...(body.max_occupancy !== undefined && {
          maxOccupancy: body.max_occupancy,
        }),
        ...(body.total_units !== undefined && { totalUnits: body.total_units }),
        ...(body.photo_urls !== undefined && {
          photoUrls: filterValidMediaUrls(body.photo_urls),
        }),
        ...(body.is_active !== undefined && { isActive: body.is_active }),
        ...(body.sort_order !== undefined && { sortOrder: body.sort_order }),
      },
    });
    return this.format(room);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: { hotelId: string } },
    @Param('id') id: string,
  ) {
    await this.prisma.roomType.deleteMany({
      where: { id, hotelId: req.user.hotelId },
    });
    return { ok: true };
  }

  @Post('seed-demo')
  async seedDemo(@Req() req: { user: { hotelId: string } }) {
    const hotelId = req.user.hotelId;
    const existing = await this.prisma.roomType.count({ where: { hotelId } });
    if (existing > 0) {
      return { message: 'Ya tienes habitaciones. Elimínalas primero si quieres recargar el demo.' };
    }

    await this.prisma.hotelIntegration.upsert({
      where: { hotelId },
      create: { hotelId, pmsProvider: 'local', pmsConnected: true },
      update: { pmsProvider: 'local', pmsConnected: true },
    });

    const demoRooms = [
      {
        name: 'Habitación Estándar',
        description:
          'Cama doble, baño privado, WiFi y desayuno incluido. Ideal para parejas o viajeros de negocios.',
        pricePerNight: 180000,
        maxOccupancy: 2,
        totalUnits: 3,
        photoUrls: [
          'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800',
          'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800',
        ],
        sortOrder: 1,
      },
      {
        name: 'Suite Junior',
        description:
          'Espaciosa suite con sala de estar, minibar y vista panorámica. Perfecta para una escapada especial.',
        pricePerNight: 320000,
        maxOccupancy: 3,
        totalUnits: 2,
        photoUrls: [
          'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
          'https://images.unsplash.com/photo-1595576501378-9a664eb0a187?w=800',
          'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800',
        ],
        sortOrder: 2,
      },
      {
        name: 'Familiar Triple',
        description:
          'Tres camas, ideal para familias. Incluye zona de juegos infantil en el hotel.',
        pricePerNight: 250000,
        maxOccupancy: 4,
        totalUnits: 2,
        photoUrls: [
          'https://images.unsplash.com/photo-1598928506311-c55ded91a962?w=800',
          'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800',
        ],
        sortOrder: 3,
      },
    ];

    for (const room of demoRooms) {
      await this.prisma.roomType.create({
        data: { hotelId, currency: 'COP', ...room },
      });
    }

    return {
      message: 'Hotel demo listo: PMS local activado y 3 tipos de habitación creados.',
      rooms_created: demoRooms.length,
    };
  }

  private format(r: {
    id: string;
    name: string;
    description: string | null;
    pricePerNight: number;
    currency: string;
    maxOccupancy: number;
    totalUnits: number;
    photoUrls: string[];
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      price_per_night: r.pricePerNight,
      currency: r.currency,
      max_occupancy: r.maxOccupancy,
      total_units: r.totalUnits,
      photo_urls: r.photoUrls,
      is_active: r.isActive,
      sort_order: r.sortOrder,
      created_at: r.createdAt,
    };
  }
}
