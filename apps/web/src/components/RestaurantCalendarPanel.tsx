'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type DiningZone,
  type RestaurantDateRate,
  type RestaurantSettings,
} from '@/lib/api';

type CalendarMode = 'general' | 'special' | 'block';

function formatCop(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCopShort(amount: number) {
  if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}K`;
  }
  return `$${amount}`;
}

function monthRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const label = from.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label,
  };
}

function buildCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
    });
  }
  return cells;
}

function getDayStatus(
  date: string,
  ratesByDate: Map<string, RestaurantDateRate[]>,
  defaultPerGuest: number,
) {
  const dayRates = ratesByDate.get(date) ?? [];
  const global = dayRates.find((r) => !r.dining_zone_id);
  if (global?.closed) {
    return {
      kind: 'blocked' as const,
      label: global.label ?? 'Cerrado',
      price: null,
    };
  }
  if (global?.price_per_guest_override != null || global?.reservation_fee_override != null) {
    return {
      kind: 'special' as const,
      label: global.label ?? 'Especial',
      price: global.price_per_guest_override ?? defaultPerGuest,
    };
  }
  return {
    kind: 'default' as const,
    label: null,
    price: defaultPerGuest,
  };
}

interface Props {
  zones: DiningZone[];
  settings: RestaurantSettings;
  onSettingsSaved: () => void;
  onMessage: (msg: string, isError?: boolean) => void;
}

export function RestaurantCalendarPanel({
  zones,
  settings,
  onSettingsSaved,
  onMessage,
}: Props) {
  const [mode, setMode] = useState<CalendarMode>('general');
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [rates, setRates] = useState<RestaurantDateRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [generalForm, setGeneralForm] = useState({
    default_reservation_fee: String(settings.default_reservation_fee ?? 0),
    default_price_per_guest: String(settings.default_price_per_guest ?? 0),
  });

  const [specialForm, setSpecialForm] = useState({
    label: '',
    reservation_fee_override: '',
    price_per_guest_override: '',
    dining_zone_id: '',
  });

  const monthMeta = useMemo(() => monthRange(monthDate), [monthDate]);
  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);

  const ratesByDate = useMemo(() => {
    const map = new Map<string, RestaurantDateRate[]>();
    for (const rate of rates) {
      const list = map.get(rate.date) ?? [];
      list.push(rate);
      map.set(rate.date, list);
    }
    return map;
  }, [rates]);

  const defaultPerGuest = settings.default_price_per_guest ?? 0;

  const loadRates = useCallback(async () => {
    setLoadingRates(true);
    try {
      const data = await api.listRestaurantCalendar({
        from: monthMeta.from,
        to: monthMeta.to,
      });
      setRates(data);
    } catch {
      onMessage('Error cargando calendario', true);
    } finally {
      setLoadingRates(false);
    }
  }, [monthMeta.from, monthMeta.to, onMessage]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  useEffect(() => {
    setGeneralForm({
      default_reservation_fee: String(settings.default_reservation_fee ?? 0),
      default_price_per_guest: String(settings.default_price_per_guest ?? 0),
    });
  }, [settings.default_reservation_fee, settings.default_price_per_guest]);

  function toggleDate(date: string) {
    if (mode === 'general') return;

    setSelectedDates((prev) => {
      const next = new Set(prev);

      if (rangeAnchor) {
        const allDates = calendarDays.filter(Boolean).map((c) => c!.date);
        const startIdx = allDates.indexOf(rangeAnchor);
        const endIdx = allDates.indexOf(date);
        if (startIdx >= 0 && endIdx >= 0) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = from; i <= to; i++) next.add(allDates[i]);
          setRangeAnchor(null);
          return next;
        }
      }

      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function handleDayClick(date: string, shiftKey: boolean) {
    if (mode === 'general') return;
    if (shiftKey) {
      if (!rangeAnchor) {
        setRangeAnchor(date);
        setSelectedDates(new Set([date]));
      } else {
        toggleDate(date);
      }
      return;
    }
    setRangeAnchor(date);
    toggleDate(date);
  }

  function selectAllMonth() {
    const dates = calendarDays.filter(Boolean).map((c) => c!.date);
    setSelectedDates(new Set(dates));
  }

  function clearSelection() {
    setSelectedDates(new Set());
    setRangeAnchor(null);
  }

  async function saveGeneralRates(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateRestaurantSettings({
        default_reservation_fee: Number(generalForm.default_reservation_fee),
        default_price_per_guest: Number(generalForm.default_price_per_guest),
      });
      onMessage('Tarifas generales guardadas.');
      onSettingsSaved();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Error al guardar', true);
    } finally {
      setSaving(false);
    }
  }

  async function applySpecialRates(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDates.size) {
      onMessage('Selecciona uno o más días en el calendario.', true);
      return;
    }
    setSaving(true);
    try {
      await api.bulkUpsertRestaurantCalendar({
        dates: [...selectedDates],
        dining_zone_id: specialForm.dining_zone_id || null,
        closed: false,
        label: specialForm.label || undefined,
        reservation_fee_override: specialForm.reservation_fee_override
          ? Number(specialForm.reservation_fee_override)
          : null,
        price_per_guest_override: specialForm.price_per_guest_override
          ? Number(specialForm.price_per_guest_override)
          : null,
      });
      onMessage(`Tarifa especial aplicada a ${selectedDates.size} día(s).`);
      clearSelection();
      await loadRates();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Error al aplicar tarifas', true);
    } finally {
      setSaving(false);
    }
  }

  async function applyBlockDays() {
    if (!selectedDates.size) {
      onMessage('Selecciona uno o más días para bloquear.', true);
      return;
    }
    setSaving(true);
    try {
      await api.bulkUpsertRestaurantCalendar({
        dates: [...selectedDates],
        dining_zone_id: null,
        closed: true,
        label: 'Cerrado',
        reservation_fee_override: null,
        price_per_guest_override: null,
      });
      onMessage(`${selectedDates.size} día(s) bloqueado(s). No se aceptarán reservas.`);
      clearSelection();
      await loadRates();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Error al bloquear días', true);
    } finally {
      setSaving(false);
    }
  }

  async function unblockSelected() {
    if (!selectedDates.size) {
      onMessage('Selecciona días bloqueados para desbloquear.', true);
      return;
    }
    setSaving(true);
    try {
      const result = await api.bulkClearRestaurantCalendar({
        dates: [...selectedDates],
        dining_zone_id: null,
      });
      onMessage(`Se liberaron ${result.deleted} registro(s). Los días vuelven a tarifa general.`);
      clearSelection();
      await loadRates();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Error al desbloquear', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rest-calendar-layout">
      <div className="rest-calendar-main panel">
        <div className="panel-header-row">
          <div>
            <h3>Calendario — {monthMeta.label}</h3>
            <p className="muted small">
              Tarifa base: {formatCop(defaultPerGuest)}/persona · Fee:{' '}
              {formatCop(settings.default_reservation_fee ?? 0)}/reserva
            </p>
          </div>
          <div className="rest-calendar-nav">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))
              }
            >
              ←
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setMonthDate(new Date())}
            >
              Hoy
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))
              }
            >
              →
            </button>
          </div>
        </div>

        <div className="rest-calendar-modes">
          {(
            [
              ['general', 'Tarifas generales'],
              ['special', 'Tarifas especiales'],
              ['block', 'Bloquear días'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={mode === id ? 'btn-primary' : 'btn-secondary'}
              onClick={() => {
                setMode(id);
                clearSelection();
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode !== 'general' && (
          <div className="rest-calendar-selection-bar">
            <span>
              {selectedDates.size} día{selectedDates.size !== 1 ? 's' : ''} seleccionado
              {selectedDates.size !== 1 ? 's' : ''}
            </span>
            <button type="button" className="btn-secondary" onClick={selectAllMonth}>
              Seleccionar mes
            </button>
            <button type="button" className="btn-secondary" onClick={clearSelection}>
              Limpiar
            </button>
            <span className="muted small">Tip: clic en un día, luego Shift+clic en otro para rango</span>
          </div>
        )}

        <div className="rest-calendar-legend">
          <span className="legend-item">
            <i className="swatch default" /> Tarifa general
          </span>
          <span className="legend-item">
            <i className="swatch special" /> Tarifa especial
          </span>
          <span className="legend-item">
            <i className="swatch blocked" /> Bloqueado
          </span>
          <span className="legend-item">
            <i className="swatch picked" /> Seleccionado
          </span>
        </div>

        {loadingRates ? (
          <p className="muted">Cargando calendario...</p>
        ) : (
          <div className="rest-calendar-grid">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
              <div key={d} className="rest-calendar-dow">
                {d}
              </div>
            ))}
            {calendarDays.map((cell, idx) => {
              if (!cell) return <div key={`e-${idx}`} className="rest-calendar-empty" />;
              const status = getDayStatus(cell.date, ratesByDate, defaultPerGuest);
              const isPicked = selectedDates.has(cell.date);
              return (
                <button
                  key={cell.date}
                  type="button"
                  className={`rest-calendar-day ${status.kind} ${isPicked ? 'picked' : ''} ${mode === 'general' ? 'readonly' : ''}`}
                  onClick={(e) => handleDayClick(cell.date, e.shiftKey)}
                  disabled={mode === 'general'}
                >
                  <span className="day-num">{cell.day}</span>
                  {status.kind === 'blocked' ? (
                    <span className="day-tag blocked">Cerrado</span>
                  ) : status.price != null && status.price > 0 ? (
                    <span className="day-price">{formatCopShort(status.price)}</span>
                  ) : null}
                  {status.label && status.kind === 'special' && (
                    <span className="day-tag">{status.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <aside className="rest-calendar-sidebar panel">
        {mode === 'general' && (
          <form className="form-panel" onSubmit={saveGeneralRates}>
            <h4>Tarifas generales</h4>
            <p className="muted small">
              Se aplican todos los días sin override. Las zonas pueden tener tarifas propias en
              la pestaña Zonas.
            </p>
            <label>
              Fee por reserva (COP)
              <input
                type="number"
                min={0}
                required
                value={generalForm.default_reservation_fee}
                onChange={(e) =>
                  setGeneralForm({ ...generalForm, default_reservation_fee: e.target.value })
                }
              />
            </label>
            <label>
              Precio por persona (COP)
              <input
                type="number"
                min={0}
                required
                value={generalForm.default_price_per_guest}
                onChange={(e) =>
                  setGeneralForm({ ...generalForm, default_price_per_guest: e.target.value })
                }
              />
            </label>
            <p className="muted small">
              Ejemplo 4 personas:{' '}
              {formatCop(
                Number(generalForm.default_reservation_fee || 0) +
                  Number(generalForm.default_price_per_guest || 0) * 4,
              )}
            </p>
            <button type="submit" className="btn-primary" disabled={saving}>
              Guardar tarifas generales
            </button>
          </form>
        )}

        {mode === 'special' && (
          <form className="form-panel" onSubmit={applySpecialRates}>
            <h4>Tarifa especial</h4>
            <p className="muted small">
              Selecciona varios días en el calendario y aplica precios de temporada alta u
              ocasiones especiales.
            </p>
            <label>
              Alcance
              <select
                value={specialForm.dining_zone_id}
                onChange={(e) =>
                  setSpecialForm({ ...specialForm, dining_zone_id: e.target.value })
                }
              >
                <option value="">Todo el restaurante</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Etiqueta (ej: Temporada alta)
              <input
                value={specialForm.label}
                onChange={(e) => setSpecialForm({ ...specialForm, label: e.target.value })}
              />
            </label>
            <label>
              Fee reserva override (COP)
              <input
                type="number"
                min={0}
                value={specialForm.reservation_fee_override}
                onChange={(e) =>
                  setSpecialForm({ ...specialForm, reservation_fee_override: e.target.value })
                }
              />
            </label>
            <label>
              Precio / persona override (COP)
              <input
                type="number"
                min={0}
                value={specialForm.price_per_guest_override}
                onChange={(e) =>
                  setSpecialForm({ ...specialForm, price_per_guest_override: e.target.value })
                }
              />
            </label>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !selectedDates.size}
            >
              Aplicar a {selectedDates.size || '…'} día(s)
            </button>
          </form>
        )}

        {mode === 'block' && (
          <div className="form-panel">
            <h4>Bloquear días</h4>
            <p className="muted small">
              Selecciona uno o varios días. No se podrán hacer reservas en esas fechas (evento
              privado, cierre, etc.).
            </p>
            <button
              type="button"
              className="btn-primary"
              disabled={saving || !selectedDates.size}
              onClick={applyBlockDays}
            >
              Bloquear {selectedDates.size || '…'} día(s)
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '0.75rem' }}
              disabled={saving || !selectedDates.size}
              onClick={unblockSelected}
            >
              Desbloquear selección
            </button>
          </div>
        )}
      </aside>

      <style jsx>{`
        .rest-calendar-layout {
          display: grid;
          grid-template-columns: 1fr minmax(280px, 340px);
          gap: 1rem;
          align-items: start;
        }
        @media (max-width: 960px) {
          .rest-calendar-layout {
            grid-template-columns: 1fr;
          }
        }
        .small {
          font-size: 0.85rem;
        }
        .rest-calendar-nav {
          display: flex;
          gap: 0.35rem;
        }
        .rest-calendar-modes {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 1rem 0;
        }
        .rest-calendar-selection-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          padding: 0.65rem 0.85rem;
          background: var(--surface-hover);
          border-radius: 8px;
          font-size: 0.9rem;
        }
        .rest-calendar-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .swatch {
          display: inline-block;
          width: 14px;
          height: 14px;
          border-radius: 4px;
          border: 1px solid #ddd;
        }
        .swatch.default {
          background: #fff;
        }
        .swatch.special {
          background: #fef9c3;
        }
        .swatch.blocked {
          background: #fee2e2;
        }
        .swatch.picked {
          background: #dbeafe;
          border-color: #2563eb;
        }
        .rest-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 0.35rem;
        }
        .rest-calendar-dow {
          text-align: center;
          font-size: 0.75rem;
          color: var(--text-muted);
          padding: 0.25rem;
        }
        .rest-calendar-empty {
          min-height: 72px;
        }
        .rest-calendar-day {
          min-height: 76px;
          padding: 0.35rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          cursor: pointer;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .rest-calendar-day.readonly {
          cursor: default;
        }
        .rest-calendar-day.special {
          background: #fef9c3;
        }
        .rest-calendar-day.blocked {
          background: #fee2e2;
        }
        .rest-calendar-day.picked {
          border: 2px solid #2563eb;
          box-shadow: 0 0 0 1px #2563eb33;
        }
        .day-num {
          font-weight: 600;
          font-size: 0.9rem;
        }
        .day-price {
          font-size: 0.72rem;
          font-weight: 600;
        }
        .day-tag {
          font-size: 0.65rem;
          color: #854d0e;
          line-height: 1.2;
        }
        .day-tag.blocked {
          color: #b91c1c;
        }
        .rest-calendar-sidebar h4 {
          margin: 0 0 0.5rem;
        }
      `}</style>
    </div>
  );
}
