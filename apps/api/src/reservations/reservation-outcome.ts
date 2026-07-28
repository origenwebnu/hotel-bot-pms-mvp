export type ReservationOutcome = 'approved' | 'rejected' | 'pending';

const REJECTED_STATUSES = new Set(['expired', 'cancelled', 'rejected']);
const REJECTED_PAYMENT_STATUSES = new Set(['declined', 'error', 'voided']);

export function getReservationOutcome(
  status: string,
  paymentStatus?: string | null,
): ReservationOutcome {
  if (status === 'confirmed') return 'approved';
  if (REJECTED_STATUSES.has(status)) return 'rejected';
  if (paymentStatus && REJECTED_PAYMENT_STATUSES.has(paymentStatus.toLowerCase())) {
    return 'rejected';
  }
  return 'pending';
}

export function buildOutcomeFilter(outcome: ReservationOutcome) {
  if (outcome === 'approved') {
    return { status: 'confirmed' };
  }
  if (outcome === 'rejected') {
    return {
      OR: [
        { status: { in: ['expired', 'cancelled', 'rejected'] } },
        { paymentStatus: { in: ['declined', 'error', 'VOIDED', 'voided'] } },
      ],
    };
  }
  return {
    AND: [
      { status: { not: 'confirmed' } },
      { status: { notIn: ['expired', 'cancelled', 'rejected'] } },
      {
        OR: [
          { paymentStatus: null },
          { paymentStatus: { notIn: ['declined', 'error', 'VOIDED', 'voided'] } },
        ],
      },
    ],
  };
}
