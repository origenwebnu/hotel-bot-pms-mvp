export type DateRangePreset = 'this_month' | 'last_month' | 'last_30_days' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateRangeForPreset(preset: DateRangePreset): DateRange {
  const now = new Date();

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: formatDateInput(start), to: formatDateInput(now) };
  }

  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: formatDateInput(start), to: formatDateInput(end) };
  }

  if (preset === 'last_30_days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: formatDateInput(start), to: formatDateInput(now) };
  }

  return { from: formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: formatDateInput(now) };
}

export function formatDateRangeLabel(from: string, to: string): string {
  const fmt = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  return `${fmt(from)} — ${fmt(to)}`;
}
