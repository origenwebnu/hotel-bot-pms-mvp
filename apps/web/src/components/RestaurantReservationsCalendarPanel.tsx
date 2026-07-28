'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RESTAURANT_OCCASION_LABELS,
  RESTAURANT_OCCASIONS,
  type RestaurantOccasion,
} from '@hotel-bot/shared';
import {
  api,
  type ReservationHistoryItem,
  type RestaurantAddOn,
  type RestaurantQuote,
} from '@/lib/api';

function formatCop(amount: number, currency = 'COP') {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+57 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return phone;
}

function ReceiptIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
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

type PanelMode = 'view' | 'manual';

const emptyManualForm = {
  booking_time: '',
  party_size: '2',
  dining_zone_id: '',
  occasion_type: 'other' as RestaurantOccasion,
  guest_first_name: '',
  guest_last_name: '',
  guest_phone: '',
  special_requests: '',
  addon_ids: [] as string[],
};

export function RestaurantReservationsCalendarPanel() {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [reservations, setReservations] = useState<ReservationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [mode, setMode] = useState<PanelMode>('view');
  const [saving, setSaving] = useState(false);

  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [zones, setZones] = useState<Array<{ id: string; name: string; quote?: RestaurantQuote }>>(
    [],
  );
  const [addons, setAddons] = useState<RestaurantAddOn[]>([]);
  const [quote, setQuote] = useState<RestaurantQuote | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [manualForm, setManualForm] = useState(emptyManualForm);

  const monthMeta = useMemo(() => monthRange(monthDate), [monthDate]);
  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);

  const reservationsByDate = useMemo(() => {
    const map = new Map<string, ReservationHistoryItem[]>();
    for (const item of reservations) {
      if (!item.booking_date) continue;
      const list = map.get(item.booking_date) ?? [];
      list.push(item);
      map.set(item.booking_date, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.booking_time ?? '').localeCompare(b.booking_time ?? ''));
    }
    return map;
  }, [reservations]);

  const selectedDayReservations = selectedDate
    ? (reservationsByDate.get(selectedDate) ?? [])
    : [];

  const loadReservations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listReservations({
        outcome: 'approved',
        booking_kind: 'restaurant_table',
        booking_from: monthMeta.from,
        booking_to: monthMeta.to,
        limit: 200,
      });
      setReservations(result.items);
    } catch {
      setMessage('Error cargando reservas del calendario');
    } finally {
      setLoading(false);
    }
  }, [monthMeta.from, monthMeta.to]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    api.listRestaurantAddOns().then(setAddons).catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== 'manual' || !selectedDate) return;

    setLoadingAvailability(true);
    Promise.all([
      api.listRestaurantAvailabilitySlots(selectedDate, true),
      api.listRestaurantZones(),
    ])
      .then(([slots, allZones]) => {
        setTimeSlots(slots);
        setZones(allZones.filter((z) => z.is_active).map((z) => ({ id: z.id, name: z.name })));
        if (slots.length && !manualForm.booking_time) {
          setManualForm((prev) => ({ ...prev, booking_time: slots[0] }));
        }
      })
      .catch(() => setMessage('Error cargando disponibilidad'))
      .finally(() => setLoadingAvailability(false));
  }, [mode, selectedDate]);

  useEffect(() => {
    if (
      mode !== 'manual' ||
      !selectedDate ||
      !manualForm.booking_time ||
      !manualForm.party_size ||
      !manualForm.dining_zone_id
    ) {
      setQuote(null);
      return;
    }

    const partySize = Number(manualForm.party_size);
    if (!partySize) return;

    api
      .listRestaurantAvailabilityZones({
        date: selectedDate,
        time: manualForm.booking_time,
        party_size: partySize,
        for_manual: true,
      })
      .then((available) => {
        setZones(
          available.map((z) => ({
            id: z.id,
            name: z.name,
            quote: z.quote,
          })),
        );
      })
      .catch(() => {});

    api
      .buildRestaurantQuote({
        dining_zone_id: manualForm.dining_zone_id,
        date: selectedDate,
        time: manualForm.booking_time,
        party_size: partySize,
        addon_ids: manualForm.addon_ids,
      })
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [
    mode,
    selectedDate,
    manualForm.booking_time,
    manualForm.party_size,
    manualForm.dining_zone_id,
    manualForm.addon_ids,
  ]);

  function selectDate(date: string) {
    setSelectedDate(date);
    if (mode === 'manual') {
      setMode('view');
      setManualForm(emptyManualForm);
    }
  }

  function clearSelection() {
    setSelectedDate(null);
    setMode('view');
    setManualForm(emptyManualForm);
  }

  function startManualBooking() {
    if (!selectedDate) {
      setMessage('Selecciona un día en el calendario.');
      return;
    }
    setMode('manual');
    setManualForm(emptyManualForm);
    setMessage('');
  }

  async function submitManualReservation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDate) return;

    setSaving(true);
    setMessage('');
    try {
      await api.createManualRestaurantReservation({
        booking_date: selectedDate,
        booking_time: manualForm.booking_time,
        party_size: Number(manualForm.party_size),
        dining_zone_id: manualForm.dining_zone_id,
        occasion_type: manualForm.occasion_type,
        guest_first_name: manualForm.guest_first_name,
        guest_last_name: manualForm.guest_last_name || undefined,
        guest_phone: manualForm.guest_phone || undefined,
        special_requests: manualForm.special_requests || undefined,
        addon_ids: manualForm.addon_ids.length ? manualForm.addon_ids : undefined,
      });
      setMessage('Reserva manual creada y confirmada.');
      setMode('view');
      setManualForm(emptyManualForm);
      await loadReservations();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al crear la reserva');
    } finally {
      setSaving(false);
    }
  }

  function toggleAddon(id: string) {
    setManualForm((prev) => ({
      ...prev,
      addon_ids: prev.addon_ids.includes(id)
        ? prev.addon_ids.filter((x) => x !== id)
        : [...prev.addon_ids, id],
    }));
  }

  return (
    <div className="rest-res-calendar-layout">
      <div className="rest-res-calendar-main panel">
        <div className="panel-header-row">
          <div>
            <h3>Calendario de reservas — {monthMeta.label}</h3>
            <p className="muted small">Reservas confirmadas (aprobadas) por fecha de servicio</p>
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

        <div className="rest-calendar-selection-bar">
          <span>
            {selectedDate
              ? `Día seleccionado: ${selectedDate}`
              : 'Selecciona un día para ver sus reservas'}
          </span>
          <button type="button" className="btn-primary" onClick={startManualBooking}>
            + Reserva manual
          </button>
          {selectedDate && (
            <button type="button" className="btn-secondary" onClick={clearSelection}>
              Limpiar
            </button>
          )}
        </div>

        {message && (
          <div className={message.includes('Error') ? 'error-banner' : 'info-banner'}>{message}</div>
        )}

        {loading ? (
          <p className="muted">Cargando reservas...</p>
        ) : (
          <div className="rest-calendar-grid">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
              <div key={d} className="rest-calendar-dow">
                {d}
              </div>
            ))}
            {calendarDays.map((cell, idx) => {
              if (!cell) return <div key={`e-${idx}`} className="rest-calendar-empty" />;
              const dayRes = reservationsByDate.get(cell.date) ?? [];
              const isPicked = selectedDate === cell.date;
              const hasReservations = dayRes.length > 0;
              return (
                <button
                  key={cell.date}
                  type="button"
                  className={`rest-calendar-day ${hasReservations ? 'has-res' : ''} ${isPicked ? 'picked' : ''}`}
                  onClick={() => selectDate(cell.date)}
                >
                  <span className="day-num">{cell.day}</span>
                  {hasReservations && (
                    <>
                      <span className="day-count">{dayRes.length} reserva{dayRes.length !== 1 ? 's' : ''}</span>
                      <span className="day-preview">
                        {dayRes.slice(0, 2).map((r) => r.booking_time).join(' · ')}
                        {dayRes.length > 2 ? '…' : ''}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <aside className="rest-res-calendar-sidebar panel">
        {mode === 'view' && (
          <div className="form-panel">
            <h4>
              {selectedDate
                ? `Reservas del ${selectedDate}`
                : 'Selecciona un día'}
            </h4>
            {!selectedDate && (
              <p className="muted small">
                Haz clic en un día del calendario para ver las reservas confirmadas o crear una
                reserva manual.
              </p>
            )}
            {selectedDate && selectedDayReservations.length === 0 && (
              <p className="muted small">Sin reservas confirmadas este día.</p>
            )}
            {selectedDayReservations.map((r) => (
              <div key={r.id} className="res-card">
                <div className="res-card-header">
                  <div className="res-card-time">{r.booking_time}</div>
                  {r.receipt_url && (
                    <a
                      href={r.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="res-receipt-link"
                      title="Ver recibo de pago"
                      aria-label={`Ver recibo de pago de ${r.guest.full_name ?? 'reserva'}`}
                    >
                      <ReceiptIcon />
                    </a>
                  )}
                </div>
                <div className="res-card-guest">{r.guest.full_name ?? 'Sin nombre'}</div>
                {r.guest.whatsapp && (
                  <div className="res-card-phone">{formatPhone(r.guest.whatsapp)}</div>
                )}
                <div className="res-card-meta">
                  {r.party_size} pax · {r.dining_zone_name ?? 'Mesa'}
                </div>
                {r.special_requests && (
                  <div className="res-card-requests">{r.special_requests}</div>
                )}
                {r.total_amount != null && (
                  <div className="res-card-total">
                    {formatCop(r.total_amount, r.currency ?? 'COP')}
                  </div>
                )}
              </div>
            ))}
            {selectedDate && (
              <button type="button" className="btn-primary" onClick={startManualBooking}>
                Agregar reserva manual
              </button>
            )}
          </div>
        )}

        {mode === 'manual' && selectedDate && (
          <form className="form-panel" onSubmit={submitManualReservation}>
            <h4>Nueva reserva — {selectedDate}</h4>
            <p className="muted small">
              La reserva se confirma de inmediato (sin cobro por WhatsApp).
            </p>

            {loadingAvailability ? (
              <p className="muted">Cargando horarios...</p>
            ) : (
              <>
                <label>
                  Hora
                  <select
                    required
                    value={manualForm.booking_time}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, booking_time: e.target.value, dining_zone_id: '' })
                    }
                  >
                    <option value="">Selecciona</option>
                    {timeSlots.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Personas
                  <input
                    type="number"
                    min={1}
                    required
                    value={manualForm.party_size}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, party_size: e.target.value, dining_zone_id: '' })
                    }
                  />
                </label>
                <label>
                  Zona / ambiente
                  <select
                    required
                    value={manualForm.dining_zone_id}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, dining_zone_id: e.target.value })
                    }
                  >
                    <option value="">Selecciona</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                        {z.quote ? ` — ${formatCop(z.quote.total, z.quote.currency)}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ocasión
                  <select
                    value={manualForm.occasion_type}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        occasion_type: e.target.value as RestaurantOccasion,
                      })
                    }
                  >
                    {RESTAURANT_OCCASIONS.map((o) => (
                      <option key={o} value={o}>
                        {RESTAURANT_OCCASION_LABELS[o]}
                      </option>
                    ))}
                  </select>
                </label>
                {addons.filter((a) => a.is_active).length > 0 && (
                  <fieldset className="addon-fieldset">
                    <legend>Adicionales</legend>
                    {addons
                      .filter((a) => a.is_active)
                      .map((a) => (
                        <label key={a.id} className="addon-check">
                          <input
                            type="checkbox"
                            checked={manualForm.addon_ids.includes(a.id)}
                            onChange={() => toggleAddon(a.id)}
                          />
                          {a.name} ({formatCop(a.price, a.currency)})
                        </label>
                      ))}
                  </fieldset>
                )}
                <label>
                  Nombre
                  <input
                    required
                    value={manualForm.guest_first_name}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, guest_first_name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Apellido
                  <input
                    value={manualForm.guest_last_name}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, guest_last_name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Teléfono (opcional)
                  <input
                    value={manualForm.guest_phone}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, guest_phone: e.target.value })
                    }
                  />
                </label>
                <label>
                  Notas / solicitudes
                  <textarea
                    rows={2}
                    value={manualForm.special_requests}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, special_requests: e.target.value })
                    }
                  />
                </label>
                {quote && (
                  <p className="quote-preview">
                    Total estimado: <strong>{formatCop(quote.total, quote.currency)}</strong>
                  </p>
                )}
                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={saving}>
                    Confirmar reserva
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setMode('view')}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </aside>

      <style jsx>{`
        .rest-res-calendar-layout {
          display: grid;
          grid-template-columns: 1fr minmax(300px, 360px);
          gap: 1rem;
          align-items: start;
        }
        @media (max-width: 960px) {
          .rest-res-calendar-layout {
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
        .rest-calendar-selection-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          margin: 1rem 0;
          padding: 0.65rem 0.85rem;
          background: var(--surface-hover);
          border-radius: 8px;
          font-size: 0.9rem;
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
          min-height: 80px;
        }
        .rest-calendar-day {
          min-height: 84px;
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
        .rest-calendar-day.has-res {
          background: #ecfdf5;
          border-color: #6ee7b7;
        }
        .rest-calendar-day.picked {
          border: 2px solid #2563eb;
          box-shadow: 0 0 0 1px #2563eb33;
        }
        .day-num {
          font-weight: 600;
          font-size: 0.9rem;
        }
        .day-count {
          font-size: 0.72rem;
          font-weight: 600;
          color: #047857;
        }
        .day-preview {
          font-size: 0.65rem;
          color: var(--text-muted);
          line-height: 1.2;
        }
        .res-card {
          padding: 0.65rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-bottom: 0.5rem;
          background: var(--surface-hover);
        }
        .res-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .res-card-time {
          font-weight: 700;
          font-size: 1rem;
        }
        .res-receipt-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          color: #2563eb;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .res-receipt-link:hover {
          background: #2563eb;
          color: #fff;
        }
        .res-card-guest {
          font-weight: 600;
          margin-top: 0.15rem;
        }
        .res-card-phone {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-top: 0.1rem;
        }
        .res-card-meta {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-top: 0.15rem;
        }
        .res-card-requests {
          margin-top: 0.35rem;
          font-size: 0.82rem;
          color: #0369a1;
          line-height: 1.35;
        }
        .res-card-total {
          font-size: 0.85rem;
          margin-top: 0.25rem;
        }
        .addon-fieldset {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          margin: 0;
        }
        .addon-fieldset legend {
          font-size: 0.85rem;
          padding: 0 0.25rem;
        }
        .addon-check {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          margin: 0.35rem 0;
        }
        .quote-preview {
          font-size: 0.9rem;
          margin: 0.5rem 0;
        }
        .form-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.5rem;
        }
        .rest-res-calendar-sidebar h4 {
          margin: 0 0 0.5rem;
        }
      `}</style>
    </div>
  );
}
