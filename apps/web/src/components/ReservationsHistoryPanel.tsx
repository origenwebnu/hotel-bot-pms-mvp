'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getDateRangeForPreset,
  formatDateRangeLabel,
  type DateRange,
  type DateRangePreset,
} from '@/lib/date-range';
import type { ReservationHistoryItem, ReservationOutcome } from '@/lib/api';

interface ReservationsHistoryPanelProps {
  title?: string;
  loadReservations: (params: {
    outcome?: ReservationOutcome;
    from?: string;
    to?: string;
    page?: number;
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

const OUTCOME_LABELS: Record<ReservationOutcome, string> = {
  approved: 'Aprobada',
  rejected: 'Rechazada',
  pending: 'En proceso',
};

export function ReservationsHistoryPanel({
  title = 'Historial de reservas',
  loadReservations,
}: ReservationsHistoryPanelProps) {
  const [preset, setPreset] = useState<DateRangePreset>('this_month');
  const [range, setRange] = useState<DateRange>(() => getDateRangeForPreset('this_month'));
  const [outcome, setOutcome] = useState<ReservationOutcome | 'all'>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ReservationHistoryItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await loadReservations({
        outcome: outcome === 'all' ? undefined : outcome,
        from: range.from,
        to: range.to,
        page,
      });
      setItems(result.items);
      setTotalPages(result.pagination.total_pages);
      setTotal(result.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando reservas');
    } finally {
      setLoading(false);
    }
  }, [loadReservations, outcome, range, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function applyPreset(next: DateRangePreset) {
    setPreset(next);
    setPage(1);
    if (next !== 'custom') {
      setRange(getDateRangeForPreset(next));
    }
  }

  const formatMoney = (amount: number | null, currency: string | null) => {
    if (amount == null) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency ?? 'COP',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="admin-content">
      <div className="panel">
        <div className="panel-header-row filters-row">
          <div>
            <h2>{title}</h2>
            <p className="muted">
              {total} reserva(s) · {formatDateRangeLabel(range.from, range.to)}
            </p>
          </div>
          <div className="filter-controls">
            <select
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value as ReservationOutcome | 'all');
                setPage(1);
              }}
            >
              <option value="all">Todas</option>
              <option value="approved">Aprobadas</option>
              <option value="rejected">Rechazadas</option>
              <option value="pending">En proceso</option>
            </select>
            <select
              value={preset}
              onChange={(e) => applyPreset(e.target.value as DateRangePreset)}
            >
              <option value="this_month">Este mes</option>
              <option value="last_month">Mes anterior</option>
              <option value="last_30_days">Últimos 30 días</option>
              <option value="custom">Rango personalizado</option>
            </select>
            {preset === 'custom' && (
              <>
                <input
                  type="date"
                  value={range.from}
                  onChange={(e) => {
                    setRange((prev) => ({ ...prev, from: e.target.value }));
                    setPage(1);
                  }}
                />
                <input
                  type="date"
                  value={range.to}
                  onChange={(e) => {
                    setRange((prev) => ({ ...prev, to: e.target.value }));
                    setPage(1);
                  }}
                />
              </>
            )}
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading-inline">Cargando historial...</div>
        ) : items.length === 0 ? (
          <p className="muted empty-state">No hay reservas en este periodo.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Huésped</th>
                <th>Contacto</th>
                <th>Estadía</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {new Date(item.created_at).toLocaleString('es-CO', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td>
                    <strong>{item.guest.full_name ?? 'Sin nombre'}</strong>
                    {item.room_name && <small>{item.room_name}</small>}
                  </td>
                  <td>
                    <div>{item.guest.email ?? '—'}</div>
                    <small>{item.guest.whatsapp ?? '—'}</small>
                  </td>
                  <td>
                    {item.check_in && item.check_out ? (
                      <>
                        {item.check_in} → {item.check_out}
                        {item.adults != null && (
                          <small>
                            {item.adults} adulto(s)
                            {item.children ? `, ${item.children} niño(s)` : ''}
                          </small>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{formatMoney(item.total_amount, item.currency)}</td>
                  <td>
                    <span className={`pill ${item.outcome === 'approved' ? 'ok' : item.outcome === 'rejected' ? 'off' : ''}`}>
                      {OUTCOME_LABELS[item.outcome]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              className="btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .filters-row {
          align-items: flex-start;
          margin-bottom: 1rem;
        }
        .filter-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .filter-controls select,
        .filter-controls input {
          padding: 0.55rem 0.75rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
        }
        .loading-inline,
        .empty-state {
          padding: 1.5rem 0;
        }
        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin-top: 1rem;
        }
      `}</style>
    </div>
  );
}
