import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

export const PLATFORM_CREDENTIAL_TYPES = {
  MERCADOPAGO_ACCESS_TOKEN: 'mercadopago_access_token',
  MERCADOPAGO_PUBLIC_KEY: 'mercadopago_public_key',
} as const;

@Injectable()
export class PlatformCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async getCredential(type: string): Promise<string | null> {
    const row = await this.prisma.platformCredential.findUnique({
      where: { credentialType: type },
    });
    if (!row) return null;
    try {
      return this.crypto.decrypt(row.encryptedValue);
    } catch {
      return null;
    }
  }

  async upsertCredential(type: string, value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      await this.prisma.platformCredential.deleteMany({ where: { credentialType: type } });
      return;
    }

    await this.prisma.platformCredential.upsert({
      where: { credentialType: type },
      create: {
        credentialType: type,
        encryptedValue: this.crypto.encrypt(trimmed),
        keyHint: this.buildHint(trimmed),
      },
      update: {
        encryptedValue: this.crypto.encrypt(trimmed),
        keyHint: this.buildHint(trimmed),
      },
    });
  }

  async getBillingConfigStatus() {
    const rows = await this.prisma.platformCredential.findMany({
      where: {
        credentialType: {
          in: [
            PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_ACCESS_TOKEN,
            PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_PUBLIC_KEY,
          ],
        },
      },
    });

    const byType = new Map(rows.map((r) => [r.credentialType, r]));
    const access = byType.get(PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_ACCESS_TOKEN);
    const publicKey = byType.get(PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_PUBLIC_KEY);

    return {
      provider: 'mercadopago' as const,
      configured: Boolean(access),
      has_access_token: Boolean(access),
      has_public_key: Boolean(publicKey),
      access_token_hint: access?.keyHint ?? null,
      public_key_hint: publicKey?.keyHint ?? null,
      webhook_url: this.buildWebhookUrl(),
    };
  }

  buildWebhookUrl() {
    const appUrl = (process.env.APP_URL ?? 'https://app.bookichat.com').replace(/\/$/, '');
    return `${appUrl}/api/webhooks/mercadopago/subscriptions`;
  }

  private buildHint(value: string) {
    if (value.length <= 8) return '****';
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
}
