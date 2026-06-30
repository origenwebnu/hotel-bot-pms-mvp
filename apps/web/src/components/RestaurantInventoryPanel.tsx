'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type DiningZone,
  type RestaurantAddOn,
  type RestaurantSettings,
} from '@/lib/api';
import { RestaurantCalendarPanel } from '@/components/RestaurantCalendarPanel';

type Section = 'zones' | 'calendar' | 'addons' | 'settings';

const emptyZone = {
  name: '',
  description: '',
  min_party_size: '1',
  max_party_size: '4',
  capacity_per_slot: '1',
  base_reservation_fee: '0',
  base_price_per_guest: '0',
};

const emptyAddon = {
  name: '',
  description: '',
  price: '',
  max_quantity: '1',
};

function formatCop(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function RestaurantInventoryPanel() {
  const [section, setSection] = useState<Section>('zones');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [zones, setZones] = useState<DiningZone[]>([]);
  const [addons, setAddons] = useState<RestaurantAddOn[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);

  const [zoneForm, setZoneForm] = useState(emptyZone);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [addonForm, setAddonForm] = useState(emptyAddon);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);

  const [settingsForm, setSettingsForm] = useState({
    require_payment: true,
    post_payment_message: '',
    post_payment_link: '',
    slot_interval_minutes: '30',
    advance_booking_days: '60',
    min_advance_hours: '2',
    max_covers_per_slot: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [z, a, s] = await Promise.all([
        api.listRestaurantZones(),
        api.listRestaurantAddOns(),
        api.getRestaurantSettings(),
      ]);
      setZones(z);
      setAddons(a);
      setSettings(s);
      setSettingsForm({
        require_payment: s.require_payment,
        post_payment_message: s.post_payment_message,
        post_payment_link: s.post_payment_link,
        slot_interval_minutes: String(s.slot_interval_minutes),
        advance_booking_days: String(s.advance_booking_days),
        min_advance_hours: String(s.min_advance_hours),
        max_covers_per_slot: s.max_covers_per_slot != null ? String(s.max_covers_per_slot) : '',
      });
    } catch {
      setMessage('Error cargando inventario del restaurante');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await api.getRestaurantSettings();
      setSettings(s);
    } catch {
      setMessage('Error actualizando configuración');
    }
  }, []);

  async function saveZone(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    const payload = {
      name: zoneForm.name,
      description: zoneForm.description || undefined,
      min_party_size: Number(zoneForm.min_party_size),
      max_party_size: Number(zoneForm.max_party_size),
      capacity_per_slot: Number(zoneForm.capacity_per_slot),
      base_reservation_fee: Number(zoneForm.base_reservation_fee),
      base_price_per_guest: Number(zoneForm.base_price_per_guest),
    };
    try {
      if (editingZoneId) {
        await api.updateRestaurantZone(editingZoneId, payload);
        setMessage('Zona actualizada.');
      } else {
        await api.createRestaurantZone(payload);
        setMessage('Zona creada.');
      }
      setZoneForm(emptyZone);
      setEditingZoneId(null);
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar zona');
    }
  }

  async function saveAddon(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    const payload = {
      name: addonForm.name,
      description: addonForm.description || undefined,
      price: Number(addonForm.price),
      max_quantity: Number(addonForm.max_quantity),
    };
    try {
      if (editingAddonId) {
        await api.updateRestaurantAddOn(editingAddonId, payload);
        setMessage('Adicional actualizado.');
      } else {
        await api.createRestaurantAddOn(payload);
        setMessage('Adicional creado.');
      }
      setAddonForm(emptyAddon);
      setEditingAddonId(null);
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar adicional');
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await api.updateRestaurantSettings({
        require_payment: settingsForm.require_payment,
        post_payment_message: settingsForm.post_payment_message,
        post_payment_link: settingsForm.post_payment_link,
        slot_interval_minutes: Number(settingsForm.slot_interval_minutes),
        advance_booking_days: Number(settingsForm.advance_booking_days),
        min_advance_hours: Number(settingsForm.min_advance_hours),
        max_covers_per_slot: settingsForm.max_covers_per_slot
          ? Number(settingsForm.max_covers_per_slot)
          : null,
      });
      setMessage('Configuración guardada.');
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar configuración');
    }
  }

  if (loading && !settings) {
    return <div className="panel">Cargando inventario...</div>;
  }

  return (
    <div className="inventory-stack">
      <div className="panel">
        <div className="panel-header-row">
          <div>
            <h2>Inventario del restaurante</h2>
            <p className="muted">
              Configura zonas, tarifas por fecha (estilo calendario), adicionales y reglas de
              reserva para WhatsApp.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          {(
            [
              ['zones', 'Zonas / mesas'],
              ['calendar', 'Calendario tarifas'],
              ['addons', 'Adicionales'],
              ['settings', 'Configuración'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={section === id ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {message && (
          <div className={message.includes('Error') ? 'error-banner' : 'info-banner'}>
            {message}
          </div>
        )}
      </div>

      {section === 'zones' && (
        <>
          <form className="panel form-panel" onSubmit={saveZone}>
            <h3>{editingZoneId ? 'Editar zona' : 'Nueva zona o ambiente'}</h3>
            <label>
              Nombre
              <input
                required
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              />
            </label>
            <label>
              Descripción
              <textarea
                rows={2}
                value={zoneForm.description}
                onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })}
              />
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '1rem',
              }}
            >
              <label>
                Mín. personas
                <input
                  type="number"
                  min={1}
                  value={zoneForm.min_party_size}
                  onChange={(e) => setZoneForm({ ...zoneForm, min_party_size: e.target.value })}
                />
              </label>
              <label>
                Máx. personas
                <input
                  type="number"
                  min={1}
                  required
                  value={zoneForm.max_party_size}
                  onChange={(e) => setZoneForm({ ...zoneForm, max_party_size: e.target.value })}
                />
              </label>
              <label>
                Mesas por horario
                <input
                  type="number"
                  min={1}
                  value={zoneForm.capacity_per_slot}
                  onChange={(e) =>
                    setZoneForm({ ...zoneForm, capacity_per_slot: e.target.value })
                  }
                />
              </label>
              <label>
                Fee reserva (COP)
                <input
                  type="number"
                  min={0}
                  value={zoneForm.base_reservation_fee}
                  onChange={(e) =>
                    setZoneForm({ ...zoneForm, base_reservation_fee: e.target.value })
                  }
                />
              </label>
              <label>
                Precio / persona (COP)
                <input
                  type="number"
                  min={0}
                  value={zoneForm.base_price_per_guest}
                  onChange={(e) =>
                    setZoneForm({ ...zoneForm, base_price_per_guest: e.target.value })
                  }
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn-primary">
                {editingZoneId ? 'Guardar cambios' : 'Crear zona'}
              </button>
              {editingZoneId && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setEditingZoneId(null);
                    setZoneForm(emptyZone);
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <div className="panel">
            <h3>Zonas activas</h3>
            {zones.length === 0 ? (
              <p className="muted">Aún no hay zonas. Crea al menos una para recibir reservas.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zona</th>
                      <th>Personas</th>
                      <th>Tarifa base</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map((z) => (
                      <tr key={z.id}>
                        <td>
                          <strong>{z.name}</strong>
                          {z.description && (
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              {z.description}
                            </div>
                          )}
                        </td>
                        <td>
                          {z.min_party_size}–{z.max_party_size}
                        </td>
                        <td>
                          {formatCop(z.base_reservation_fee)} + {formatCop(z.base_price_per_guest)}
                          /pax
                        </td>
                        <td>{z.is_active ? 'Activa' : 'Inactiva'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              setEditingZoneId(z.id);
                              setZoneForm({
                                name: z.name,
                                description: z.description ?? '',
                                min_party_size: String(z.min_party_size),
                                max_party_size: String(z.max_party_size),
                                capacity_per_slot: String(z.capacity_per_slot),
                                base_reservation_fee: String(z.base_reservation_fee),
                                base_price_per_guest: String(z.base_price_per_guest),
                              });
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {section === 'calendar' && settings && (
        <RestaurantCalendarPanel
          zones={zones}
          settings={settings}
          onSettingsSaved={refreshSettings}
          onMessage={(msg, isError) => setMessage(isError ? `Error: ${msg}` : msg)}
        />
      )}

      {section === 'addons' && (
        <>
          <form className="panel form-panel" onSubmit={saveAddon}>
            <h3>{editingAddonId ? 'Editar adicional' : 'Nuevo adicional'}</h3>
            <label>
              Nombre
              <input
                required
                value={addonForm.name}
                onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
              />
            </label>
            <label>
              Descripción
              <textarea
                rows={2}
                value={addonForm.description}
                onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label>
                Precio (COP)
                <input
                  type="number"
                  required
                  min={0}
                  value={addonForm.price}
                  onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })}
                />
              </label>
              <label>
                Cantidad máx.
                <input
                  type="number"
                  min={1}
                  value={addonForm.max_quantity}
                  onChange={(e) => setAddonForm({ ...addonForm, max_quantity: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="btn-primary">
              {editingAddonId ? 'Guardar' : 'Crear adicional'}
            </button>
          </form>

          <div className="panel">
            <h3>Adicionales ofrecidos al reservar</h3>
            {addons.length === 0 ? (
              <p className="muted">Opcional: botella, decoración, postre especial, etc.</p>
            ) : (
              <ul>
                {addons.map((a) => (
                  <li key={a.id} style={{ marginBottom: '0.75rem' }}>
                    <strong>{a.name}</strong> — {formatCop(a.price)}
                    {a.description && (
                      <span className="muted"> · {a.description}</span>
                    )}
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginLeft: '0.5rem' }}
                      onClick={() => {
                        setEditingAddonId(a.id);
                        setAddonForm({
                          name: a.name,
                          description: a.description ?? '',
                          price: String(a.price),
                          max_quantity: String(a.max_quantity),
                        });
                      }}
                    >
                      Editar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {section === 'settings' && settings && (
        <form className="panel form-panel" onSubmit={saveSettings}>
          <h3>Configuración de reservas</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={settingsForm.require_payment}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, require_payment: e.target.checked })
              }
            />
            Requerir pago al reservar (desactivar para reservas gratuitas)
          </label>
          <label>
            Mensaje post-reserva / post-pago
            <textarea
              rows={4}
              placeholder="Indicaciones para el cliente: dress code, llegar 10 min antes, etc."
              value={settingsForm.post_payment_message}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, post_payment_message: e.target.value })
              }
            />
          </label>
          <label>
            Link opcional (menú, mapa, políticas…)
            <input
              type="url"
              placeholder="https://..."
              value={settingsForm.post_payment_link}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, post_payment_link: e.target.value })
              }
            />
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem',
            }}
          >
            <label>
              Intervalo horarios (min)
              <input
                type="number"
                min={15}
                step={15}
                value={settingsForm.slot_interval_minutes}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, slot_interval_minutes: e.target.value })
                }
              />
            </label>
            <label>
              Días de anticipación máx.
              <input
                type="number"
                min={1}
                value={settingsForm.advance_booking_days}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, advance_booking_days: e.target.value })
                }
              />
            </label>
            <label>
              Antelación mínima (horas)
              <input
                type="number"
                min={0}
                value={settingsForm.min_advance_hours}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, min_advance_hours: e.target.value })
                }
              />
            </label>
            <label>
              Máx. cubiertos por horario (opcional)
              <input
                type="number"
                min={1}
                value={settingsForm.max_covers_per_slot}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, max_covers_per_slot: e.target.value })
                }
              />
            </label>
          </div>
          <button type="submit" className="btn-primary">
            Guardar configuración
          </button>
        </form>
      )}
    </div>
  );
}
