import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { CoreIntegratorService } from '../core-integrator/core-integrator.service';

@Injectable()
export class HotelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly pms: CoreIntegratorService,
  ) {}

  async getHotel(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { integration: true },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  async updateIntegration(
    hotelId: string,
    data: {
      pms_provider?: string;
      pms_property_id?: string;
      payment_provider?: string;
      pms_api_key?: string;
      pms_api_secret?: string;
      payment_public_key?: string;
      payment_private_key?: string;
      payment_webhook_secret?: string;
    },
  ) {
    await this.prisma.hotelIntegration.upsert({
      where: { hotelId },
      create: {
        hotelId,
        pmsProvider: data.pms_provider,
        pmsPropertyId: data.pms_property_id,
        paymentProvider: data.payment_provider,
      },
      update: {
        pmsProvider: data.pms_provider,
        pmsPropertyId: data.pms_property_id,
        paymentProvider: data.payment_provider,
      },
    });

    const credentialUpdates: Array<{ type: string; value?: string }> = [
      { type: 'pms_api_key', value: data.pms_api_key },
      { type: 'pms_api_secret', value: data.pms_api_secret },
      { type: 'payment_public_key', value: data.payment_public_key },
      { type: 'payment_private_key', value: data.payment_private_key },
      { type: 'payment_webhook_secret', value: data.payment_webhook_secret },
    ];

    for (const { type, value } of credentialUpdates) {
      if (value) {
        await this.prisma.encryptedCredential.upsert({
          where: { hotelId_credentialType: { hotelId, credentialType: type } },
          create: {
            hotelId,
            credentialType: type,
            encryptedValue: this.crypto.encrypt(value),
          },
          update: { encryptedValue: this.crypto.encrypt(value) },
        });
      }
    }

    let pmsConnected = false;
    let paymentConnected = false;

    if (data.pms_provider && data.pms_api_key) {
      pmsConnected = await this.pms.validatePmsCredentials(hotelId);
    }

    if (data.payment_provider && data.payment_private_key) {
      paymentConnected = true;
    }

    return this.prisma.hotelIntegration.update({
      where: { hotelId },
      data: {
        pmsConnected,
        paymentConnected,
        lastValidatedAt: new Date(),
      },
    });
  }

  async getIntegrationStatus(hotelId: string) {
    const integration = await this.prisma.hotelIntegration.findUnique({
      where: { hotelId },
    });
    if (!integration) throw new NotFoundException('Integration not found');

    return {
      pms_provider: integration.pmsProvider,
      pms_connected: integration.pmsConnected,
      payment_provider: integration.paymentProvider,
      payment_connected: integration.paymentConnected,
      last_validated_at: integration.lastValidatedAt,
    };
  }
}
