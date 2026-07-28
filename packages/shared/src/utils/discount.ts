import type { DiscountTierRange } from '../types/discount';

export function countNights(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  return Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

export function findApplicableDiscountTier(
  total: number,
  tiers: DiscountTierRange[],
): DiscountTierRange | null {
  const active = tiers.filter((tier) => tier.isActive !== false);
  const matches = active.filter(
    (tier) =>
      total >= tier.minTotal &&
      (tier.maxTotal == null || total <= tier.maxTotal),
  );

  if (matches.length === 0) return null;

  return matches.reduce((best, tier) =>
    tier.discountPercent > best.discountPercent ? tier : best,
  );
}

export function applyDiscountPercent(total: number, percent: number): number {
  return Math.round(total * (1 - percent / 100));
}

export function formatDiscountRangeLabel(
  minTotal: number,
  maxTotal: number | null,
  currency = 'COP',
): string {
  const fmt = (n: number) => `${currency} ${n.toLocaleString('es-CO')}`;
  if (maxTotal == null) {
    return `Desde ${fmt(minTotal)}`;
  }
  return `${fmt(minTotal)} – ${fmt(maxTotal)}`;
}
