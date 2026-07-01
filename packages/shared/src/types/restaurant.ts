export type RestaurantOccasion =
  | 'birthday'
  | 'anniversary'
  | 'romantic_dinner'
  | 'business'
  | 'celebration'
  | 'other';

export const RESTAURANT_OCCASIONS: RestaurantOccasion[] = [
  'birthday',
  'anniversary',
  'romantic_dinner',
  'business',
  'celebration',
  'other',
];

export const RESTAURANT_OCCASION_LABELS: Record<RestaurantOccasion, string> = {
  birthday: 'Cumpleaños',
  anniversary: 'Aniversario',
  romantic_dinner: 'Cena romántica',
  business: 'Negocios',
  celebration: 'Celebración',
  other: 'Otro',
};

export type ServiceHoursDay = {
  open: string;
  close: string;
  closed?: boolean;
};

export type ServiceHoursMap = Record<string, ServiceHoursDay>;

export const DEFAULT_SERVICE_HOURS: ServiceHoursMap = {
  mon: { open: '12:00', close: '22:00' },
  tue: { open: '12:00', close: '22:00' },
  wed: { open: '12:00', close: '22:00' },
  thu: { open: '12:00', close: '22:00' },
  fri: { open: '12:00', close: '23:00' },
  sat: { open: '12:00', close: '23:00' },
  sun: { open: '12:00', close: '21:00' },
};

export const SERVICE_HOURS_DAY_ORDER = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

export const SERVICE_HOURS_DAY_LABELS: Record<string, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
};

export interface RestaurantAddOnSelection {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface RestaurantQuote {
  reservation_fee: number;
  price_per_guest: number;
  party_size: number;
  addons_total: number;
  total: number;
  currency: string;
  rate_label?: string | null;
}
