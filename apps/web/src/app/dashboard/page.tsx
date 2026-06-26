'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  type Hotel,
  type IntegrationStatus,
  type HotelSubscription,
  clearAuthSession,
} from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import { HOTEL_NAV, HOTEL_TAB_TITLES } from '@/lib/app-shell-nav';
import { IntegrationsPanel } from '@/components/IntegrationsPanel';
import { WhatsAppPanel } from '@/components/WhatsAppPanel';
import { KnowledgePanel } from '@/components/KnowledgePanel';
import { DiscountTiersPanel } from '@/components/DiscountTiersPanel';
import { InventoryPanel } from '@/components/InventoryPanel';
import { ChatSimulator } from '@/components/ChatSimulator';
import { DashboardOverviewPanel } from '@/components/DashboardOverviewPanel';
import { ReservationsHistoryPanel } from '@/components/ReservationsHistoryPanel';

type Tab = (typeof HOTEL_NAV)[number]['id'];

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

  const headerExtra = tab === 'integrations' && integration && (
    <div className="status-badges">
      <span className={`badge ${integration.whatsapp_connected ? 'ok' : 'warn'}`}>
        WhatsApp {integration.whatsapp_connected ? '✓' : '○'}
      </span>
      <span className={`badge ${integration.pms_connected ? 'ok' : 'warn'}`}>
        PMS {integration.pms_connected ? '✓' : '○'}
      </span>
      <span className={`badge ${integration.payment_connected ? 'ok' : 'warn'}`}>
        Pagos {integration.payment_connected ? '✓' : '○'}
      </span>
    </div>
  );

  return (
    <AppShell
      title={HOTEL_TAB_TITLES[tab] ?? 'Panel'}
      subtitle={hotel.name}
      navItems={HOTEL_NAV}
      activeId={tab}
      onNavigate={(id) => setTab(id as Tab)}
      onLogout={() => {
        clearAuthSession();
        router.push('/');
      }}
      headerExtra={headerExtra}
    >
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
          <IntegrationsPanel integration={integration} onUpdate={setIntegration} />
        </div>
      )}
      {tab === 'inventory' && <InventoryPanel />}
      {tab === 'discounts' && <DiscountTiersPanel />}
      {tab === 'knowledge' && <KnowledgePanel />}
      {tab === 'simulator' && <ChatSimulator />}
    </AppShell>
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
          BookiChat para actualizar a un plan superior.
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
          BookiChat.
        </small>
      </div>
    );
  }

  return null;
}
