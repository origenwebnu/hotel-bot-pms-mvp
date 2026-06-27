export const META_LINKS = {
  businessSuite: 'https://business.facebook.com/',
  whatsappManager: 'https://business.facebook.com/wa/manage/home/',
  developersApps: 'https://developers.facebook.com/apps/',
  whatsAppApiDocs:
    'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
} as const;

export const WIZARD_STEPS = [
  { id: 'prerequisites', label: 'Requisitos' },
  { id: 'phone-id', label: 'Phone Number ID' },
  { id: 'token', label: 'Access Token' },
  { id: 'display-phone', label: 'Número público' },
  { id: 'validate', label: 'Probar conexión' },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

export function validatePhoneNumberId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Ingresa el Phone Number ID';
  if (!/^\d{5,20}$/.test(trimmed)) {
    return 'Debe ser numérico (5–20 dígitos). Lo encuentras en Meta → WhatsApp → API';
  }
  return null;
}

export function validateAccessToken(value: string, hasStoredToken: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed && hasStoredToken) return null;
  if (!trimmed) return 'Ingresa el Access Token permanente';
  if (trimmed.length < 20) return 'El token parece demasiado corto';
  return null;
}

export function validateDisplayPhone(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, '');
  if (!trimmed) return null;
  if (!/^\d{10,15}$/.test(trimmed)) {
    return 'Formato internacional sin + (ej: 573001234567)';
  }
  return null;
}
