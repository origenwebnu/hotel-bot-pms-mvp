'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type CheckoutData = {
  reservation_id: string;
  hotel_name: string;
  room_name: string | null;
  check_in_label: string | null;
  check_out_label: string | null;
  guests: number;
  amount: number | null;
  original_amount: number | null;
  discount_percent: number | null;
  currency: string | null;
  guest_name: string;
  guest_email: string | null;
  payment_provider_url: string | null;
  hold_expires_at: string | null;
};

function PaymentCheckoutContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const token = searchParams.get('token') ?? '';
  const [data, setData] = useState<CheckoutData | null>(null);
  const [error, setError] = useState('');

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

  return (
    <main className="page">
      <div className="card">
        <p className="eyebrow">BookiChat · Pago seguro</p>
        <h1>{data.hotel_name}</h1>
        <p className="subtitle">Confirma tu reserva y continúa al formulario de pago</p>

        <div className="summary">
          <div className="row">
            <span>Habitación</span>
            <strong>{data.room_name ?? '—'}</strong>
          </div>
          <div className="row">
            <span>Fechas</span>
            <strong>
              {data.check_in_label} → {data.check_out_label}
            </strong>
          </div>
          <div className="row">
            <span>Huéspedes</span>
            <strong>{data.guests}</strong>
          </div>
          <div className="row">
            <span>Cliente</span>
            <strong>{data.guest_name}</strong>
          </div>
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
        </div>

        {data.payment_provider_url ? (
          <a className="pay-btn" href={data.payment_provider_url}>
            Continuar al pago
          </a>
        ) : (
          <p className="warn">El hotel aún no tiene pagos configurados.</p>
        )}

        <p className="hint">
          Serás redirigido a Wompi para ingresar tu tarjeta o PSE. Al finalizar volverás aquí
          para ver tu recibo.
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
          border-radius: 16px;
          padding: 1.5rem;
          margin-top: 1rem;
        }
        .eyebrow {
          color: #64748b;
          font-size: 0.8rem;
          margin-bottom: 0.25rem;
        }
        h1 {
          font-size: 1.4rem;
          margin-bottom: 0.25rem;
        }
        .subtitle {
          color: #64748b;
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
        .total {
          border-top: 1px dashed #cbd5e1;
          padding-top: 0.75rem;
          display: flex;
          justify-content: space-between;
          font-size: 1.05rem;
        }
        .pay-btn {
          display: block;
          text-align: center;
          background: #16a34a;
          color: #fff;
          padding: 0.95rem 1rem;
          border-radius: 12px;
          font-weight: 600;
          text-decoration: none;
        }
        .hint,
        .warn {
          margin-top: 1rem;
          font-size: 0.82rem;
          color: #64748b;
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
