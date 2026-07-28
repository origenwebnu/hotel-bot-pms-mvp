'use client';

import { useEffect, useState } from 'react';
import {
  getDateRangeForPreset,
  formatDateRangeLabel,
  type DateRange,
  type DateRangePreset,
} from '@/lib/date-range';
import type { ReservationStats } from '@/lib/api';

interface DashboardOverviewPanelProps {
  loadStats: (range: DateRange) => Promise<ReservationStats>;
}

export function DashboardOverviewPanel({ loadStats }: DashboardOverviewPanelProps) {
  const [preset, setPreset] = useState<DateRangePreset>('this_month');
  const [range, setRange] = useState<DateRange>(() => getDateRangeForPreset('this_month'));
  const [stats, setStats] = useState<ReservationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    loadStats(range)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando estadísticas');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, loadStats]);

  function applyPreset(next: DateRangePreset) {
    setPreset(next);
    if (next !== 'custom') {
      setRange(getDateRangeForPreset(next));
    }
  }

  const cards = stats
    ? [
        {
          label: 'Reservas aprobadas',
          value: stats.reservations.approved,
          sub: 'Pagos confirmados',
          tone: 'ok' as const,
        },
        {
          label: 'Reservas rechazadas',
          value: stats.reservations.rejected,
          sub: 'Expiradas o pago fallido',
          tone: 'warn' as const,
        },
        {
          label: 'En proceso',
          value: stats.reservations.pending,
          sub: 'Esperando pago',
          tone: 'neutral' as const,
        },
        {
          label: 'Conversaciones',
          value: stats.conversations.total,
          sub: 'Sesiones WhatsApp',
          tone: 'neutral' as const,
        },
        {
          label: 'Total reservas',
          value: stats.reservations.total,
          sub: formatDateRangeLabel(range.from, range.to),
          tone: 'neutral' as const,
        },
      ]
    : [];

  return (
    <div className="admin-content">
      <div className="panel">
        <div className="panel-header-row filters-row">
          <div>
            <h2>Resumen del periodo</h2>
            <p className="muted">{formatDateRangeLabel(range.from, range.to)}</p>
          </div>
          <div className="filter-controls">
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
                  onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
                />
                <input
                  type="date"
                  value={range.to}
                  onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-banner panel-error">{error}</div>}

      {loading ? (
        <div className="loading-inline">Cargando métricas...</div>
      ) : (
        <div className="stat-grid">
          {cards.map((card) => (
            <div key={card.label} className={`stat-card ${card.tone}`}>
              <span className="stat-label">{card.label}</span>
              <strong className="stat-value">{card.value}</strong>
              <small>{card.sub}</small>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .filters-row {
          align-items: flex-start;
        }
        .filter-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .filter-controls select,
        .filter-controls input {
          padding: 0.55rem 0.75rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
        }
        .loading-inline {
          color: var(--text-muted);
          padding: 1rem 0;
        }
        .stat-card.ok strong {
          color: var(--success);
        }
        .stat-card.warn strong {
          color: var(--warning);
        }
        .panel-error {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}
