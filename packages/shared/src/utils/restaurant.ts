import {
  DEFAULT_SERVICE_HOURS,
  type RestaurantAddOnSelection,
  type RestaurantQuote,
  type ServiceHoursMap,
} from '../types/restaurant';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function parseGuestCountryCode(whatsappPhone: string): string {
  const digits = whatsappPhone.replace(/\D/g, '');
  const prefixes: Array<{ prefix: string; code: string }> = [
    { prefix: '57', code: '+57' },
    { prefix: '52', code: '+52' },
    { prefix: '54', code: '+54' },
    { prefix: '56', code: '+56' },
    { prefix: '51', code: '+51' },
    { prefix: '593', code: '+593' },
    { prefix: '58', code: '+58' },
    { prefix: '1', code: '+1' },
    { prefix: '34', code: '+34' },
  ];
  for (const { prefix, code } of prefixes.sort((a, b) => b.prefix.length - a.prefix.length)) {
    if (digits.startsWith(prefix)) return code;
  }
  return '+';
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateTimeSlots(
  open: string,
  close: string,
  intervalMinutes: number,
  durationMinutes: number,
): string[] {
  const start = timeToMinutes(open);
  const end = timeToMinutes(close);
  const lastStart = end - durationMinutes;
  const slots: string[] = [];
  for (let t = start; t <= lastStart; t += intervalMinutes) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

export function getServiceHoursForDate(
  dateStr: string,
  hours: ServiceHoursMap | null | undefined,
): { open: string; close: string; closed: boolean } {
  const map = hours ?? DEFAULT_SERVICE_HOURS;
  const day = new Date(`${dateStr}T12:00:00`);
  const key = DAY_KEYS[day.getDay()];
  const cfg = map[key] ?? DEFAULT_SERVICE_HOURS[key];
  if (cfg.closed) return { open: '00:00', close: '00:00', closed: true };
  return { open: cfg.open, close: cfg.close, closed: false };
}

export interface DateServiceHoursOverride {
  closed?: boolean;
  open_time_override?: string | null;
  close_time_override?: string | null;
}

/** Weekday defaults plus optional per-date open/close overrides from the calendar. */
export function resolveServiceHoursForDate(
  dateStr: string,
  hours: ServiceHoursMap | null | undefined,
  dateOverride?: DateServiceHoursOverride | null,
): { open: string; close: string; closed: boolean } {
  if (dateOverride?.closed) {
    return { open: '00:00', close: '00:00', closed: true };
  }

  const base = getServiceHoursForDate(dateStr, hours);
  if (base.closed) return base;

  return {
    open: dateOverride?.open_time_override?.trim() || base.open,
    close: dateOverride?.close_time_override?.trim() || base.close,
    closed: false,
  };
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function inferYear(month: number, day: number): number {
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    year += 1;
  }
  return year;
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parse a single booking date from natural language (Spanish). */
export function parseRestaurantBookingDate(text: string): string | undefined {
  const trimmed = text.trim();

  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (iso) return iso[1];

  if (/^hoy$/i.test(trimmed)) {
    const now = new Date();
    return formatIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  if (/^ma[nñ]ana$/i.test(trimmed)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  const spanish = trimmed.match(
    /(?:el\s+)?(\d{1,2})(?:\s+de\s+|\s+)([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/i,
  );
  if (spanish) {
    const day = parseInt(spanish[1], 10);
    const month = MONTHS[spanish[2].toLowerCase()];
    if (month) {
      const year = spanish[3] ? parseInt(spanish[3], 10) : inferYear(month, day);
      return formatIsoDate(year, month, day);
    }
  }

  return undefined;
}

export function buildRestaurantQuote(input: {
  partySize: number;
  reservationFee: number;
  pricePerGuest: number;
  currency: string;
  addons: RestaurantAddOnSelection[];
  rateLabel?: string | null;
}): RestaurantQuote {
  const addonsTotal = input.addons.reduce((sum, a) => sum + a.price * a.quantity, 0);
  const guestTotal = input.partySize * input.pricePerGuest;
  const total = input.reservationFee + guestTotal + addonsTotal;
  return {
    reservation_fee: input.reservationFee,
    price_per_guest: input.pricePerGuest,
    party_size: input.partySize,
    addons_total: addonsTotal,
    total,
    currency: input.currency,
    rate_label: input.rateLabel ?? null,
  };
}
