const BRAND = {
  primary: '#0e0244',
  secondary: '#5f42d1',
  bg: '#f4effe',
  surface: '#ffffff',
  accentSoft: '#bcc2fd',
  textMuted: '#5c5478',
  border: 'rgba(14, 2, 68, 0.08)',
} as const;

function appBaseUrl(): string {
  return (process.env.APP_URL ?? 'https://app.bookichat.com').replace(/\/$/, '');
}

function logoUrl(): string {
  return `${appBaseUrl()}/brand/logo-full-light.svg`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px">
      <tr>
        <td align="center" style="border-radius:12px;background:${BRAND.secondary}">
          <a href="${safeHref}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:14px 28px;font-family:Rubik,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px">
            ${safeLabel}
          </a>
        </td>
      </tr>
    </table>`;
}

function emailCodeBlock(code: string): string {
  const digits = code.split('').map((digit) =>
    `<td align="center" style="width:44px;height:52px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:10px;font-family:Rubik,Arial,sans-serif;font-size:26px;font-weight:700;color:${BRAND.primary};letter-spacing:0">${escapeHtml(digit)}</td>`,
  ).join(`<td style="width:8px"></td>`);

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto">
      <tr>${digits}</tr>
    </table>`;
}

interface EmailLayoutOptions {
  preheader?: string;
  title: string;
  bodyHtml: string;
}

export function renderBrandedEmail(options: EmailLayoutOptions): string {
  const { preheader, title, bodyHtml } = options;
  const safeTitle = escapeHtml(title);
  const logo = logoUrl();
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${safeTitle}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.surface};border-radius:20px;border:1px solid ${BRAND.border};overflow:hidden;box-shadow:0 16px 40px rgba(14,2,68,0.08)">
          <tr>
            <td style="height:6px;background:linear-gradient(90deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%);font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:36px 32px 12px;text-align:center">
              <img src="${logo}" width="180" height="34" alt="BookiChat"
                   style="display:block;margin:0 auto;max-width:180px;height:auto;border:0">
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;font-family:Rubik,Arial,sans-serif;color:${BRAND.primary}">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;font-weight:700;color:${BRAND.primary};text-align:center">
                ${safeTitle}
              </h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.border};background:${BRAND.bg};text-align:center">
              <p style="margin:0 0 6px;font-family:Rubik,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.primary}">
                BookiChat
              </p>
              <p style="margin:0;font-family:Rubik,Arial,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.textMuted}">
                Aplicativo de gestión por WhatsApp - Hecho con amor por Origen Web<br>
                © ${year} BookiChat
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderRegistrationCodeEmail(hotelName: string, code: string): string {
  return renderBrandedEmail({
    preheader: `Tu código de verificación es ${code}`,
    title: 'Verifica tu email',
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        Confirma el registro de <strong style="color:${BRAND.primary}">${escapeHtml(hotelName)}</strong> con este código:
      </p>
      ${emailCodeBlock(code)}
      <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        Expira en <strong style="color:${BRAND.primary}">15 minutos</strong>.
      </p>
      <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${BRAND.textMuted};text-align:center">
        Si no solicitaste este registro, puedes ignorar este correo.
      </p>`,
  });
}

export function renderTrialQuotaEmail(hotelName: string, reservationLimit: number, dashboard: string): string {
  return renderBrandedEmail({
    preheader: 'Tu periodo de prueba llegó al límite de reservas',
    title: 'Periodo de prueba agotado',
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        El hotel <strong style="color:${BRAND.primary}">${escapeHtml(hotelName)}</strong> alcanzó las
        <strong style="color:${BRAND.primary}">${reservationLimit}</strong> reservas incluidas en la prueba.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        Elige un plan para seguir recibiendo reservas por WhatsApp.
      </p>
      ${emailButton(dashboard, 'Ir al panel')}`,
  });
}

export function renderTrialExpiredEmail(
  hotelName: string,
  reasonText: string,
  dashboard: string,
): string {
  return renderBrandedEmail({
    preheader: 'Tu periodo de prueba terminó',
    title: 'Tu prueba terminó',
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        ${escapeHtml(reasonText)}
      </p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        El hotel <strong style="color:${BRAND.primary}">${escapeHtml(hotelName)}</strong> necesita un plan activo para continuar.
      </p>
      ${emailButton(dashboard, 'Elegir plan')}`,
  });
}

export function renderMonthlyQuotaEmail(
  hotelName: string,
  planName: string,
  limit: number,
  dashboard: string,
): string {
  return renderBrandedEmail({
    preheader: 'Alcanzaste el límite mensual de reservas',
    title: 'Límite mensual alcanzado',
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        El hotel <strong style="color:${BRAND.primary}">${escapeHtml(hotelName)}</strong> consumió las
        <strong style="color:${BRAND.primary}">${limit}</strong> reservas del plan
        <strong style="color:${BRAND.primary}">${escapeHtml(planName)}</strong> este mes.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        Actualiza a un plan superior para reactivar las reservas por WhatsApp.
      </p>
      ${emailButton(dashboard, 'Actualizar plan')}`,
  });
}

function receiptRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:8px 0;font-size:14px;color:${BRAND.textMuted};border-bottom:1px solid ${BRAND.border}">${escapeHtml(label)}</td>
      <td style="padding:8px 0;font-size:14px;font-weight:600;color:${BRAND.primary};text-align:right;border-bottom:1px solid ${BRAND.border}">${escapeHtml(value)}</td>
    </tr>`;
}

export function renderRestaurantReservationNotificationEmail(data: {
  restaurantName: string;
  guestName: string;
  guestPhone?: string | null;
  dateLabel: string;
  time: string;
  partySize: number;
  zoneName: string;
  occasionLabel?: string | null;
  totalLabel: string;
  specialRequests?: string | null;
  receiptUrl?: string | null;
}): string {
  const rows = [
    receiptRow('Cliente', data.guestName),
    ...(data.guestPhone ? [receiptRow('WhatsApp', data.guestPhone)] : []),
    receiptRow('Fecha', data.dateLabel),
    receiptRow('Hora', data.time),
    receiptRow('Personas', String(data.partySize)),
    receiptRow('Zona', data.zoneName),
    ...(data.occasionLabel ? [receiptRow('Motivo', data.occasionLabel)] : []),
    ...(data.specialRequests?.trim()
      ? [receiptRow('Petición especial', data.specialRequests.trim())]
      : []),
    receiptRow('Total', data.totalLabel),
  ].join('');

  const receiptButton = data.receiptUrl
    ? emailButton(data.receiptUrl, 'Ver recibo completo')
    : '';

  return renderBrandedEmail({
    preheader: `Nueva reserva de ${data.guestName}`,
    title: 'Nueva reserva recibida',
    bodyHtml: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.textMuted};text-align:center">
        Tienes una nueva reserva en <strong style="color:${BRAND.primary}">${escapeHtml(data.restaurantName)}</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px">
        ${rows}
      </table>
      ${receiptButton}
      <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${BRAND.textMuted};text-align:center">
        Notificación automática de BookiChat.
      </p>`,
  });
}
