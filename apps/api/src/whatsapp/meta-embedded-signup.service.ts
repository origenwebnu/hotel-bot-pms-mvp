import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

export interface EmbeddedSignupCompletionInput {
  code: string;
  phone_number_id: string;
  waba_id: string;
  event: string;
}

export interface EmbeddedSignupCompletionResult {
  access_token: string;
  phone_number_id: string;
  waba_id: string;
  display_phone: string | null;
  coexistence: boolean;
  is_on_biz_app: boolean | null;
  sync_initiated: boolean;
}

@Injectable()
export class MetaEmbeddedSignupService {
  private readonly logger = new Logger(MetaEmbeddedSignupService.name);

  getPublicConfig() {
    const appId = process.env.META_APP_ID?.trim() || null;
    const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null;
    return {
      enabled: Boolean(appId && configId),
      app_id: appId,
      config_id: configId,
      api_version: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
    };
  }

  async completeOnboarding(
    input: EmbeddedSignupCompletionInput,
  ): Promise<EmbeddedSignupCompletionResult> {
    const appId = process.env.META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      throw new InternalServerErrorException(
        'Embedded Signup no está configurado en la plataforma (META_APP_ID / META_APP_SECRET).',
      );
    }

    const phoneNumberId = input.phone_number_id?.trim();
    const wabaId = input.waba_id?.trim();
    const code = input.code?.trim();

    if (!code) throw new BadRequestException('Falta el código de autorización de Meta.');
    if (!phoneNumberId) throw new BadRequestException('Falta el Phone Number ID.');
    if (!wabaId) throw new BadRequestException('Falta el WABA ID.');

    const coexistence = this.isCoexistenceEvent(input.event);
    const accessToken = await this.exchangeCodeForToken(appId, appSecret, code);

    await this.subscribeWaba(wabaId, accessToken);

    if (!coexistence) {
      await this.registerPhoneNumber(phoneNumberId, accessToken);
    }

    const phoneMeta = await this.fetchPhoneMetadata(phoneNumberId, accessToken);
    const displayPhone = phoneMeta.display_phone_number?.replace(/\D/g, '') || null;
    const isOnBizApp = phoneMeta.is_on_biz_app ?? null;

    let syncInitiated = false;
    if (coexistence) {
      syncInitiated = await this.initiateCoexistenceSync(phoneNumberId, accessToken);
    }

    return {
      access_token: accessToken,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      display_phone: displayPhone,
      coexistence,
      is_on_biz_app: isOnBizApp,
      sync_initiated: syncInitiated,
    };
  }

  isCoexistenceEvent(event: string): boolean {
    return event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
  }

  private apiVersion(): string {
    return process.env.WHATSAPP_API_VERSION ?? 'v21.0';
  }

  private async exchangeCodeForToken(
    appId: string,
    appSecret: string,
    code: string,
  ): Promise<string> {
    const version = this.apiVersion();
    const url = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);

    const response = await fetch(url);
    const data = (await response.json()) as {
      access_token?: string;
      error?: { message?: string; code?: number };
    };

    if (!response.ok || !data.access_token) {
      this.logger.error(`Token exchange failed: ${JSON.stringify(data)}`);
      throw new BadRequestException(
        data.error?.message ??
          'No se pudo intercambiar el código de Meta. Vuelve a intentar el flujo de conexión.',
      );
    }

    return data.access_token;
  }

  private async subscribeWaba(wabaId: string, accessToken: string): Promise<void> {
    const version = this.apiVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      this.logger.warn(`WABA subscribe failed for ${wabaId}: ${JSON.stringify(data)}`);
      throw new BadRequestException(
        'No se pudo suscribir la cuenta de WhatsApp a BookiChat. Verifica permisos en Meta.',
      );
    }
  }

  private async registerPhoneNumber(phoneNumberId: string, accessToken: string): Promise<void> {
    const version = this.apiVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/register`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          pin: '123456',
        }),
      },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      this.logger.warn(`Phone register failed for ${phoneNumberId}: ${JSON.stringify(data)}`);
    }
  }

  private async fetchPhoneMetadata(phoneNumberId: string, accessToken: string) {
    const version = this.apiVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,is_on_biz_app,platform_type`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = (await response.json()) as {
      display_phone_number?: string;
      is_on_biz_app?: boolean;
      platform_type?: string;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new BadRequestException(
        data.error?.message ?? 'No se pudo verificar el número en Meta.',
      );
    }

    return data;
  }

  private async initiateCoexistenceSync(
    phoneNumberId: string,
    accessToken: string,
  ): Promise<boolean> {
    const version = this.apiVersion();
    const baseUrl = `https://graph.facebook.com/${version}/${phoneNumberId}/smb_app_data`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const contacts = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          sync_type: 'smb_app_state_sync',
        }),
      });
      const history = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          sync_type: 'history',
        }),
      });

      if (!contacts.ok || !history.ok) {
        this.logger.warn(
          `Coexistence sync partial failure contacts=${contacts.status} history=${history.status}`,
        );
        return contacts.ok || history.ok;
      }

      return true;
    } catch (error) {
      this.logger.warn(`Coexistence sync error: ${error}`);
      return false;
    }
  }
}
