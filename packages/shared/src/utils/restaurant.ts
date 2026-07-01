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

function parseLocalDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export function getEffectiveServiceHours(
  hours: ServiceHoursMap | null | undefined,
): ServiceHoursMap {
  return { ...DEFAULT_SERVICE_HOURS, ...(hours ?? {}) };
}

export function getServiceHoursForDate(
  dateStr: string,
  hours: ServiceHoursMap | null | undefined,
): { open: string; close: string; closed: boolean } {
  const map = getEffectiveServiceHours(hours);
  const { year, month, day } = parseLocalDateParts(dateStr);
  const weekday = new Date(year, month - 1, day).getDay();
  const key = DAY_KEYS[weekday];
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

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function normalizeDateText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseWeekdayDate(text: string): string | undefined {
  const normalized = normalizeDateText(text);
  const wantsNext = /\b(proximo|proxima|siguiente|que viene|que vienen)\b/.test(normalized);

  const match = normalized.match(
    /\b(?:para\s+el|para\s+la|el|la|este|esta|proximo|proxima|siguiente)?\s*(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/,
  );
  if (!match) return undefined;

  const targetDow = WEEKDAYS[match[1]];
  if (targetDow === undefined) return undefined;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let daysAhead = (targetDow - today.getDay() + 7) % 7;
  if (wantsNext && daysAhead === 0) daysAhead = 7;

  const result = new Date(today);
  result.setDate(today.getDate() + daysAhead);
  return formatIsoDate(result.getFullYear(), result.getMonth() + 1, result.getDate());
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

  const weekdayDate = parseWeekdayDate(trimmed);
  if (weekdayDate) return weekdayDate;

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

function formatTime24(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse party size from natural language (Spanish). */
export function parsePartySizeFromText(text: string): number | undefined {
  const paraMatch = text.match(
    /(?:para|de|somos|seremos|con)\s+(\d+)(?:\s*(?:personas?|pax|comensales?))?/i,
  );
  if (paraMatch) {
    const n = parseInt(paraMatch[1], 10);
    if (n > 0 && n < 100) return n;
  }
  const match = text.match(/(\d+)\s*(?:personas?|pax|comensales?)/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n > 0 && n < 100) return n;
  }
  if (/pareja/i.test(text)) return 2;
  return undefined;
}

/** Parse a booking time from natural language (Spanish). Returns HH:MM (24h). */
export function parseRestaurantBookingTime(text: string): string | undefined {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/^\d+\s*(personas?|pax|comensales?)$/i.test(text.trim())) return undefined;

  const night = normalized.match(
    /(?:a\s+las?\s+|hora\s+)?(\d{1,2})(?::([0-5]\d))?\s*(?:de\s+la\s+noche|\s*pm|\s*p\.?\s*m\.?)/,
  );
  if (night) {
    let h = parseInt(night[1], 10);
    const m = parseInt(night[2] ?? '0', 10);
    if (h < 12) h += 12;
    if (h <= 23 && m <= 59) return formatTime24(h, m);
  }

  const afternoon = normalized.match(
    /(?:a\s+las?\s+)?(\d{1,2})(?::([0-5]\d))?\s*de\s+la\s+tarde/,
  );
  if (afternoon) {
    let h = parseInt(afternoon[1], 10);
    const m = parseInt(afternoon[2] ?? '0', 10);
    if (h >= 1 && h <= 11) h += 12;
    if (h <= 23 && m <= 59) return formatTime24(h, m);
  }

  const morning = normalized.match(
    /(?:a\s+las?\s+)?(\d{1,2})(?::([0-5]\d))?\s*(?:de\s+la\s+manana|\s*am|\s*a\.?\s*m\.?)/,
  );
  if (morning) {
    let h = parseInt(morning[1], 10);
    const m = parseInt(morning[2] ?? '0', 10);
    if (h === 12) h = 0;
    if (h <= 23 && m <= 59) return formatTime24(h, m);
  }

  const h24 = normalized.match(/\b([01]?\d|2[0-3])[:h.]([0-5]\d)\b/);
  if (h24) {
    return formatTime24(parseInt(h24[1], 10), parseInt(h24[2], 10));
  }

  const compactPm = normalized.match(/\b(\d{1,2})(?::([0-5]\d))?\s*pm\b/);
  if (compactPm) {
    let h = parseInt(compactPm[1], 10);
    const m = parseInt(compactPm[2] ?? '0', 10);
    if (h < 12) h += 12;
    return formatTime24(h, m);
  }

  const compactAm = normalized.match(/\b(\d{1,2})(?::([0-5]\d))?\s*am\b/);
  if (compactAm) {
    let h = parseInt(compactAm[1], 10);
    const m = parseInt(compactAm[2] ?? '0', 10);
    if (h === 12) h = 0;
    return formatTime24(h, m);
  }

  const aLas = normalized.match(
    /(?:a\s+las?\s+|hora\s+)(\d{1,2})(?::([0-5]\d))?(?!\s*(?:de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|personas?|pax))/,
  );
  if (aLas) {
    let h = parseInt(aLas[1], 10);
    const m = parseInt(aLas[2] ?? '0', 10);
    if (h >= 1 && h <= 9) h += 12;
    if (h <= 23 && m <= 59) return formatTime24(h, m);
  }

  return undefined;
}

/** Match requested time to an available slot (exact or nearest within 15 min). */
export function matchTimeToAvailableSlot(
  requested: string,
  slots: string[],
): { slot: string | null; snapped: boolean } {
  if (!slots.length) return { slot: null, snapped: false };
  if (slots.includes(requested)) return { slot: requested, snapped: false };

  const reqMin = timeToMinutes(requested);
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const s of slots) {
    const diff = Math.abs(timeToMinutes(s) - reqMin);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  if (best && bestDiff <= 15) {
    return { slot: best, snapped: bestDiff > 0 };
  }
  return { slot: null, snapped: false };
}

export interface RestaurantBookingIntent {
  date?: string;
  time?: string;
  partySize?: number;
}

/** Extract date, time and party size from a single message. */
export function parseRestaurantBookingIntent(text: string): RestaurantBookingIntent {
  return {
    date: parseRestaurantBookingDate(text),
    time: parseRestaurantBookingTime(text),
    partySize: parsePartySizeFromText(text),
  };
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
