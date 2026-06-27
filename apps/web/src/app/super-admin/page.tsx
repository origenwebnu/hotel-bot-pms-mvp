'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  superAdminApi,
  type PlatformStats,
  type PlatformHotel,
  type PlatformUser,
  type PlatformAdminUser,
  type SubscriptionPlan,
} from '@/lib/super-admin-api';
import { clearAuthSession } from '@/lib/api-core';
import { SuperAdminReservationsPanel } from '@/components/SuperAdminReservationsPanel';
import { AppShell } from '@/components/AppShell';
import { SUPER_ADMIN_NAV, SUPER_ADMIN_TAB_TITLES, buildSuperAdminPath, parseSuperAdminTab, type SuperAdminTab } from '@/lib/app-shell-nav';

export default function SuperAdminPage() {
  return (
    <Suspense fallback={<div className="loading">Cargando panel de plataforma...</div>}>
      <SuperAdminPageContent />
    </Suspense>
  );
}

function SuperAdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseSuperAdminTab(searchParams.get('tab'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [hotels, setHotels] = useState<PlatformHotel[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [admins, setAdmins] = useState<PlatformAdminUser[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [userName, setUserName] = useState('Super Admin');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const name = localStorage.getItem('user_name');
    if (name) setUserName(name);

    if (!token || role !== 'super_admin') {
      router.push('/');
      return;
    }

    loadData(tab).finally(() => setLoading(false));
  }, [router, tab]);

  async function loadData(activeTab: SuperAdminTab) {
    setError('');
    try {
      if (activeTab === 'overview') {
        setStats(await superAdminApi.getStats());
      } else if (activeTab === 'hotels') {
        setHotels(await superAdminApi.listHotels());
      } else if (activeTab === 'plans') {
        setPlans(await superAdminApi.listPlans());
      } else if (activeTab === 'reservations') {
        setHotels(await superAdminApi.listHotels());
      } else if (activeTab === 'users') {
        setUsers(await superAdminApi.listUsers());
      } else if (activeTab === 'admins') {
        setAdmins(await superAdminApi.listPlatformAdmins());
      } else if (activeTab === 'settings') {
        setSettings(await superAdminApi.getSettings());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
      if (err instanceof Error && err.message.includes('401')) {
        clearAuthSession();
        router.push('/');
      }
    }
  }

  function logout() {
    clearAuthSession();
    router.push('/');
  }

  if (loading && !stats && !hotels.length) {
    return <div className="loading">Cargando panel de plataforma...</div>;
  }

  return (
    <AppShell
      title={SUPER_ADMIN_TAB_TITLES[tab] ?? 'Super Admin'}
      subtitle={`Super Admin · ${userName}`}
      navItems={SUPER_ADMIN_NAV}
      activeId={tab}
      onNavigate={(id) =>
        router.replace(buildSuperAdminPath(id as SuperAdminTab), { scroll: false })
      }
      onLogout={logout}
    >
      {error && <div className="error-banner panel-error">{error}</div>}

      {tab === 'overview' && stats && <OverviewPanel stats={stats} />}
      {tab === 'hotels' && (
        <HotelsPanel
          hotels={hotels}
          plans={plans.length ? plans : undefined}
          onRefresh={() => loadData('hotels')}
        />
      )}
      {tab === 'plans' && (
        <PlansPanel plans={plans} onRefresh={() => loadData('plans')} />
      )}
      {tab === 'reservations' && <SuperAdminReservationsPanel hotels={hotels} />}
      {tab === 'users' && (
        <UsersPanel users={users} onRefresh={() => loadData('users')} />
      )}
      {tab === 'admins' && (
        <AdminsPanel admins={admins} onRefresh={() => loadData('admins')} />
      )}
      {tab === 'settings' && (
        <SettingsPanel settings={settings} onSaved={(s) => setSettings(s)} />
      )}

      <style jsx>{`
        .panel-error {
          margin-bottom: 1.5rem;
        }
      `}</style>
    </AppShell>
  );
}

function OverviewPanel({ stats }: { stats: PlatformStats }) {
  const cards = [
    { label: 'Hoteles', value: stats.hotels.total, sub: `${stats.hotels.active} activos` },
    { label: 'Usuarios', value: stats.users.total, sub: 'admins de hotel' },
    { label: 'Reservas', value: stats.reservations.total, sub: 'total histórico' },
    { label: 'Conversaciones', value: stats.conversations.total, sub: 'sesiones WhatsApp' },
    { label: 'Documentos KB', value: stats.knowledge_documents.total, sub: 'knowledge base' },
  ];

  return (
    <div className="admin-content">
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span className="stat-label">{c.label}</span>
            <strong className="stat-value">{c.value}</strong>
            <small>{c.sub}</small>
          </div>
        ))}
      </div>

      <section className="panel">
        <h2>Integraciones conectadas</h2>
        <div className="integration-row">
          <span className="badge ok">WhatsApp: {stats.integrations.whatsapp_connected}</span>
          <span className="badge ok">PMS: {stats.integrations.pms_connected}</span>
          <span className="badge ok">Pagos: {stats.integrations.payment_connected}</span>
        </div>
      </section>
    </div>
  );
}

function subscriptionLabel(hotel: PlatformHotel): string {
  const sub = hotel.subscription;
  if (!sub) return 'Sin suscripción';
  if (sub.status === 'trial') {
    return `Prueba ${sub.used}/${sub.limit}`;
  }
  if (sub.plan_name) {
    return `${sub.plan_name} (${sub.used}/${sub.limit})`;
  }
  const labels: Record<string, string> = {
    trial_expired: 'Prueba vencida',
    quota_reached: 'Cuota agotada',
    suspended: 'Suspendido',
    active: 'Activo',
  };
  return labels[sub.status] ?? sub.status;
}

function HotelsPanel({
  hotels,
  plans: plansProp,
  onRefresh,
}: {
  hotels: PlatformHotel[];
  plans?: SubscriptionPlan[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<PlatformHotel | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(plansProp ?? []);
  const [form, setForm] = useState({
    name: '',
    timezone: '',
    currency: '',
    is_active: true,
    plan_id: '' as string,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plansProp?.length) {
      setPlans(plansProp);
      return;
    }
    superAdminApi.listPlans().then(setPlans).catch(() => undefined);
  }, [plansProp]);

  function openEdit(hotel: PlatformHotel) {
    setEditing(hotel);
    setForm({
      name: hotel.name,
      timezone: hotel.timezone,
      currency: hotel.currency,
      is_active: hotel.is_active,
      plan_id: hotel.subscription?.plan_id ?? '',
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await superAdminApi.updateHotel(editing.id, {
        name: form.name,
        timezone: form.timezone,
        currency: form.currency,
        is_active: form.is_active,
      });
      const currentPlanId = editing.subscription?.plan_id ?? null;
      const nextPlanId = form.plan_id || null;
      if (nextPlanId !== currentPlanId) {
        await superAdminApi.assignHotelPlan(editing.id, nextPlanId);
      }
      setEditing(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function resetTrial() {
    if (!editing || !confirm('¿Reiniciar periodo de prueba de este hotel?')) return;
    setSaving(true);
    try {
      await superAdminApi.resetHotelTrial(editing.id);
      setEditing(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-content">
      <div className="panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Hotel</th>
              <th>Estado</th>
              <th>Suscripción</th>
              <th>Integraciones</th>
              <th>Actividad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hotels.map((h) => (
              <tr key={h.id}>
                <td>
                  <strong>{h.name}</strong>
                  <small>{h.slug}</small>
                </td>
                <td>
                  <span className={`pill ${h.is_active ? 'ok' : 'off'}`}>
                    {h.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <span
                    className={`pill ${
                      h.subscription?.status === 'active' ||
                      h.subscription?.status === 'trial'
                        ? 'ok'
                        : 'off'
                    }`}
                  >
                    {subscriptionLabel(h)}
                  </span>
                </td>
                <td>
                  <div className="mini-badges">
                    <span className={h.integration?.whatsapp_connected ? 'on' : 'off'}>WA</span>
                    <span className={h.integration?.pms_connected ? 'on' : 'off'}>PMS</span>
                    <span className={h.integration?.payment_connected ? 'on' : 'off'}>$</span>
                  </div>
                </td>
                <td>
                  {h.counts.reservations} res · {h.counts.conversations} conv
                </td>
                <td>
                  <button className="btn-sm" onClick={() => openEdit(h)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar hotel</h3>
            <label>
              Nombre
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Zona horaria
              <input
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </label>
            <label>
              Moneda
              <input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              Hotel activo
            </label>
            <label>
              Plan de suscripción
              <select
                value={form.plan_id}
                onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
              >
                <option value="">Sin plan (prueba vencida)</option>
                {plans
                  .filter((p) => p.is_active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — hasta {p.max_reservations_per_month} res/mes —{' '}
                      {new Intl.NumberFormat('es-CO', {
                        style: 'currency',
                        currency: p.currency,
                        maximumFractionDigits: 0,
                      }).format(p.price_monthly)}
                    </option>
                  ))}
              </select>
            </label>
            {editing.subscription?.status === 'trial' && (
              <p className="muted">
                Prueba: {editing.subscription.used}/{editing.subscription.limit}{' '}
                reservas
                {editing.subscription.trial_days_left != null &&
                  ` · ${editing.subscription.trial_days_left} días restantes`}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={resetTrial}
                disabled={saving}
              >
                Reiniciar prueba
              </button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={saving} onClick={save}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlansPanel({
  plans,
  onRefresh,
}: {
  plans: SubscriptionPlan[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState({
    name: '',
    max_reservations_per_month: 50,
    price_monthly: 190000,
    currency: 'COP',
    description: '',
    sort_order: 0,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openCreate() {
    setEditing(null);
    setForm({
      name: '',
      max_reservations_per_month: 50,
      price_monthly: 190000,
      currency: 'COP',
      description: '',
      sort_order: plans.length + 1,
      is_active: true,
    });
    setShowForm(true);
    setError('');
  }

  function openEdit(plan: SubscriptionPlan) {
    setEditing(plan);
    setForm({
      name: plan.name,
      max_reservations_per_month: plan.max_reservations_per_month,
      price_monthly: plan.price_monthly,
      currency: plan.currency,
      description: plan.description ?? '',
      sort_order: plan.sort_order,
      is_active: plan.is_active,
    });
    setShowForm(true);
    setError('');
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await superAdminApi.updatePlan(editing.id, {
          name: form.name,
          max_reservations_per_month: form.max_reservations_per_month,
          price_monthly: form.price_monthly,
          currency: form.currency,
          description: form.description,
          sort_order: form.sort_order,
          is_active: form.is_active,
        });
      } else {
        await superAdminApi.createPlan({
          name: form.name,
          max_reservations_per_month: form.max_reservations_per_month,
          price_monthly: form.price_monthly,
          currency: form.currency,
          description: form.description,
          sort_order: form.sort_order,
        });
      }
      setShowForm(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const formatCop = (amount: number, currency: string) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="admin-content">
      <div className="panel-header-row">
        <p>
          Cobra a los hoteles según reservas efectivas al mes. Cuando lleguen al
          límite, reciben un email para actualizar plan.
        </p>
        <button className="btn-primary" onClick={openCreate}>
          + Nuevo plan
        </button>
      </div>

      {showForm && (
        <form className="panel form-panel" onSubmit={savePlan}>
          <h3>{editing ? 'Editar plan' : 'Crear plan'}</h3>
          {error && <div className="error-banner">{error}</div>}
          <label>
            Nombre
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Plan 0-50 reservas"
            />
          </label>
          <label>
            Máximo reservas / mes
            <input
              type="number"
              min={1}
              required
              value={form.max_reservations_per_month}
              onChange={(e) =>
                setForm({
                  ...form,
                  max_reservations_per_month: parseInt(e.target.value, 10) || 1,
                })
              }
            />
          </label>
          <label>
            Precio mensual
            <input
              type="number"
              min={0}
              required
              value={form.price_monthly}
              onChange={(e) =>
                setForm({
                  ...form,
                  price_monthly: parseFloat(e.target.value) || 0,
                })
              }
            />
          </label>
          <label>
            Moneda
            <input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </label>
          <label>
            Descripción
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label>
            Orden
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) =>
                setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 0 })
              }
            />
          </label>
          {editing && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              Plan activo (visible para asignar)
            </label>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar plan'}
            </button>
          </div>
        </form>
      )}

      <div className="panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Reservas/mes</th>
              <th>Precio</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  {p.description && <small>{p.description}</small>}
                </td>
                <td>{p.max_reservations_per_month}</td>
                <td>{formatCop(p.price_monthly, p.currency)}/mes</td>
                <td>
                  <span className={`pill ${p.is_active ? 'ok' : 'off'}`}>
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <button className="btn-sm" onClick={() => openEdit(p)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersPanel({
  users,
  onRefresh,
}: {
  users: PlatformUser[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [role, setRole] = useState('owner');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await superAdminApi.updateUser(editing.id, { role });
      setEditing(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-content">
      <div className="panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Hotel</th>
              <th>Rol</th>
              <th>Registro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </td>
                <td>
                  {u.hotel.name}
                  {!u.hotel.is_active && (
                    <span className="pill off"> hotel inactivo</span>
                  )}
                </td>
                <td>{u.role}</td>
                <td>{new Date(u.created_at).toLocaleDateString('es-CO')}</td>
                <td>
                  <button
                    className="btn-sm"
                    onClick={() => {
                      setEditing(u);
                      setRole(u.role);
                    }}
                  >
                    Rol
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Cambiar rol — {editing.name}</h3>
            <label>
              Rol
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="staff">staff</option>
              </select>
            </label>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={saving} onClick={save}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminsPanel({
  admins,
  onRefresh,
}: {
  admins: PlatformAdminUser[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await superAdminApi.createPlatformAdmin(form);
      setShowForm(false);
      setForm({ email: '', password: '', name: '' });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(admin: PlatformAdminUser) {
    await superAdminApi.updatePlatformAdmin(admin.id, {
      is_active: !admin.is_active,
    });
    onRefresh();
  }

  return (
    <div className="admin-content">
      <div className="panel-header-row">
        <p>Gestiona quién puede administrar toda la plataforma BookiChat.</p>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nuevo super admin'}
        </button>
      </div>

      {showForm && (
        <form className="panel form-panel" onSubmit={createAdmin}>
          <h3>Crear super administrador</h3>
          {error && <div className="error-banner">{error}</div>}
          <label>
            Nombre
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </form>
      )}

      <div className="panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.email}</td>
                <td>
                  <span className={`pill ${a.is_active ? 'ok' : 'off'}`}>
                    {a.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <button className="btn-sm" onClick={() => toggleActive(a)}>
                    {a.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SETTING_LABELS: Record<string, string> = {
  platform_name: 'Nombre de la plataforma',
  support_email: 'Email de soporte',
  registration_enabled: 'Registro de hoteles habilitado (true/false)',
  default_timezone: 'Zona horaria por defecto',
  default_currency: 'Moneda por defecto',
  whatsapp_verify_token: 'Token de verificación WhatsApp (webhook)',
  maintenance_mode: 'Modo mantenimiento (true/false)',
  trial_duration_days: 'Días de periodo de prueba por hotel',
  trial_reservation_limit: 'Límite de reservas efectivas en prueba',
};

function SettingsPanel({
  settings,
  onSaved,
}: {
  settings: Record<string, string>;
  onSaved: (s: Record<string, string>) => void;
}) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const updated = await superAdminApi.updateSettings(form);
      onSaved(updated);
      setMessage('Configuración guardada correctamente');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-content">
      <form className="panel form-panel" onSubmit={save}>
        <h2>Parámetros globales</h2>
        <p className="muted">
          Estos valores aplican a toda la plataforma. Algunos (como el token de
          WhatsApp) requieren reiniciar la API para surtir efecto en el servidor.
        </p>

        {Object.entries(SETTING_LABELS).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}

        {message && (
          <div
            className={
              message.includes('Error') ? 'error-banner' : 'info-banner'
            }
          >
            {message}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar parametrización'}
        </button>
      </form>
    </div>
  );
}
