const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Formato visible: 28-agosto-2026 */
export function formatDisplayDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const monthName = MONTH_NAMES[month - 1];

  if (!monthName) return isoDate;

  return `${day}-${monthName}-${year}`;
}

export function formatDisplayDateRange(
  checkIn: string,
  checkOut: string,
  separator = ' al ',
): string {
  return `${formatDisplayDate(checkIn)}${separator}${formatDisplayDate(checkOut)}`;
}
