'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  isBusinessVertical,
  supportsHotelBooking,
  supportsRestaurantBooking,
  type BusinessVertical,
} from '@hotel-bot/shared';
import {
  api,
  type Hotel,
  type IntegrationStatus,
  type HotelSubscription,
  clearAuthSession,
} from '@/lib/api';
import { AppShell } from '@/components/AppShell';
import {
  buildDashboardNav,
  buildHotelDashboardPath,
  getDashboardOverviewTitle,
  getDashboardTabTitle,
  isIntegrationTab,
  parseDashboardTab,
  type HotelTab,
} from '@/lib/app-shell-nav';
import { WhatsAppPanel } from '@/components/WhatsAppPanel';
import { PmsIntegrationPanel } from '@/components/PmsIntegrationPanel';
import { PaymentIntegrationPanel } from '@/components/PaymentIntegrationPanel';
import { KnowledgePanel } from '@/components/KnowledgePanel';
import { DiscountTiersPanel } from '@/components/DiscountTiersPanel';
import { InventoryPanel } from '@/components/InventoryPanel';
import { RestaurantInventoryPanel } from '@/components/RestaurantInventoryPanel';
import { ChatSimulator } from '@/components/ChatSimulator';
import { ConversationHistoryPanel } from '@/components/ConversationHistoryPanel';
import { DashboardOverviewPanel } from '@/components/DashboardOverviewPanel';
import { ReservationsHistoryPanel } from '@/components/ReservationsHistoryPanel';
import { RestaurantReservationsPanel } from '@/components/RestaurantReservationsPanel';
import { MyAccountPanel } from '@/components/MyAccountPanel';
import { SubscriptionPlansPanel } from '@/components/SubscriptionPlansPanel';
import { BusinessOnboardingPanel } from '@/components/BusinessOnboardingPanel';
import { subscriptionBannerMessage } from '@/lib/subscription-ui';

const DEFAULT_INTEGRATION_TAB: HotelTab = 'integration-whatsapp';

function resolveVertical(hotel: Hotel): BusinessVertical {
  if (hotel.businessVertical && isBusinessVertical(hotel.businessVertical)) {
    return hotel.businessVertical;
  }
  return 'hotel';
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="loading">Cargando panel...</div>}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      booking_from?: string;
      booking_to?: string;
      booking_kind?: string;
      page?: number;
      limit?: number;
    }) => api.listReservations(params),
    [],
  );

  function handleNavigate(id: string) {
    const nextTab: HotelTab =
      id === 'integrations' ? DEFAULT_INTEGRATION_TAB : (id as HotelTab);
    router.replace(buildHotelDashboardPath(nextTab), { scroll: false });
  }

  useEffect(() => {
    if (!hotel) return;
    const vertical = resolveVertical(hotel);
    const requested = searchParams.get('tab');
    if (!requested) return;
    const allowed = parseDashboardTab(requested, vertical);
    if (requested !== allowed) {
      router.replace(buildHotelDashboardPath(allowed), { scroll: false });
    }
  }, [hotel, searchParams, router]);

  if (!hotel) {
    return <div className="loading">Cargando panel...</div>;
  }

  const vertical = resolveVertical(hotel);
  const showHotelBooking = supportsHotelBooking(vertical);
  const showRestaurantBooking = supportsRestaurantBooking(vertical);
  const tab = parseDashboardTab(searchParams.get('tab'), vertical);
  const navItems = buildDashboardNav(vertical);

  const panelTitle =
    tab === 'overview' ? getDashboardOverviewTitle(vertical) : getDashboardTabTitle(tab, vertical);

  const headerExtra = isIntegrationTab(tab) && integration && (
    <div className="status-badges">
      <span className={`badge ${integration.whatsapp_connected ? 'ok' : 'warn'}`}>
        WhatsApp {integration.whatsapp_connected ? '✓' : '○'}
      </span>
      {showHotelBooking && (
        <span className={`badge ${integration.pms_connected ? 'ok' : 'warn'}`}>
          PMS {integration.pms_connected ? '✓' : '○'}
        </span>
      )}
      <span className={`badge ${integration.payment_connected ? 'ok' : 'warn'}`}>
        Pagos {integration.payment_connected ? '✓' : '○'}
      </span>
    </div>
  );

  return (
    <AppShell
      title={panelTitle}
      subtitle={hotel.name}
      navItems={navItems}
      activeId={tab}
      onNavigate={handleNavigate}
      onLogout={() => {
        clearAuthSession();
        router.push('/');
      }}
      headerExtra={headerExtra}
    >
      {subscription && (showHotelBooking || showRestaurantBooking) && tab !== 'overview' && tab !== 'account' && tab !== 'subscription' && (
        <SubscriptionBanner subscription={subscription} onChoosePlan={() => handleNavigate('subscription')} />
      )}

      {tab === 'overview' && (
        <>
          {subscription && (showHotelBooking || showRestaurantBooking) && (
            <SubscriptionBanner subscription={subscription} onChoosePlan={() => handleNavigate('subscription')} />
          )}
          <BusinessOnboardingPanel vertical={vertical} />
          {showHotelBooking && <DashboardOverviewPanel loadStats={loadStats} />}
        </>
      )}
      {tab === 'reservations' && showHotelBooking && (
        <ReservationsHistoryPanel loadReservations={loadReservations} />
      )}
      {tab === 'reservations' && showRestaurantBooking && (
        <RestaurantReservationsPanel loadReservations={loadReservations} />
      )}
      {tab === 'conversations' && <ConversationHistoryPanel />}
      {tab === 'integration-whatsapp' && (
        <WhatsAppPanel
          onConnectionChange={(connected) =>
            setIntegration((prev) => (prev ? { ...prev, whatsapp_connected: connected } : prev))
          }
        />
      )}
      {tab === 'integration-pms' && showHotelBooking && (
        <PmsIntegrationPanel integration={integration} onUpdate={setIntegration} />
      )}
      {tab === 'integration-payments' && (
        <PaymentIntegrationPanel integration={integration} onUpdate={setIntegration} />
      )}
      {tab === 'inventory' && showHotelBooking && <InventoryPanel />}
      {tab === 'inventory' && showRestaurantBooking && <RestaurantInventoryPanel />}
      {tab === 'discounts' && showHotelBooking && <DiscountTiersPanel />}
      {tab === 'knowledge' && <KnowledgePanel />}
      {tab === 'simulator' && <ChatSimulator />}
      {tab === 'subscription' && (
        <SubscriptionPlansPanel subscription={subscription} />
      )}
      {tab === 'account' && (
        <MyAccountPanel
          hotel={hotel}
          subscription={subscription}
          onHotelUpdate={(updated) => {
            setHotel((prev) => (prev ? { ...prev, ...updated } : prev));
          }}
        />
      )}
    </AppShell>
  );
}

function SubscriptionBanner({
  subscription,
  onChoosePlan,
}: {
  subscription: HotelSubscription;
  onChoosePlan: () => void;
}) {
  const banner = subscriptionBannerMessage(subscription);
  if (!banner) return null;

  return (
    <div className={`subscription-banner ${banner.tone}`}>
      <div className="subscription-banner-content">
        <div>
          <strong>{banner.title}</strong>
          <small>{banner.body}</small>
        </div>
        {banner.showPlanCta && (
          <button type="button" className="btn-primary subscription-banner-cta" onClick={onChoosePlan}>
            {banner.ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
