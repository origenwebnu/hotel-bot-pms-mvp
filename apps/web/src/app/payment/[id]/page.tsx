'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import {
  paymentCheckoutSubtitle,
  resolvePaymentVertical,
} from '@hotel-bot/shared';
import { PaymentReservationSummary } from '@/components/PaymentReservationSummary';

type CheckoutData = {
  reservation_id: string;
  booking_kind?: string | null;
  business_vertical?: string | null;
  hotel_name: string;
  room_name: string | null;
  dining_zone_name?: string | null;
  booking_date_label?: string | null;
  booking_time?: string | null;
  party_size?: number | null;
  check_in_label: string | null;
  check_out_label: string | null;
  guests: number;
  amount: number | null;
  original_amount: number | null;
  discount_percent: number | null;
  currency: string | null;
  guest_name: string;
  guest_email: string | null;
  special_requests?: string | null;
  payment_provider: string;
  payment_provider_url: string | null;
  epayco_session_id: string | null;
  epayco_public_key: string | null;
  epayco_test_mode: boolean;
  hold_expires_at: string | null;
};

declare global {
  interface Window {
    ePayco?: {
      checkout: {
        configure: (opts: {
          sessionId: string;
          type?: string;
          test?: boolean;
        }) => {
          open: () => void;
          onCloseModal?: () => void;
        };
      };
    };
  }
}

function PaymentCheckoutContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const token = searchParams.get('token') ?? '';
  const [data, setData] = useState<CheckoutData | null>(null);
  const [error, setError] = useState('');
  const [epaycoReady, setEpaycoReady] = useState(false);
  const [openingCheckout, setOpeningCheckout] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Enlace de pago inválido.');
      return;
    }
    fetch(`/api/public/payments/${id}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('No se pudo cargar la reserva');
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, [id, token]);

  function openEpaycoCheckout() {
    if (!data?.epayco_session_id || !window.ePayco) return;
    setOpeningCheckout(true);
    try {
      const checkout = window.ePayco.checkout.configure({
        sessionId: data.epayco_session_id,
        type: 'onpage',
        test: data.epayco_test_mode,
      });
      checkout.onCloseModal = () => setOpeningCheckout(false);
      checkout.open();
    } catch {
      setOpeningCheckout(false);
      setError('No se pudo abrir el checkout de ePayco.');
    }
  }

  const isEpayco = data?.payment_provider === 'epayco';
  const isExternalCheckout =
    data?.payment_provider === 'wompi' ||
    data?.payment_provider === 'bold' ||
    data?.payment_provider === 'stripe';
  const providerHint =
    data?.payment_provider === 'bold'
      ? 'Bold'
      : data?.payment_provider === 'epayco'
        ? 'ePayco'
        : data?.payment_provider === 'stripe'
          ? 'Stripe'
          : 'Wompi';

  if (error) {
    return (
      <main className="page">
        <div className="card error">{error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <div className="card">Cargando pago...</div>
      </main>
    );
  }

  const vertical = resolvePaymentVertical(data.business_vertical, data.booking_kind);

  return (
    <main className="page">
      {isEpayco && (
        <Script
          src="https://checkout.epayco.co/checkout-v2.js"
          strategy="afterInteractive"
          onLoad={() => setEpaycoReady(true)}
        />
      )}

      <div className="card">
        <p className="eyebrow">BookiChat · Pago seguro</p>
        <h1>{data.hotel_name}</h1>
        <p className="subtitle">{paymentCheckoutSubtitle(vertical)}</p>

        <PaymentReservationSummary
          context={{
            business_vertical: data.business_vertical,
            booking_kind: data.booking_kind,
            guest_name: data.guest_name,
            room_name: data.room_name,
            check_in_label: data.check_in_label,
            check_out_label: data.check_out_label,
            guests: data.guests,
            dining_zone_name: data.dining_zone_name,
            booking_date_label: data.booking_date_label,
            booking_time: data.booking_time,
            party_size: data.party_size,
            special_requests: data.special_requests,
          }}
        >
          {data.discount_percent && data.original_amount ? (
            <div className="row">
              <span>Descuento</span>
              <strong>{data.discount_percent}%</strong>
            </div>
          ) : null}
          <div className="total">
            <span>Total a pagar</span>
            <strong>
              {data.currency} {(data.amount ?? 0).toLocaleString('es-CO')}
            </strong>
          </div>
        </PaymentReservationSummary>

        {isEpayco && data.epayco_session_id ? (
          <button
            type="button"
            className="pay-btn"
            disabled={!epaycoReady || openingCheckout}
            onClick={openEpaycoCheckout}
          >
            {openingCheckout
              ? 'Abriendo checkout...'
              : epaycoReady
                ? 'Pagar con ePayco'
                : 'Cargando checkout...'}
          </button>
        ) : isExternalCheckout && data.payment_provider_url ? (
          <a className="pay-btn" href={data.payment_provider_url}>
            Continuar al pago
          </a>
        ) : data.payment_provider_url ? (
          <a className="pay-btn" href={data.payment_provider_url}>
            Continuar al pago
          </a>
        ) : (
          <p className="warn">El negocio aún no tiene pagos configurados.</p>
        )}

        <p className="hint">
          {isEpayco
            ? 'Completa el pago con tarjeta, PSE u otros medios en el checkout seguro de ePayco. Al finalizar volverás aquí para ver tu recibo.'
            : `Serás redirigido a ${providerHint} para ingresar tu tarjeta o PSE. Al finalizar volverás aquí para ver tu recibo.`}
        </p>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #0f172a;
          display: flex;
          justify-content: center;
          padding: 1rem;
        }
        .card {
          width: 100%;
          max-width: 420px;
          background: #fff;
          color: #0f172a;
          border-radius: 16px;
          padding: 1.5rem;
          margin-top: 1rem;
        }
        .eyebrow {
          color: #475569;
          font-size: 0.8rem;
          margin-bottom: 0.25rem;
        }
        h1 {
          font-size: 1.4rem;
          margin-bottom: 0.25rem;
          color: #0f172a;
        }
        .subtitle {
          color: #475569;
          font-size: 0.9rem;
          margin-bottom: 1.25rem;
        }
        .summary {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
          background: #f8fafc;
        }
        .row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          font-size: 0.92rem;
        }
        .row span {
          color: #64748b;
        }
        .row strong {
          color: #0f172a;
          text-align: right;
        }
        .total {
          border-top: 1px dashed #cbd5e1;
          padding-top: 0.75rem;
          display: flex;
          justify-content: space-between;
          font-size: 1.05rem;
        }
        .total span {
          color: #64748b;
        }
        .total strong {
          color: #0f172a;
        }
        .pay-btn {
          display: block;
          width: 100%;
          text-align: center;
          background: #16a34a;
          color: #fff;
          padding: 0.95rem 1rem;
          border-radius: 12px;
          font-weight: 600;
          text-decoration: none;
          border: none;
          cursor: pointer;
          font-size: 1rem;
        }
        .pay-btn:disabled {
          opacity: 0.65;
          cursor: wait;
        }
        .hint,
        .warn {
          margin-top: 1rem;
          font-size: 0.82rem;
          color: #475569;
          line-height: 1.4;
        }
        .warn {
          color: #b45309;
        }
        .error {
          color: #b91c1c;
        }
      `}</style>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<main className="page"><div>Cargando...</div></main>}>
      <PaymentCheckoutContent />
    </Suspense>
  );
}
