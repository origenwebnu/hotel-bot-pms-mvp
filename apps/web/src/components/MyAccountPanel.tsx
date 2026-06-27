'use client';

import { useEffect, useState } from 'react';
import {
  api,
  type BillingHistoryItem,
  type Hotel,
  type HotelSubscription,
  type UserProfile,
} from '@/lib/api';

const TIMEZONES = [
  { value: 'America/Bogota', label: 'Bogotá (Colombia)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México' },
  { value: 'America/Lima', label: 'Lima (Perú)' },
  { value: 'America/Santiago', label: 'Santiago (Chile)' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (Argentina)' },
  { value: 'America/New_York', label: 'Nueva York (EE.UU.)' },
  { value: 'Europe/Madrid', label: 'Madrid (España)' },
];

const CURRENCIES = [
  { value: 'COP', label: 'COP — Peso colombiano' },
  { value: 'USD', label: 'USD — Dólar estadounidense' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'MXN', label: 'MXN — Peso mexicano' },
];

interface Props {
  hotel: Hotel;
  subscription: HotelSubscription | null;
  onHotelUpdate: (hotel: Hotel) => void;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPeriodMonth(periodMonth: string) {
  if (periodMonth === 'trial') return 'Periodo de prueba';
  const [year, month] = periodMonth.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

function paymentStatusLabel(status: BillingHistoryItem['status']) {
  switch (status) {
    case 'paid':
      return 'Pagado';
    case 'pending':
      return 'Pendiente';
    case 'failed':
      return 'Fallido';
    case 'waived':
      return 'Exento';
    case 'trial':
      return 'Gratis';
    default:
      return status;
  }
}

function paymentStatusClass(status: BillingHistoryItem['status']) {
  switch (status) {
    case 'paid':
    case 'trial':
      return 'ok';
    case 'pending':
      return 'warn';
    case 'failed':
      return 'off';
    default:
      return 'off';
  }
}

function subscriptionStatusLabel(sub: HotelSubscription) {
  switch (sub.status) {
    case 'trial':
      return 'Periodo de prueba';
    case 'active':
      return 'Plan activo';
    case 'quota_reached':
      return 'Límite alcanzado';
    case 'trial_expired':
      return 'Prueba finalizada';
    case 'suspended':
      return 'Suspendido';
    default:
      return sub.status;
  }
}

function subscriptionStatusClass(sub: HotelSubscription) {
  if (sub.status === 'active' || sub.status === 'trial') return 'ok';
  if (sub.status === 'quota_reached') return 'warn';
  return 'off';
}

export function MyAccountPanel({ hotel, subscription, onHotelUpdate }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [billing, setBilling] = useState<BillingHistoryItem[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(true);

  const [hotelForm, setHotelForm] = useState({
    name: hotel.name,
    timezone: hotel.timezone ?? 'America/Bogota',
    currency: hotel.currency ?? 'COP',
  });
  const [profileForm, setProfileForm] = useState({ name: '' });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [savingHotel, setSavingHotel] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setHotelForm({
      name: hotel.name,
      timezone: hotel.timezone ?? 'America/Bogota',
      currency: hotel.currency ?? 'COP',
    });
  }, [hotel]);

  useEffect(() => {
    api
      .getProfile()
      .then((p) => {
        setProfile(p);
        setProfileForm({ name: p.name });
      })
      .catch(() => setMessage('Error cargando perfil'));

    api
      .getBillingHistory()
      .then((res) => setBilling(res.items))
      .catch(() => setMessage('Error cargando historial de pagos'))
      .finally(() => setLoadingBilling(false));
  }, []);

  async function handleSaveHotel(e: React.FormEvent) {
    e.preventDefault();
    setSavingHotel(true);
    setMessage('');
    try {
      const updated = await api.updateHotel({
        name: hotelForm.name.trim(),
        timezone: hotelForm.timezone,
        currency: hotelForm.currency,
      });
      onHotelUpdate({ ...hotel, ...updated });
      setMessage('Datos del hotel actualizados.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSavingHotel(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setMessage('');
    try {
      const updated = await api.updateProfile({ name: profileForm.name.trim() });
      setProfile(updated);
      setMessage('Perfil actualizado.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setMessage('Las contraseñas nuevas no coinciden');
      return;
    }
    setSavingPassword(true);
    setMessage('');
    try {
      await api.updatePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setMessage('Contraseña actualizada correctamente.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al cambiar contraseña');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="account-panel">
      {message && (
        <div className={message.includes('Error') ? 'error-banner' : 'info-banner'}>
          {message}
        </div>
      )}

      <div className="account-grid">
        <section className="panel account-section">
          <h2>Datos del hotel</h2>
          <p className="muted">Información general que usa el bot y el panel.</p>
          <form className="form-panel" onSubmit={handleSaveHotel}>
            <label>
              Nombre del hotel
              <input
                value={hotelForm.name}
                onChange={(e) => setHotelForm((f) => ({ ...f, name: e.target.value }))}
                required
                minLength={2}
              />
            </label>
            <label>
              Zona horaria
              <select
                value={hotelForm.timezone}
                onChange={(e) => setHotelForm((f) => ({ ...f, timezone: e.target.value }))}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Moneda
              <select
                value={hotelForm.currency}
                onChange={(e) => setHotelForm((f) => ({ ...f, currency: e.target.value }))}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted account-slug">Identificador: {hotel.slug}</p>
            <button type="submit" className="btn-primary" disabled={savingHotel}>
              {savingHotel ? 'Guardando…' : 'Guardar datos del hotel'}
            </button>
          </form>
        </section>

        <section className="panel account-section">
          <h2>Mi acceso</h2>
          <p className="muted">Tu cuenta de administrador del hotel.</p>
          <form className="form-panel" onSubmit={handleSaveProfile}>
            <label>
              Nombre
              <input
                value={profileForm.name}
                onChange={(e) => setProfileForm({ name: e.target.value })}
                required
                minLength={2}
              />
            </label>
            <label>
              Email
              <input value={profile?.email ?? ''} readOnly disabled />
            </label>
            <button type="submit" className="btn-primary" disabled={savingProfile}>
              {savingProfile ? 'Guardando…' : 'Guardar perfil'}
            </button>
          </form>

          <hr className="account-divider" />

          <h3>Cambiar contraseña</h3>
          <form className="form-panel" onSubmit={handleSavePassword}>
            <label>
              Contraseña actual
              <input
                type="password"
                value={passwordForm.current_password}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, current_password: e.target.value }))
                }
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              Nueva contraseña
              <input
                type="password"
                value={passwordForm.new_password}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, new_password: e.target.value }))
                }
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirmar nueva contraseña
              <input
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) =>
                  setPasswordForm((f) => ({ ...f, confirm_password: e.target.value }))
                }
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={savingPassword}>
              {savingPassword ? 'Actualizando…' : 'Cambiar contraseña'}
            </button>
          </form>
        </section>
      </div>

      {subscription && (
        <section className="panel account-section account-plan">
          <div className="panel-header-row">
            <div>
              <h2>Estado del plan</h2>
              <p className="muted">Tu suscripción a BookiChat.</p>
            </div>
            <span className={`pill ${subscriptionStatusClass(subscription)}`}>
              {subscriptionStatusLabel(subscription)}
            </span>
          </div>

          <div className="plan-status-grid">
            {subscription.status === 'trial' && (
              <>
                <div className="plan-stat">
                  <span className="plan-stat-label">Reservas usadas</span>
                  <strong>
                    {subscription.used} / {subscription.limit}
                  </strong>
                </div>
                <div className="plan-stat">
                  <span className="plan-stat-label">Días restantes</span>
                  <strong>{subscription.trial_days_left ?? 0}</strong>
                </div>
                {subscription.trial_ends_at && (
                  <div className="plan-stat">
                    <span className="plan-stat-label">Finaliza</span>
                    <strong>
                      {new Date(subscription.trial_ends_at).toLocaleDateString('es-CO')}
                    </strong>
                  </div>
                )}
              </>
            )}

            {subscription.plan_name && (
              <>
                <div className="plan-stat">
                  <span className="plan-stat-label">Plan</span>
                  <strong>{subscription.plan_name}</strong>
                </div>
                {subscription.plan_price_monthly != null && (
                  <div className="plan-stat">
                    <span className="plan-stat-label">Precio mensual</span>
                    <strong>
                      {formatMoney(
                        subscription.plan_price_monthly,
                        subscription.plan_currency ?? 'COP',
                      )}
                    </strong>
                  </div>
                )}
                <div className="plan-stat">
                  <span className="plan-stat-label">Uso este mes</span>
                  <strong>
                    {subscription.used} / {subscription.limit} reservas
                  </strong>
                </div>
                {subscription.period_month && (
                  <div className="plan-stat">
                    <span className="plan-stat-label">Periodo</span>
                    <strong>{formatPeriodMonth(subscription.period_month)}</strong>
                  </div>
                )}
              </>
            )}

            {!subscription.plan_name && subscription.status === 'trial_expired' && (
              <p className="muted">
                Tu periodo de prueba finalizó. Contacta a soporte BookiChat para activar un
                plan.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="panel account-section">
        <h2>Histórico de pagos</h2>
        <p className="muted">Facturación de tu suscripción BookiChat.</p>

        {loadingBilling ? (
          <p className="muted">Cargando historial…</p>
        ) : billing.length === 0 ? (
          <p className="muted">
            Aún no hay pagos registrados. Cuando actives un plan, verás aquí el detalle de
            cada periodo.
          </p>
        ) : (
          <div className="account-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Plan</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {billing.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{formatPeriodMonth(item.period_month)}</strong>
                      {item.description && <small>{item.description}</small>}
                    </td>
                    <td>{item.plan_name ?? '—'}</td>
                    <td>
                      {item.status === 'trial'
                        ? 'Gratis'
                        : formatMoney(item.amount, item.currency)}
                    </td>
                    <td>
                      <span className={`pill ${paymentStatusClass(item.status)}`}>
                        {paymentStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      {item.paid_at
                        ? new Date(item.paid_at).toLocaleDateString('es-CO')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
