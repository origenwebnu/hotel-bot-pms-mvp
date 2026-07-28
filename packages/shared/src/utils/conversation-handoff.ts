import { DEFAULT_SERVICE_HOURS, type ServiceHoursDay, type ServiceHoursMap } from '../types/restaurant';

export const HUMAN_HANDOFF_STATE = 'human_handoff' as const;

export function wantsHumanHandoff(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    /\b(asesor|humano|persona|agente|operador|recepcion|recepcionista)\b/.test(normalized) ||
    /\b(hablar|hablo|comunicar|contactar)\s+(con\s+)?(alguien|una\s+persona|el\s+equipo|el\s+restaurante|el\s+hotel|un\s+humano)\b/.test(
      normalized,
    ) ||
    /\b(necesito|quiero)\s+(un\s+)?(asesor|humano|persona)\b/.test(normalized)
  );
}

export function wantsReservationLookup(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    /\b(mi\s+reserva|mis\s+reservas|consultar\s+reserva|ver\s+reserva|estado\s+de\s+mi\s+reserva)\b/.test(
      normalized,
    ) ||
    /\b(tengo\s+una\s+reserva|ya\s+reserv[eé])\b/.test(normalized)
  );
}

export function wantsMainMenu(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    normalized === 'menu' ||
    normalized === 'inicio' ||
    /\b(volver al menu|volver al inicio|empezar de nuevo|menu principal|reiniciar chat)\b/.test(
      normalized,
    )
  );
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() ?? 'mon';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const weekdayMap: Record<string, string> = {
    sun: 'sun',
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
  };
  const key = Object.entries(weekdayMap).find(([abbr]) => weekday.startsWith(abbr))?.[1] ?? 'mon';
  return { dayKey: key, time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` };
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function isWithinServiceHoursNow(
  timezone: string,
  hours: ServiceHoursMap | null | undefined,
): boolean {
  const map = { ...DEFAULT_SERVICE_HOURS, ...(hours ?? {}) };
  const { dayKey, time } = getZonedParts(new Date(), timezone);
  const cfg: ServiceHoursDay = map[dayKey] ?? DEFAULT_SERVICE_HOURS.mon;
  if (cfg.closed) return false;
  const nowMin = timeToMinutes(time);
  const openMin = timeToMinutes(cfg.open);
  const closeMin = timeToMinutes(cfg.close);
  if (closeMin <= openMin) {
    return nowMin >= openMin || nowMin < closeMin;
  }
  return nowMin >= openMin && nowMin < closeMin;
}

export function formatServiceHoursSummary(hours: ServiceHoursMap | null | undefined): string {
  const map = { ...DEFAULT_SERVICE_HOURS, ...(hours ?? {}) };
  const mon = map.mon;
  if (!mon || mon.closed) return 'consulta nuestros horarios';
  return `Lun–Dom ${mon.open} – ${mon.close}`;
}
