import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getPmsAdapter } from '@hotel-bot/pms-adapters';
import type {
  AvailabilityQuery,
  AvailabilityResult,
  PmsCredentials,
  PmsProvider,
  RoomHoldRequest,
  RoomHoldResult,
  ConfirmReservationRequest,
} from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class CoreIntegratorService {
  private readonly logger = new Logger(CoreIntegratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async getAvailability(
    hotelId: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResult> {
    const credentials = await this.getPmsCredentials(hotelId);
    const adapter = getPmsAdapter(credentials.provider);
    return adapter.getAvailability(credentials, query);
  }

  async holdRoom(
    hotelId: string,
    request: RoomHoldRequest,
  ): Promise<RoomHoldResult> {
    const credentials = await this.getPmsCredentials(hotelId);
    const adapter = getPmsAdapter(credentials.provider);
    return adapter.holdRoom(credentials, request);
  }

  async confirmReservation(
    hotelId: string,
    request: ConfirmReservationRequest,
  ): Promise<{ reservation_id: string; confirmation_code?: string }> {
    const credentials = await this.getPmsCredentials(hotelId);
    const adapter = getPmsAdapter(credentials.provider);
    return adapter.confirmReservation(credentials, request);
  }

  async releaseHold(hotelId: string, pmsReservationId: string): Promise<void> {
    const credentials = await this.getPmsCredentials(hotelId);
    const adapter = getPmsAdapter(credentials.provider);
    await adapter.releaseHold(credentials, pmsReservationId);
  }

  async validatePmsCredentials(hotelId: string): Promise<boolean> {
    try {
      const credentials = await this.getPmsCredentials(hotelId);
      const adapter = getPmsAdapter(credentials.provider);
      const valid = await adapter.validateCredentials(credentials);

      await this.prisma.hotelIntegration.update({
        where: { hotelId },
        data: {
          pmsConnected: valid,
          lastValidatedAt: new Date(),
        },
      });

      return valid;
    } catch {
      await this.prisma.hotelIntegration.update({
        where: { hotelId },
        data: { pmsConnected: false, lastValidatedAt: new Date() },
      });
      return false;
    }
  }

  private async getPmsCredentials(hotelId: string): Promise<PmsCredentials & { provider: PmsProvider }> {
    const integration = await this.prisma.hotelIntegration.findUnique({
      where: { hotelId },
    });

    if (!integration?.pmsProvider) {
      throw new NotFoundException('PMS not configured for this hotel');
    }

    const creds = await this.prisma.encryptedCredential.findMany({
      where: {
        hotelId,
        credentialType: { startsWith: 'pms_' },
      },
    });

    const decrypted: Record<string, string> = {};
    for (const cred of creds) {
      const key = cred.credentialType.replace('pms_', '');
      decrypted[key] = this.crypto.decrypt(cred.encryptedValue);
    }

    return {
      provider: integration.pmsProvider as PmsProvider,
      api_key: decrypted.api_key,
      api_secret: decrypted.api_secret,
      property_id: integration.pmsPropertyId ?? decrypted.property_id,
      base_url: decrypted.base_url,
    };
  }
}
