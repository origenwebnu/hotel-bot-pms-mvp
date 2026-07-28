'use client';

import {
  DEFAULT_SERVICE_HOURS,
  SERVICE_HOURS_DAY_LABELS,
  SERVICE_HOURS_DAY_ORDER,
  type ServiceHoursDay,
  type ServiceHoursMap,
} from '@hotel-bot/shared';

interface Props {
  value: ServiceHoursMap;
  onChange: (value: ServiceHoursMap) => void;
}

function formatTime12h(time: string) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function ServiceHoursSettings({ value, onChange }: Props) {
  const hours = { ...DEFAULT_SERVICE_HOURS, ...value };
  const monday = hours.mon ?? DEFAULT_SERVICE_HOURS.mon;
  const allSame = SERVICE_HOURS_DAY_ORDER.every((key) => {
    const day = hours[key];
    if (!day || day.closed) return false;
    return day.open === monday.open && day.close === monday.close;
  });

  function updateDay(key: string, patch: Partial<ServiceHoursDay>) {
    onChange({
      ...hours,
      [key]: { ...hours[key], ...patch },
    });
  }

  function applyToAll(open: string, close: string) {
    const next: ServiceHoursMap = { ...hours };
    for (const key of SERVICE_HOURS_DAY_ORDER) {
      const day = hours[key];
      if (day?.closed) continue;
      next[key] = { open, close };
    }
    onChange(next);
  }

  return (
    <div className="service-hours">
      <h4>Horarios de reserva</h4>
      <p className="muted small">
        Define en qué horario los clientes pueden elegir mesa por WhatsApp. Ejemplo: 2:00 pm – 10:00
        pm.
      </p>

      {allSame && !monday.closed && (
        <div className="service-hours-unified">
          <label>
            Desde
            <input
              type="time"
              value={monday.open}
              onChange={(e) => applyToAll(e.target.value, monday.close)}
            />
          </label>
          <label>
            Hasta
            <input
              type="time"
              value={monday.close}
              onChange={(e) => applyToAll(monday.open, e.target.value)}
            />
          </label>
          <p className="muted small">
            Aplica a todos los días abiertos ({formatTime12h(monday.open)} –{' '}
            {formatTime12h(monday.close)}).
          </p>
        </div>
      )}

      <div className="service-hours-days">
        {SERVICE_HOURS_DAY_ORDER.map((key) => {
          const day = hours[key] ?? DEFAULT_SERVICE_HOURS[key];
          return (
            <div key={key} className={`service-hours-row ${day.closed ? 'closed' : ''}`}>
              <span className="service-hours-day">{SERVICE_HOURS_DAY_LABELS[key]}</span>
              <label className="service-hours-closed">
                <input
                  type="checkbox"
                  checked={Boolean(day.closed)}
                  onChange={(e) =>
                    updateDay(key, e.target.checked ? { closed: true } : { closed: false })
                  }
                />
                Cerrado
              </label>
              {!day.closed && (
                <>
                  <label>
                    Desde
                    <input
                      type="time"
                      value={day.open}
                      onChange={(e) => updateDay(key, { open: e.target.value })}
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      type="time"
                      value={day.close}
                      onChange={(e) => updateDay(key, { close: e.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .service-hours {
          margin: 1.25rem 0;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
        }
        .service-hours h4 {
          margin: 0 0 0.35rem;
        }
        .small {
          font-size: 0.85rem;
        }
        .service-hours-unified {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin: 1rem 0;
          padding: 1rem;
          border-radius: 10px;
          background: var(--surface-hover, #f8fafc);
        }
        @media (max-width: 560px) {
          .service-hours-unified {
            grid-template-columns: 1fr;
          }
        }
        .service-hours-days {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .service-hours-row {
          display: grid;
          grid-template-columns: 100px 90px 1fr 1fr;
          gap: 0.75rem;
          align-items: end;
          padding: 0.65rem 0;
          border-bottom: 1px solid var(--border);
        }
        .service-hours-row.closed {
          opacity: 0.65;
        }
        .service-hours-day {
          font-weight: 600;
          padding-bottom: 0.5rem;
        }
        .service-hours-closed {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.85rem;
          padding-bottom: 0.5rem;
        }
        @media (max-width: 720px) {
          .service-hours-row {
            grid-template-columns: 1fr 1fr;
          }
          .service-hours-day {
            grid-column: 1 / -1;
            padding-bottom: 0;
          }
          .service-hours-closed {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </div>
  );
}
