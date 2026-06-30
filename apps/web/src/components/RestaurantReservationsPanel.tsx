'use client';

import { useState } from 'react';
import type { ReservationHistoryItem, ReservationOutcome } from '@/lib/api';
import { ReservationsHistoryPanel } from '@/components/ReservationsHistoryPanel';
import { RestaurantReservationsCalendarPanel } from '@/components/RestaurantReservationsCalendarPanel';

interface Props {
  loadReservations: (params: {
    outcome?: ReservationOutcome;
    from?: string;
    to?: string;
    booking_from?: string;
    booking_to?: string;
    booking_kind?: string;
    page?: number;
    limit?: number;
  }) => Promise<{
    items: ReservationHistoryItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
  }>;
}

export function RestaurantReservationsPanel({ loadReservations }: Props) {
  const [view, setView] = useState<'calendar' | 'history'>('calendar');

  return (
    <div className="rest-res-panel">
      <div className="panel">
        <div className="rest-res-tabs">
          <button
            type="button"
            className={view === 'calendar' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setView('calendar')}
          >
            Calendario
          </button>
          <button
            type="button"
            className={view === 'history' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setView('history')}
          >
            Historial
          </button>
        </div>
      </div>

      {view === 'calendar' && <RestaurantReservationsCalendarPanel />}
      {view === 'history' && (
        <ReservationsHistoryPanel
          title="Historial de reservas de mesa"
          loadReservations={(params) =>
            loadReservations({ ...params, booking_kind: 'restaurant_table' })
          }
          restaurantMode
        />
      )}

      <style jsx>{`
        .rest-res-tabs {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
      `}</style>
    </div>
  );
}
