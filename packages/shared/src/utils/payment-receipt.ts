import type { BusinessVertical } from '../types/business';
import { isBusinessVertical } from '../types/business';

export type PaymentSummaryRow = { label: string; value: string };

export interface PaymentReceiptContext {
  business_vertical?: string | null;
  booking_kind?: string | null;
  guest_name: string;
  room_name?: string | null;
  check_in_label?: string | null;
  check_out_label?: string | null;
  guests?: number | null;
  dining_zone_name?: string | null;
  booking_date_label?: string | null;
  booking_time?: string | null;
  party_size?: number | null;
  special_requests?: string | null;
}

function resolveVertical(
  businessVertical?: string | null,
  bookingKind?: string | null,
): BusinessVertical {
  if (bookingKind === 'restaurant_table') return 'restaurant';
  if (bookingKind === 'hotel_stay') return 'hotel';
  if (businessVertical && isBusinessVertical(businessVertical)) {
    return businessVertical;
  }
  return 'hotel';
}

export function buildPaymentSummaryRows(
  ctx: PaymentReceiptContext,
): PaymentSummaryRow[] {
  const vertical = resolveVertical(ctx.business_vertical, ctx.booking_kind);
  const rows: PaymentSummaryRow[] = [];

  rows.push({ label: 'Cliente', value: ctx.guest_name || '—' });

  if (vertical === 'restaurant') {
    if (ctx.booking_date_label) {
      rows.push({ label: 'Fecha', value: ctx.booking_date_label });
    }
    if (ctx.booking_time) {
      rows.push({ label: 'Hora', value: ctx.booking_time });
    }
    if (ctx.party_size != null && ctx.party_size > 0) {
      rows.push({
        label: 'Personas',
        value: String(ctx.party_size),
      });
    }
    if (ctx.dining_zone_name) {
      rows.push({ label: 'Mesa / zona', value: ctx.dining_zone_name });
    }
    if (ctx.special_requests?.trim()) {
      rows.push({ label: 'Petición especial', value: ctx.special_requests.trim() });
    }
    return rows;
  }

  if (vertical === 'hotel') {
    rows.push({
      label: 'Habitación',
      value: ctx.room_name?.trim() || '—',
    });
    const stay =
      ctx.check_in_label && ctx.check_out_label
        ? `${ctx.check_in_label} → ${ctx.check_out_label}`
        : ctx.check_in_label ?? ctx.check_out_label ?? '—';
    rows.push({ label: 'Estadía', value: stay });
    rows.push({
      label: 'Huéspedes',
      value: String(ctx.guests ?? 0),
    });
    return rows;
  }

  rows.push({ label: 'Servicio / producto', value: ctx.room_name?.trim() || '—' });
  if (ctx.booking_date_label || ctx.check_in_label) {
    rows.push({
      label: 'Fecha',
      value: ctx.booking_date_label ?? ctx.check_in_label ?? '—',
    });
  }
  if (ctx.booking_time) {
    rows.push({ label: 'Hora', value: ctx.booking_time });
  }
  return rows;
}

export function paymentCheckoutSubtitle(vertical: BusinessVertical): string {
  switch (vertical) {
    case 'restaurant':
      return 'Confirma tu reserva de mesa y continúa al formulario de pago';
    case 'service':
      return 'Confirma tu cita y continúa al formulario de pago';
    case 'product':
      return 'Confirma tu pedido y continúa al formulario de pago';
    default:
      return 'Confirma tu reserva y continúa al formulario de pago';
  }
}

export function paymentApprovedThanks(vertical: BusinessVertical): string {
  switch (vertical) {
    case 'restaurant':
      return '¡Gracias! Tu reserva de mesa está confirmada. También te enviamos el recibo por WhatsApp.';
    case 'service':
      return '¡Gracias! Tu cita está confirmada. También te enviamos el recibo por WhatsApp.';
    case 'product':
      return '¡Gracias! Tu pedido está confirmado. También te enviamos el recibo por WhatsApp.';
    default:
      return '¡Gracias! Tu reserva está confirmada. También te enviamos el recibo por WhatsApp.';
  }
}

export function paymentRecommendationsTitle(vertical: BusinessVertical): string {
  switch (vertical) {
    case 'restaurant':
      return 'Indicaciones para tu visita';
    case 'service':
      return 'Indicaciones para tu cita';
    case 'product':
      return 'Indicaciones para tu pedido';
    default:
      return 'Recomendaciones para tu estadía';
  }
}

export function paymentFailureHint(vertical: BusinessVertical): string {
  switch (vertical) {
    case 'restaurant':
      return 'El pago no se completó. Tu mesa puede seguir reservada por un tiempo limitado. Intenta de nuevo o usa otro método.';
    case 'service':
      return 'El pago no se completó. Tu cita puede seguir reservada por un tiempo limitado. Intenta de nuevo o usa otro método.';
    case 'product':
      return 'El pago no se completó. Tu pedido puede seguir pendiente por un tiempo limitado. Intenta de nuevo o usa otro método.';
    default:
      return 'El pago no se completó. Tu habitación puede seguir reservada por un tiempo limitado. Intenta de nuevo o usa otro método.';
  }
}

export function resolvePaymentVertical(
  businessVertical?: string | null,
  bookingKind?: string | null,
): BusinessVertical {
  return resolveVertical(businessVertical, bookingKind);
}
