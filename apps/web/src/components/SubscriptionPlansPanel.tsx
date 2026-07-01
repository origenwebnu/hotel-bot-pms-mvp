'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  api,
  type HotelSubscription,
  type SubscriptionPlanCatalogItem,
  type UserProfile,
} from '@/lib/api';
import { subscriptionNeedsPlanPicker } from '@/lib/subscription-ui';

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface Props {
  subscription: HotelSubscription | null;
}

export function SubscriptionPlansPanel({ subscription }: Props) {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanCatalogItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const showPlanPicker =
    !subscription || subscriptionNeedsPlanPicker(subscription);

  useEffect(() => {
    const subscriptionResult = searchParams.get('subscription');
    if (subscriptionResult === 'success') {
      setMessage(
        'Pago recibido. Activaremos tu plan en unos segundos cuando Mercado Pago confirme el pago.',
      );
    } else if (subscriptionResult === 'pending') {
      setMessage('Tu pago está pendiente de confirmación. Te avisaremos cuando se acredite.');
    } else if (subscriptionResult === 'failure') {
      setMessage('El pago no se completó. Puedes intentar de nuevo con otro plan.');
    }
  }, [searchParams]);

  useEffect(() => {
    api
      .getProfile()
      .then(setProfile)
      .catch(() => {});

    api
      .listSubscriptionPlans()
      .then(setPlans)
      .catch(() => setMessage('No se pudieron cargar los planes disponibles.'))
      .finally(() => setLoadingPlans(false));
  }, []);

  async function handleSubscribe(planId: string) {
    setCheckoutPlanId(planId);
    setMessage('');
    try {
      const result = await api.createSubscriptionCheckout(planId, profile?.email ?? undefined);
      window.location.href = result.checkout_url;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo iniciar el pago');
      setCheckoutPlanId(null);
    }
  }

  return (
    <div className="subscription-plans-panel">
      {message && (
        <div className={message.includes('Error') || message.includes('No se') ? 'error-banner' : 'info-banner'}>
          {message}
        </div>
      )}

      <section className="panel account-section">
        <h2>Plan BookiChat</h2>
        <p className="muted">
          Suscripción mensual para recibir reservas por WhatsApp. El pago es seguro con Mercado Pago
          y la activación es automática al confirmarse.
        </p>

        {subscription?.status === 'active' && subscription.plan_name && !showPlanPicker && (
          <div className="current-plan-summary">
            <span className="pill ok">Plan activo</span>
            <p>
              <strong>{subscription.plan_name}</strong>
              {subscription.plan_price_monthly != null && (
                <>
                  {' '}
                  — {formatMoney(subscription.plan_price_monthly, subscription.plan_currency ?? 'COP')}
                  /mes
                </>
              )}
            </p>
            <p className="muted">
              Uso: {subscription.used}/{subscription.limit} reservas este mes
            </p>
          </div>
        )}

        {showPlanPicker && (
          <>
            {subscription?.status === 'trial_expired' && (
              <div className="subscription-callout danger">
                <strong>Tu periodo de prueba finalizó</strong>
                <p>Selecciona un plan para reactivar las reservas por WhatsApp.</p>
              </div>
            )}

            {subscription?.status === 'suspended' && (
              <div className="subscription-callout danger">
                <strong>Cuenta suspendida</strong>
                <p>Paga tu plan para volver a operar con BookiChat.</p>
              </div>
            )}

            {subscription?.status === 'quota_reached' && (
              <div className="subscription-callout warn">
                <strong>Límite alcanzado</strong>
                <p>Elige un plan con más reservas mensuales.</p>
              </div>
            )}

            {loadingPlans ? (
              <p className="muted">Cargando planes…</p>
            ) : plans.length === 0 ? (
              <p className="muted">
                No hay planes disponibles en este momento. Contacta a soporte BookiChat.
              </p>
            ) : (
              <div className="plan-cards">
                {plans.map((plan) => (
                  <article key={plan.id} className="plan-card">
                    <h3>{plan.name}</h3>
                    {plan.description && <p className="muted">{plan.description}</p>}
                    <p className="plan-price">
                      {formatMoney(plan.price_monthly, plan.currency)}
                      <span className="muted"> / mes</span>
                    </p>
                    <ul className="plan-features">
                      <li>
                        Hasta <strong>{plan.max_reservations_per_month}</strong> reservas al mes
                      </li>
                    </ul>
                    <button
                      type="button"
                      className="btn-primary plan-cta"
                      disabled={checkoutPlanId === plan.id}
                      onClick={() => handleSubscribe(plan.id)}
                    >
                      {checkoutPlanId === plan.id ? 'Redirigiendo a Mercado Pago…' : 'Pagar con Mercado Pago'}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <style jsx>{`
        .subscription-plans-panel {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .current-plan-summary {
          margin-top: 1rem;
          padding: 1rem;
          border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border, #e5e7eb);
          background: rgba(95, 66, 209, 0.06);
        }
        .current-plan-summary p {
          margin: 0.5rem 0 0;
        }
        .subscription-callout {
          margin: 1rem 0;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border, #e5e7eb);
        }
        .subscription-callout.danger {
          border-color: rgba(220, 38, 38, 0.35);
          background: rgba(220, 38, 38, 0.08);
        }
        .subscription-callout.warn {
          border-color: rgba(217, 119, 6, 0.35);
          background: rgba(217, 119, 6, 0.08);
        }
        .subscription-callout strong {
          display: block;
          margin-bottom: 0.35rem;
        }
        .subscription-callout p {
          margin: 0;
          color: var(--text-muted);
        }
        .plan-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1rem;
          margin-top: 1.25rem;
        }
        .plan-card {
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 12px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          background: var(--surface, #fff);
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
        }
        .plan-card h3 {
          margin: 0;
          font-size: 1.15rem;
        }
        .plan-price {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0;
          color: var(--primary, #5f42d1);
        }
        .plan-features {
          margin: 0;
          padding-left: 1.25rem;
          flex: 1;
        }
        .plan-cta {
          width: 100%;
          margin-top: 0.25rem;
        }
      `}</style>
    </div>
  );
}
