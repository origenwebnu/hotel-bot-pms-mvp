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

  async resolveDisplayPhone(hotelId: string): Promise<string | null> {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { whatsappDisplayPhone: true },
    });

    const stored = hotel?.whatsappDisplayPhone?.replace(/\D/g, '').trim();
    if (stored) return stored;

    const envDefault = process.env.DEFAULT_WHATSAPP_DISPLAY_PHONE?.replace(/\D/g, '').trim();
    if (envDefault) return envDefault;

    const { phoneNumberId, accessToken } = await this.resolve(hotelId);
    if (!phoneNumberId || !accessToken) return null;

    const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) return null;

    try {
      const data = (await response.json()) as { display_phone_number?: string };
      const fetched = data.display_phone_number?.replace(/\D/g, '').trim();
      if (!fetched) return null;

      await this.prisma.hotel.update({
        where: { id: hotelId },
        data: { whatsappDisplayPhone: fetched },
      });

      return fetched;
    } catch {
      return null;
    }
  }
}
