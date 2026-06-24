'use client';

import { useEffect, useState } from 'react';
import { api, type RoomType } from '@/lib/api';

export function InventoryPanel() {
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price_per_night: '',
    total_units: '1',
    max_occupancy: '2',
    photo_urls: '',
  });

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await api.createInventory({
        name: form.name,
        description: form.description,
        price_per_night: Number(form.price_per_night),
        total_units: Number(form.total_units),
        max_occupancy: Number(form.max_occupancy),
        photo_urls: form.photo_urls
          .split('\n')
          .map((u) => u.trim())
          .filter(Boolean),
      });
      setForm({
        name: '',
        description: '',
        price_per_night: '',
        total_units: '1',
        max_occupancy: '2',
        photo_urls: '',
      });
      setShowForm(false);
      await loadRooms();
      setMessage('Habitación creada.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al crear');
    }
  }

  async function toggleActive(room: RoomType) {
    await api.updateInventory(room.id, { is_active: !room.is_active });
    await loadRooms();
  }

  async function removeRoom(id: string) {
    if (!confirm('¿Eliminar esta habitación?')) return;
    await api.deleteInventory(id);
    await loadRooms();
  }

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
            <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancelar' : '+ Nueva habitación'}
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
        <form className="panel form-panel" onSubmit={handleCreate}>
          <h3>Nueva habitación</h3>
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
          <button type="submit" className="btn-primary">
            Guardar habitación
          </button>
        </form>
      )}

      <div className="panel">
        {rooms.length === 0 ? (
          <p className="muted">No hay habitaciones. Pulsa &quot;Cargar demo&quot; para empezar rápido.</p>
        ) : (
          <div className="room-grid">
            {rooms.map((room) => (
              <article key={room.id} className="room-card">
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
