'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  superAdminApi,
  type PlatformStats,
  type PlatformHotel,
  type PlatformUser,
  type PlatformAdminUser,
} from '@/lib/super-admin-api';
import { clearAuthSession } from '@/lib/api-core';

type Tab = 'overview' | 'hotels' | 'users' | 'admins' | 'settings';

export default function SuperAdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [hotels, setHotels] = useState<PlatformHotel[]>([]);
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

  async function loadData(activeTab: Tab) {
    setError('');
    try {
      if (activeTab === 'overview') {
        setStats(await superAdminApi.getStats());
      } else if (activeTab === 'hotels') {
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
    <div className="dashboard super-admin">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span>🛡️</span>
          <div>
            <strong>BookiChat</strong>
            <small>Super Admin</small>
          </div>
        </div>
        <nav>
          <button
            className={tab === 'overview' ? 'active' : ''}
            onClick={() => setTab('overview')}
          >
            📊 Resumen
          </button>
          <button
            className={tab === 'hotels' ? 'active' : ''}
            onClick={() => setTab('hotels')}
          >
            🏨 Hoteles
          </button>
          <button
            className={tab === 'users' ? 'active' : ''}
            onClick={() => setTab('users')}
          >
            👥 Usuarios
          </button>
          <button
            className={tab === 'admins' ? 'active' : ''}
            onClick={() => setTab('admins')}
          >
            🔐 Super Admins
          </button>
          <button
            className={tab === 'settings' ? 'active' : ''}
            onClick={() => setTab('settings')}
          >
            ⚙️ Parametrización
          </button>
        </nav>
        <div className="sidebar-user">
          <small>{userName}</small>
        </div>
        <button className="logout-btn" onClick={logout}>
          Cerrar sesión
        </button>
      </aside>

      <main className="main">
        <header className="main-header">
          <h1>
            {tab === 'overview' && 'Resumen de la plataforma'}
            {tab === 'hotels' && 'Gestión de hoteles'}
            {tab === 'users' && 'Usuarios de hoteles'}
            {tab === 'admins' && 'Super administradores'}
            {tab === 'settings' && 'Parametrización global'}
          </h1>
        </header>

        {error && <div className="error-banner panel-error">{error}</div>}

        {tab === 'overview' && stats && <OverviewPanel stats={stats} />}
        {tab === 'hotels' && (
          <HotelsPanel hotels={hotels} onRefresh={() => loadData('hotels')} />
        )}
        {tab === 'users' && (
          <UsersPanel users={users} onRefresh={() => loadData('users')} />
        )}
        {tab === 'admins' && (
          <AdminsPanel admins={admins} onRefresh={() => loadData('admins')} />
        )}
        {tab === 'settings' && (
          <SettingsPanel
            settings={settings}
            onSaved={(s) => setSettings(s)}
          />
        )}
      </main>

      <style jsx>{`
        .super-admin .sidebar-brand span:first-child {
          font-size: 1.75rem;
        }
        .sidebar-user {
          padding: 0.5rem 0;
          color: var(--text-muted);
          font-size: 0.85rem;
          border-top: 1px solid var(--border);
        }
        .panel-error {
          margin-bottom: 1.5rem;
        }
      `}</style>
    </div>
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

function HotelsPanel({
  hotels,
  onRefresh,
}: {
  hotels: PlatformHotel[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<PlatformHotel | null>(null);
  const [form, setForm] = useState({
    name: '',
    timezone: '',
    currency: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  function openEdit(hotel: PlatformHotel) {
    setEditing(hotel);
    setForm({
      name: hotel.name,
      timezone: hotel.timezone,
      currency: hotel.currency,
      is_active: hotel.is_active,
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await superAdminApi.updateHotel(editing.id, form);
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
