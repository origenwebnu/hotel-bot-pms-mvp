'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type PaymentStatus = {
  reservation_id: string;
  payment_status: string;
  status: string;
  payment_event_id: string | null;
  hotel_name: string;
  room_name: string | null;
  check_in_label: string | null;
  check_out_label: string | null;
  guest_name: string;
  guest_email: string | null;
  guests: number;
  amount: number | null;
  original_amount: number | null;
  discount_percent: number | null;
  currency: string | null;
  recommendations: string | null;
};

function statusLabel(status: string) {
  switch (status) {
    case 'approved':
      return { text: 'Pago aprobado', tone: 'ok' };
    case 'declined':
      return { text: 'Pago rechazado', tone: 'bad' };
    case 'error':
      return { text: 'Error en el pago', tone: 'bad' };
    default:
      return { text: 'Procesando pago...', tone: 'pending' };
  }
}

function PaymentResultContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const token = searchParams.get('token') ?? '';
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Enlace inválido.');
      return;
    }

    let active = true;

    async function poll() {
      try {
        const res = await fetch(
          `/api/public/payments/${id}/status?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) throw new Error('No se pudo consultar el pago');
        const json = (await res.json()) as PaymentStatus;
        if (!active) return;
        setData(json);
        if (!['approved', 'declined', 'error'].includes(json.payment_status)) {
          setTimeout(poll, 2500);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Error');
        }
      }
    }

    poll();
    return () => {
      active = false;
    };
  }, [id, token]);

  if (error) {
    return (
      <main className="page">
        <div className="receipt error">{error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <div className="receipt">Consultando estado del pago...</div>
      </main>
    );
  }

  const label = statusLabel(data.payment_status);
  const paymentPageUrl = `/payment/${id}?token=${encodeURIComponent(token)}`;

  return (
    <main className="page">
      <div className={`receipt ${label.tone}`} id="receipt">
        <p className="brand">BookiChat · Recibo</p>
        <h1>{label.text}</h1>
        <p className="hotel">{data.hotel_name}</p>

        <div className="block">
          <div className="line">
            <span>Reserva</span>
            <strong>{data.reservation_id.slice(-8).toUpperCase()}</strong>
          </div>
          {data.payment_event_id ? (
            <div className="line">
              <span>Transacción</span>
              <strong>{data.payment_event_id.slice(-12).toUpperCase()}</strong>
            </div>
          ) : null}
          <div className="line">
            <span>Cliente</span>
            <strong>{data.guest_name}</strong>
          </div>
          <div className="line">
            <span>Habitación</span>
            <strong>{data.room_name ?? '—'}</strong>
          </div>
          <div className="line">
            <span>Estadía</span>
            <strong>
              {data.check_in_label} → {data.check_out_label}
            </strong>
          </div>
          <div className="line">
            <span>Huéspedes</span>
            <strong>{data.guests}</strong>
          </div>
          {data.discount_percent && data.original_amount ? (
            <div className="line">
              <span>Descuento</span>
              <strong>{data.discount_percent}%</strong>
            </div>
          ) : null}
          <div className="total">
            <span>Total</span>
            <strong>
              {data.currency} {(data.amount ?? 0).toLocaleString('es-CO')}
            </strong>
          </div>
        </div>

        {data.payment_status === 'approved' ? (
          <>
            <p className="thanks">¡Gracias! Tu reserva está confirmada. También te enviamos el recibo por WhatsApp.</p>
            {data.recommendations ? (
              <div className="reco">
                <strong>Recomendaciones para tu estadía</strong>
                <p>{data.recommendations}</p>
              </div>
            ) : null}
          </>
        ) : null}

        {data.payment_status === 'declined' || data.payment_status === 'error' ? (
          <>
            <p className="fail">
              El pago no se completó. Tu habitación puede seguir reservada por un tiempo limitado.
              Intenta de nuevo o usa otro método.
            </p>
            <a className="retry" href={paymentPageUrl}>
              Volver a pagar
            </a>
          </>
        ) : null}

        <button type="button" className="shot" onClick={() => window.print()}>
          Guardar / imprimir recibo
        </button>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
          }
          .shot {
            display: none !important;
          }
        }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #eef2ff;
          display: flex;
          justify-content: center;
          padding: 1rem;
        }
        .receipt {
          width: 100%;
          max-width: 420px;
          background: #fff;
          color: #0f172a;
          border-radius: 16px;
          padding: 1.5rem;
          margin-top: 0.5rem;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        }
        .receipt.ok {
          border-top: 6px solid #16a34a;
        }
        .receipt.bad {
          border-top: 6px solid #dc2626;
        }
        .receipt.pending {
          border-top: 6px solid #f59e0b;
        }
        .brand {
          color: #64748b;
          font-size: 0.8rem;
        }
        h1 {
          font-size: 1.35rem;
          margin: 0.25rem 0;
          color: #0f172a;
        }
        .hotel {
          color: #334155;
          margin-bottom: 1rem;
        }
        .block {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          background: #f8fafc;
        }
        .line {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          font-size: 0.92rem;
        }
        .line span {
          color: #64748b;
        }
        .line strong {
          color: #0f172a;
          text-align: right;
        }
        .total {
          border-top: 1px dashed #cbd5e1;
          padding-top: 0.75rem;
          display: flex;
          justify-content: space-between;
        }
        .total span {
          color: #64748b;
        }
        .total strong {
          color: #0f172a;
        }
        .thanks,
        .fail {
          margin-top: 1rem;
          font-size: 0.92rem;
          line-height: 1.45;
          color: #334155;
        }
        .reco {
          margin-top: 1rem;
          background: #f8fafc;
          border-radius: 12px;
          padding: 0.85rem;
          font-size: 0.9rem;
          line-height: 1.45;
        }
        .retry,
        .shot {
          display: block;
          width: 100%;
          margin-top: 1rem;
          text-align: center;
          border: none;
          border-radius: 12px;
          padding: 0.9rem 1rem;
          font-weight: 600;
          cursor: pointer;
        }
        .retry {
          background: #16a34a;
          color: #fff;
          text-decoration: none;
        }
        .shot {
          background: #e2e8f0;
          color: #0f172a;
        }
        .error {
          color: #b91c1c;
        }
      `}</style>
    </main>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<main className="page"><div>Cargando...</div></main>}>
      <PaymentResultContent />
    </Suspense>
  );
}
