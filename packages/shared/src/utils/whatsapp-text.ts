export function sanitizeWhatsAppText(text: string, maxLength = 1024): string {
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function normalizeRoomLabel(text: string): string {
  return sanitizeWhatsAppText(text, 256).toLowerCase();
}

export function isValidMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return /^https?:\/\/.+/i.test(trimmed);
}

export function filterValidMediaUrls(urls: string[]): string[] {
  return urls.map((url) => url.trim()).filter(isValidMediaUrl);
}

/** Normalizes user text for menu/reset command matching in WhatsApp bots. */
export function normalizeWhatsAppCommand(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wantsWhatsAppSessionReset(text: string): boolean {
  const normalized = normalizeWhatsAppCommand(text);
  if (!normalized) return false;

  const exact = new Set([
    'menu',
    'inicio',
    'cancelar',
    'reiniciar',
    'empezar',
    'volver',
    'salir',
    'hola',
    'buenas',
    'hey',
    'reiniciar chat',
    'volver al menu',
    'volver al inicio',
    'empezar de nuevo',
    'cancelar todo',
    'menu principal',
  ]);
  if (exact.has(normalized)) return true;

  const firstWord = normalized.split(' ')[0] ?? '';
  if (
    ['menu', 'inicio', 'cancelar', 'reiniciar', 'hola', 'buenas', 'volver', 'salir', 'empezar'].includes(
      firstWord,
    )
  ) {
    return true;
  }

  return /\b(volver al menu|volver al inicio|empezar de nuevo|menu principal|reiniciar chat)\b/.test(
    normalized,
  );
}
