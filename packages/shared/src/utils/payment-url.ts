const DEFAULT_APP_URL = 'https://app.bookichat.com';

export function buildPaymentPageUrl(
  reservationId: string,
  token: string,
  appUrl = DEFAULT_APP_URL,
): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}/payment/${reservationId}?token=${encodeURIComponent(token)}`;
}

export function buildPaymentResultUrl(
  reservationId: string,
  token: string,
  appUrl = DEFAULT_APP_URL,
): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}/payment/result/${reservationId}?token=${encodeURIComponent(token)}`;
}

export function buildWompiWebhookUrl(appUrl = DEFAULT_APP_URL): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}/api/webhooks/wompi`;
}
