'use client';

import { useEffect, useState } from 'react';
import { api, type RoomType } from '@/lib/api';

const emptyForm = {
  name: '',
  description: '',
  price_per_night: '',
  total_units: '1',
  max_occupancy: '2',
  photo_urls: '',
};

function roomToForm(room: RoomType) {
  return {
    name: room.name,
    description: room.description ?? '',
    price_per_night: String(room.price_per_night),
    total_units: String(room.total_units),
    max_occupancy: String(room.max_occupancy),
    photo_urls: room.photo_urls.join('\n'),
  };
}

export function InventoryPanel() {
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    setLoading(true);
    try {
      setRooms(await api.listInventory());
    } catch {
      setMessage('Error cargando inventario');
    } finally {
      setLoading(false);
    }
  }

  async function seedDemo() {
    setMessage('');
    try {
      const res = await api.seedDemoInventory();
      setMessage(res.message);
      await loadRooms();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error');
    }
  }

  function cancelForm() {
    setForm(emptyForm);
    setShowCreateForm(false);
    setEditingId(null);
  }

  function startCreate() {
    cancelForm();
    setShowCreateForm(true);
  }

  function startEdit(room: RoomType) {
    setShowCreateForm(false);
    setEditingId(room.id);
    setForm(roomToForm(room));
    setMessage('');
  }

  function parsePhotoUrls(value: string) {
    return value
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description,
      price_per_night: Number(form.price_per_night),
      total_units: Number(form.total_units),
      max_occupancy: Number(form.max_occupancy),
      photo_urls: parsePhotoUrls(form.photo_urls),
    };

    try {
      if (editingId) {
        await api.updateInventory(editingId, payload);
        setMessage('Habitación actualizada.');
      } else {
        await api.createInventory(payload);
        setMessage('Habitación creada.');
      }
      cancelForm();
      await loadRooms();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(room: RoomType) {
    await api.updateInventory(room.id, { is_active: !room.is_active });
    await loadRooms();
  }

  async function removeRoom(id: string) {
    if (!confirm('¿Eliminar esta habitación?')) return;
    await api.deleteInventory(id);
    if (editingId === id) cancelForm();
    await loadRooms();
  }

  const showForm = showCreateForm || editingId !== null;

  if (loading) return <div className="panel">Cargando inventario...</div>;

  return (
    <div className="inventory-stack">
      <div className="panel">
        <div className="panel-header-row">
          <div>
            <h2>Inventario local (demo / pruebas)</h2>
            <p className="muted">
              Usa PMS <strong>Inventario local</strong> en Integraciones. Las habitaciones aquí
              alimentan el bot de WhatsApp sin Cloudbeds ni Lobby.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={seedDemo}>
              Cargar demo (3 habitaciones)
            </button>
            <button type="button" className="btn-primary" onClick={() => (showCreateForm ? cancelForm() : startCreate())}>
              {showCreateForm ? 'Cancelar' : '+ Nueva habitación'}
            </button>
          </div>
        </div>

        {message && (
          <div className={message.includes('Error') ? 'error-banner' : 'info-banner'}>
            {message}
          </div>
        )}
      </div>

      {showForm && (
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Editar habitación' : 'Nueva habitación'}</h3>
          <label>
            Nombre
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Descripción
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <label>
              Precio / noche (COP)
              <input
                type="number"
                required
                min={1}
                value={form.price_per_night}
                onChange={(e) => setForm({ ...form, price_per_night: e.target.value })}
              />
            </label>
            <label>
              Unidades
              <input
                type="number"
                min={1}
                value={form.total_units}
                onChange={(e) => setForm({ ...form, total_units: e.target.value })}
              />
            </label>
            <label>
              Capacidad máx.
              <input
                type="number"
                min={1}
                value={form.max_occupancy}
                onChange={(e) => setForm({ ...form, max_occupancy: e.target.value })}
              />
            </label>
          </div>
          <label>
            URLs de fotos (una por línea)
            <textarea
              rows={4}
              placeholder="https://images.unsplash.com/photo-..."
              value={form.photo_urls}
              onChange={(e) => setForm({ ...form, photo_urls: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar habitación'}
            </button>
            <button type="button" className="btn-secondary" onClick={cancelForm}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="panel">
        {rooms.length === 0 ? (
          <p className="muted">No hay habitaciones. Pulsa &quot;Cargar demo&quot; para empezar rápido.</p>
        ) : (
          <div className="room-grid">
            {rooms.map((room) => (
              <article key={room.id} className={`room-card ${editingId === room.id ? 'editing' : ''}`}>
                {room.photo_urls[0] && (
                  <img src={room.photo_urls[0]} alt={room.name} className="room-thumb" />
                )}
                <div className="room-body">
                  <h3>{room.name}</h3>
                  <p className="muted">{room.description}</p>
                  <p>
                    <strong>
                      {room.currency} {room.price_per_night.toLocaleString()}
                    </strong>{' '}
                    / noche · {room.total_units} uds · máx {room.max_occupancy} pax
                  </p>
                  <div className="room-actions">
                    <span className={`pill ${room.is_active ? 'ok' : 'off'}`}>
                      {room.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                    <button type="button" className="btn-sm" onClick={() => startEdit(room)}>
                      Editar
                    </button>
                    <button type="button" className="btn-sm" onClick={() => toggleActive(room)}>
                      {room.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button type="button" className="btn-sm" onClick={() => removeRoom(room.id)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .inventory-stack {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .room-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }
        .room-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg);
        }
        .room-card.editing {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent);
        }
        .room-thumb {
          width: 100%;
          height: 160px;
          object-fit: cover;
        }
        .room-body {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .room-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 0.5rem;
        }
        .form-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        textarea {
          padding: 0.75rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          resize: vertical;
        }
      `}</style>
    </div>
  );
}
