'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type Hotel, type IntegrationStatus, type HotelSubscription, clearAuthSession } from '@/lib/api';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';
import { WhatsAppPanel } from '@/components/WhatsAppPanel';
import { KnowledgePanel } from '@/components/KnowledgePanel';
import { DiscountTiersPanel } from '@/components/DiscountTiersPanel';
import { InventoryPanel } from '@/components/InventoryPanel';
import { ChatSimulator } from '@/components/ChatSimulator';
import { DashboardOverviewPanel } from '@/components/DashboardOverviewPanel';
import { ReservationsHistoryPanel } from '@/components/ReservationsHistoryPanel';

type Tab = 'overview' | 'reservations' | 'integrations' | 'inventory' | 'discounts' | 'knowledge' | 'simulator';

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null);
  const [subscription, setSubscription] = useState<HotelSubscription | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (!token) {
      router.push('/');
      return;
    }
    if (role === 'super_admin') {
      router.push('/super-admin');
      return;
    }

    Promise.all([api.getHotel(), api.getIntegration(), api.getSubscription()])
      .then(([h, i, s]) => {
        setHotel(h);
        setIntegration(i);
        setSubscription(s);
      })
      .catch(() => router.push('/'));
  }, [router]);

  function logout() {
    clearAuthSession();
    router.push('/');
  }

  const loadStats = useCallback(
    (range: { from: string; to: string }) =>
      api.getReservationStats({ from: range.from, to: range.to }),
    [],
  );

  const loadReservations = useCallback(
    (params: {
      outcome?: 'approved' | 'rejected' | 'pending';
      from?: string;
      to?: string;
      page?: number;
    }) => api.listReservations(params),
    [],
  );

  if (!hotel) {
    return <div className="loading">Cargando panel...</div>;
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span>🏨</span>
          <div>
            <strong>BookiChat</strong>
            <small>{hotel.name}</small>
          </div>
        </div>
        <nav>
          <button
            className={tab === 'overview' ? 'active' : ''}
            onClick={() => setTab('overview')}
          >
            📊 Resumen
          </button>
          <button
            className={tab === 'reservations' ? 'active' : ''}
            onClick={() => setTab('reservations')}
          >
            📋 Reservas
          </button>
          <button
            className={tab === 'integrations' ? 'active' : ''}
            onClick={() => setTab('integrations')}
          >
            ⚙️ Integraciones
          </button>
          <button
            className={tab === 'inventory' ? 'active' : ''}
            onClick={() => setTab('inventory')}
          >
            🛏️ Inventario
          </button>
          <button
            className={tab === 'discounts' ? 'active' : ''}
            onClick={() => setTab('discounts')}
          >
            🏷️ Descuentos
          </button>
          <button
            className={tab === 'knowledge' ? 'active' : ''}
            onClick={() => setTab('knowledge')}
          >
            📚 Knowledge Base
          </button>
          <button
            className={tab === 'simulator' ? 'active' : ''}
            onClick={() => setTab('simulator')}
          >
            💬 Simulador IA
          </button>
        </nav>
        <button className="logout-btn" onClick={logout}>
          Cerrar sesión
        </button>
      </aside>

      <main className="main">
        <header className="main-header">
          <h1>
            {tab === 'overview' && 'Resumen del hotel'}
            {tab === 'reservations' && 'Historial de reservas'}
            {tab === 'integrations' && 'Integraciones'}
            {tab === 'inventory' && 'Inventario de habitaciones'}
            {tab === 'discounts' && 'Descuentos automáticos'}
            {tab === 'knowledge' && 'Knowledge Base'}
            {tab === 'simulator' && 'Simulador de Chat'}
          </h1>
          <div className="status-badges">
            <span className={`badge ${integration?.whatsapp_connected ? 'ok' : 'warn'}`}>
              WhatsApp {integration?.whatsapp_connected ? '✓' : '○'}
            </span>
            <span className={`badge ${integration?.pms_connected ? 'ok' : 'warn'}`}>
              PMS {integration?.pms_connected ? '✓' : '○'}
            </span>
            <span className={`badge ${integration?.payment_connected ? 'ok' : 'warn'}`}>
              Pagos {integration?.payment_connected ? '✓' : '○'}
            </span>
          </div>
        </header>

        {subscription && tab !== 'overview' && <SubscriptionBanner subscription={subscription} />}

        {tab === 'overview' && (
          <>
            {subscription && <SubscriptionBanner subscription={subscription} />}
            <DashboardOverviewPanel loadStats={loadStats} />
          </>
        )}
        {tab === 'reservations' && (
          <ReservationsHistoryPanel loadReservations={loadReservations} />
        )}
        {tab === 'integrations' && (
          <div className="integrations-stack">
            <WhatsAppPanel
              onConnectionChange={(connected) =>
                setIntegration((prev) =>
                  prev ? { ...prev, whatsapp_connected: connected } : prev,
                )
              }
            />
            <IntegrationsPanel
              integration={integration}
              onUpdate={setIntegration}
            />
          </div>
        )}
        {tab === 'inventory' && <InventoryPanel />}
        {tab === 'discounts' && <DiscountTiersPanel />}
        {tab === 'knowledge' && <KnowledgePanel />}
        {tab === 'simulator' && <ChatSimulator />}
      </main>

      <style jsx>{`
        .dashboard {
          display: flex;
          min-height: 100vh;
        }
        .sidebar {
          width: 260px;
          background: var(--surface);
          border-right: 1px solid var(--border);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .sidebar-brand {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border);
        }
        .sidebar-brand span:first-child {
          font-size: 1.75rem;
        }
        .sidebar-brand strong {
          display: block;
          font-size: 1rem;
        }
        .sidebar-brand small {
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        nav {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
        }
        nav button {
          text-align: left;
          padding: 0.75rem 1rem;
          background: none;
          border: none;
          border-radius: 8px;
          color: var(--text-muted);
          font-size: 0.95rem;
        }
        nav button.active,
        nav button:hover {
          background: var(--surface-hover);
          color: var(--text);
        }
        .logout-btn {
          padding: 0.75rem;
          background: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-muted);
        }
        .main {
          flex: 1;
          padding: 2rem;
          overflow-y: auto;
        }
        .main-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        h1 {
          font-size: 1.75rem;
        }
        .status-badges {
          display: flex;
          gap: 0.5rem;
        }
        .badge {
          padding: 0.35rem 0.75rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 500;
        }
        .badge.ok {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
        }
        .badge.warn {
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
        }
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          color: var(--text-muted);
        }
        .integrations-stack {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .subscription-banner {
          margin-bottom: 1.5rem;
          padding: 1rem 1.25rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface);
        }
        .subscription-banner.warn {
          border-color: rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.08);
        }
        .subscription-banner.danger {
          border-color: rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.08);
        }
        .subscription-banner.ok {
          border-color: rgba(34, 197, 94, 0.35);
          background: rgba(34, 197, 94, 0.08);
        }
        .subscription-banner strong {
          display: block;
          margin-bottom: 0.35rem;
        }
        .subscription-banner small {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}

function SubscriptionBanner({ subscription }: { subscription: HotelSubscription }) {
  const formatCop = (amount: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(amount);

  if (subscription.status === 'trial') {
    return (
      <div className="subscription-banner ok">
        <strong>Periodo de prueba activo</strong>
        <small>
          {subscription.used}/{subscription.limit} reservas usadas
          {subscription.trial_days_left != null &&
            ` · ${subscription.trial_days_left} día(s) restantes`}
        </small>
      </div>
    );
  }

  if (subscription.status === 'active' && subscription.plan_name) {
    return (
      <div className="subscription-banner ok">
        <strong>
          Plan {subscription.plan_name}
          {subscription.plan_price_monthly != null &&
            ` — ${formatCop(subscription.plan_price_monthly)}/mes`}
        </strong>
        <small>
          {subscription.used}/{subscription.limit} reservas este mes
          {subscription.period_month && ` (${subscription.period_month})`}
        </small>
      </div>
    );
  }

  if (subscription.status === 'quota_reached') {
    return (
      <div className="subscription-banner danger">
        <strong>Límite mensual alcanzado</strong>
        <small>
          Consumiste las {subscription.limit} reservas de tu plan este mes. Contacta a
          BookiChat para actualizar a un plan superior. Las nuevas reservas por WhatsApp
          están pausadas.
        </small>
      </div>
    );
  }

  if (subscription.status === 'trial_expired') {
    return (
      <div className="subscription-banner danger">
        <strong>Periodo de prueba finalizado</strong>
        <small>
          Elige un plan para seguir recibiendo reservas por WhatsApp. Contacta a soporte
          BookiChat para activar tu plan (pagos en línea próximamente).
        </small>
      </div>
    );
  }

  return null;
}
