const DEFAULT_APP_URL = 'https://app.bookichat.com';

export function buildRoomGalleryUrl(
  roomId: string,
  token: string,
  appUrl = DEFAULT_APP_URL,
): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}/rooms/${roomId}/gallery?token=${encodeURIComponent(token)}`;
}

export function buildWhatsAppDeepLink(displayPhone: string, message?: string): string {
  const phone = displayPhone.replace(/\D/g, '');
  if (!message?.trim()) {
    return `https://wa.me/${phone}`;
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`;
}
