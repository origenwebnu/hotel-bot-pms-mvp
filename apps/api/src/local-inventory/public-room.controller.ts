import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  buildWhatsAppDeepLink,
  filterValidMediaUrls,
  sanitizeWhatsAppText,
} from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { verifyGalleryToken } from '../utils/gallery-token';

@Controller('public/rooms')
export class PublicRoomController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async getRoomGallery(
    @Param('id') id: string,
    @Query('token') token?: string,
  ) {
    if (!token) {
      throw new UnauthorizedException('Token de galería requerido');
    }

    const payload = verifyGalleryToken(token);
    if (!payload || payload.roomId !== id) {
      throw new NotFoundException('Galería no encontrada');
    }

    const room = await this.prisma.roomType.findFirst({
      where: { id, hotelId: payload.hotelId, isActive: true },
      include: {
        hotel: {
          select: {
            name: true,
            slug: true,
            whatsappDisplayPhone: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Habitación no encontrada');
    }

    const session = await this.prisma.conversationSession.findFirst({
      where: {
        id: payload.sessionId,
        hotelId: payload.hotelId,
      },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    const displayPhone =
      room.hotel.whatsappDisplayPhone?.trim() ||
      process.env.DEFAULT_WHATSAPP_DISPLAY_PHONE?.trim() ||
      null;

    const whatsappContinueUrl = displayPhone
      ? buildWhatsAppDeepLink(displayPhone, 'Continuar reserva')
      : null;

    return {
      room_id: room.id,
      hotel_name: room.hotel.name,
      hotel_slug: room.hotel.slug,
      name: sanitizeWhatsAppText(room.name, 120),
      description: room.description
        ? sanitizeWhatsAppText(room.description, 500)
        : null,
      price_per_night: room.pricePerNight,
      currency: room.currency,
      photo_urls: filterValidMediaUrls(room.photoUrls),
      check_in: session.checkIn,
      check_out: session.checkOut,
      adults: session.adults,
      whatsapp_continue_url: whatsappContinueUrl,
    };
  }
}
