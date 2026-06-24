import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

export interface WhatsAppHotelCredentials {
  phoneNumberId: string;
  accessToken: string;
}

@Injectable()
export class WhatsAppCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async resolve(hotelId: string): Promise<WhatsAppHotelCredentials> {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { whatsappPhoneNumberId: true },
    });

    const cred = await this.prisma.encryptedCredential.findUnique({
      where: {
        hotelId_credentialType: {
          hotelId,
          credentialType: 'whatsapp_access_token',
        },
      },
    });

    const phoneNumberId =
      hotel?.whatsappPhoneNumberId?.trim() ||
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
      '';

    const accessToken = cred
      ? this.crypto.decrypt(cred.encryptedValue)
      : process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '';

    return { phoneNumberId, accessToken };
  }

  async hasOwnToken(hotelId: string): Promise<boolean> {
    const cred = await this.prisma.encryptedCredential.findUnique({
      where: {
        hotelId_credentialType: {
          hotelId,
          credentialType: 'whatsapp_access_token',
        },
      },
    });
    return Boolean(cred);
  }
}
