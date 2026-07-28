export type EmbeddedSignupSessionEvent =
  | 'FINISH'
  | 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
  | 'FINISH_ONLY_WABA'
  | 'ERROR'
  | string;

export interface EmbeddedSignupSessionData {
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
}

export interface EmbeddedSignupMessage {
  type: 'WA_EMBEDDED_SIGNUP';
  event: EmbeddedSignupSessionEvent;
  data?: EmbeddedSignupSessionData;
}

export interface FacebookLoginResponse {
  authResponse?: { code?: string };
  status?: string;
}

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: {
        appId: string;
        autoLogAppEvents?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void;
    };
  }
}

const SDK_SCRIPT_ID = 'facebook-jssdk';

export function loadFacebookSdk(appId: string, apiVersion: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }

    const existing = document.getElementById(SDK_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: apiVersion,
      });
      resolve();
    };

    const script = document.createElement('script');
    script.id = SDK_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/es_ES/sdk.js';
    script.onerror = () => reject(new Error('No se pudo cargar el SDK de Meta'));
    document.body.appendChild(script);
  });
}

export function parseEmbeddedSignupMessage(raw: unknown): EmbeddedSignupMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as EmbeddedSignupMessage;
    if (parsed?.type === 'WA_EMBEDDED_SIGNUP') return parsed;
  } catch {
    return null;
  }
  return null;
}

export function isEmbeddedSignupFinishEvent(event: string): boolean {
  return (
    event === 'FINISH' ||
    event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ||
    event === 'FINISH_ONLY_WABA'
  );
}

export function launchCoexistenceSignup(
  configId: string,
  onCode: (code: string) => void,
  onError: (message: string) => void,
): void {
  if (!window.FB) {
    onError('El SDK de Meta no está listo. Recarga la página e intenta de nuevo.');
    return;
  }

  window.FB.login(
    (response) => {
      const code = response.authResponse?.code;
      if (code) {
        onCode(code);
        return;
      }
      if (response.status === 'not_authorized') {
        onError('Cancelaste la conexión con Meta.');
        return;
      }
      onError('No se recibió el código de autorización. Intenta de nuevo.');
    },
    {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: 'whatsapp_business_app_onboarding',
        sessionInfoVersion: '3',
      },
    },
  );
}

export function launchStandardEmbeddedSignup(
  configId: string,
  onCode: (code: string) => void,
  onError: (message: string) => void,
): void {
  if (!window.FB) {
    onError('El SDK de Meta no está listo. Recarga la página e intenta de nuevo.');
    return;
  }

  window.FB.login(
    (response) => {
      const code = response.authResponse?.code;
      if (code) {
        onCode(code);
        return;
      }
      if (response.status === 'not_authorized') {
        onError('Cancelaste la conexión con Meta.');
        return;
      }
      onError('No se recibió el código de autorización. Intenta de nuevo.');
    },
    {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        sessionInfoVersion: '3',
      },
    },
  );
}
