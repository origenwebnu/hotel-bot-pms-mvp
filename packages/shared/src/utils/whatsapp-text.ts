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
