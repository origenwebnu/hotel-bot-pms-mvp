export type BusinessVertical = 'hotel' | 'restaurant' | 'service' | 'product';

export const BUSINESS_VERTICALS: BusinessVertical[] = [
  'hotel',
  'restaurant',
  'service',
  'product',
];

export const BUSINESS_VERTICAL_LABELS: Record<BusinessVertical, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurante',
  service: 'Servicios',
  product: 'Productos',
};

export const BUSINESS_VERTICAL_DESCRIPTIONS: Record<BusinessVertical, string> = {
  hotel: 'Reservas de habitaciones y atención a huéspedes',
  restaurant: 'Reservas de mesa y atención a comensales',
  service: 'Citas, consultas y agendamiento de servicios',
  product: 'Catálogo, ventas y atención por WhatsApp',
};

export function isBusinessVertical(value: string): value is BusinessVertical {
  return BUSINESS_VERTICALS.includes(value as BusinessVertical);
}

/** Hotel booking flow (rooms, PMS, inventory) — vertical hotel without info-only. */
export function supportsHotelBooking(
  vertical: BusinessVertical,
  infoOnlyMode: boolean,
): boolean {
  return vertical === 'hotel' && !infoOnlyMode;
}

/** Any transactional flow (reservations, orders, appointments). Phase 0: only hotel. */
export function supportsTransactionalFlow(
  vertical: BusinessVertical,
  infoOnlyMode: boolean,
): boolean {
  return supportsHotelBooking(vertical, infoOnlyMode);
}

export function businessNameLabel(vertical: BusinessVertical): string {
  switch (vertical) {
    case 'hotel':
      return 'Nombre del hotel';
    case 'restaurant':
      return 'Nombre del restaurante';
    case 'service':
      return 'Nombre de tu negocio o consultorio';
    case 'product':
      return 'Nombre de tu tienda o marca';
    default:
      return 'Nombre del negocio';
  }
}
