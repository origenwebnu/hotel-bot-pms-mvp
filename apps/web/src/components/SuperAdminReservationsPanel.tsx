'use client';

import { useCallback, useEffect, useState } from 'react';
import { superAdminApi, type PlatformHotel } from '@/lib/super-admin-api';
import { DashboardOverviewPanel } from '@/components/DashboardOverviewPanel';
import { ReservationsHistoryPanel } from '@/components/ReservationsHistoryPanel';

export function SuperAdminReservationsPanel({
  hotels,
}: {
  hotels: PlatformHotel[];
}) {
  const [hotelId, setHotelId] = useState(hotels[0]?.id ?? '');

  useEffect(() => {
    if (!hotelId && hotels[0]?.id) {
      setHotelId(hotels[0].id);
    }
  }, [hotelId, hotels]);

  const selectedHotel = hotels.find((h) => h.id === hotelId);

  const loadStats = useCallback(
    (range: { from: string; to: string }) => {
      if (!hotelId) {
        return Promise.resolve({
          reservations: { total: 0, approved: 0, rejected: 0, pending: 0 },
          conversations: { total: 0 },
          period: { from: range.from, to: range.to },
        });
      }
      return superAdminApi.getHotelReservationStats(hotelId, range);
    },
    [hotelId],
  );

  const loadReservations = useCallback(
    (params: {
      outcome?: 'approved' | 'rejected' | 'pending';
      from?: string;
      to?: string;
      page?: number;
    }) => {
      if (!hotelId) {
        return Promise.resolve({
          items: [],
          pagination: { page: 1, limit: 25, total: 0, total_pages: 1 },
        });
      }
      return superAdminApi.listHotelReservations(hotelId, params);
    },
    [hotelId],
  );

  if (!hotels.length) {
    return (
      <div className="panel">
        <p className="muted">No hay hoteles registrados todavía.</p>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <div className="panel">
        <label className="hotel-select">
          Hotel
          <select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </select>
        </label>
        {selectedHotel && (
          <p className="muted">
            Viendo reservas de <strong>{selectedHotel.name}</strong>
          </p>
        )}
      </div>

      <DashboardOverviewPanel loadStats={loadStats} />

      <ReservationsHistoryPanel
        title={`Historial — ${selectedHotel?.name ?? 'Hotel'}`}
        loadReservations={loadReservations}
      />

      <style jsx>{`
        .hotel-select {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          max-width: 420px;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .hotel-select select {
          padding: 0.75rem 1rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
