export interface DiscountTierRange {
  id: string;
  minTotal: number;
  maxTotal: number | null;
  discountPercent: number;
  isActive?: boolean;
}

export interface SessionDiscountOffer {
  tierId: string;
  percent: number;
  expiresAt: string;
  originalTotal: number;
  discountedTotal: number;
  roomTypeId: string;
  currency: string;
}
