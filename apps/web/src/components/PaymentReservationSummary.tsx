'use client';

import {
  buildPaymentSummaryRows,
  type PaymentReceiptContext,
} from '@hotel-bot/shared';

interface Props {
  context: PaymentReceiptContext;
  children?: React.ReactNode;
  variant?: 'checkout' | 'receipt';
}

export function PaymentReservationSummary({
  context,
  children,
  variant = 'checkout',
}: Props) {
  const rows = buildPaymentSummaryRows(context);
  const itemClass = variant === 'receipt' ? 'line' : 'row';

  return (
    <div className={`payment-summary ${variant}`}>
      {rows.map((row) => (
        <div key={row.label} className={itemClass}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
      {children}
      <style jsx>{`
        .payment-summary.checkout {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
          background: #f8fafc;
        }
        .payment-summary.receipt {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .row,
        .line {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          font-size: 0.92rem;
        }
        .row span,
        .line span {
          color: #64748b;
        }
        .row strong,
        .line strong {
          color: #0f172a;
          text-align: right;
        }
        .payment-summary :global(.total) {
          border-top: 1px dashed #cbd5e1;
          padding-top: 0.75rem;
          display: flex;
          justify-content: space-between;
          font-size: 1.05rem;
        }
        .payment-summary.receipt :global(.total) {
          font-size: inherit;
        }
        .payment-summary :global(.total span) {
          color: #64748b;
        }
        .payment-summary :global(.total strong) {
          color: #0f172a;
        }
      `}</style>
    </div>
  );
}
