'use client';

import { useEffect, useState } from 'react';
import { api, type DiscountTier } from '@/lib/api';

function formatRange(tier: DiscountTier) {
  const fmt = (n: number) => `COP ${n.toLocaleString('es-CO')}`;
  if (tier.max_total == null) {
    return `${fmt(tier.min_total)} en adelante`;
  }
  return `${fmt(tier.min_total)} – ${fmt(tier.max_total)}`;
}

export function DiscountTiersPanel() {
  const [tiers, setTiers] = useState<DiscountTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    min_total: '',
    max_total: '',
    discount_percent: '',
  });

  useEffect(() => {
    loadTiers();
  }, []);

  async function loadTiers() {
    setLoading(true);
    try {
      setTiers(await api.listDiscountTiers());
    } catch {
      setMessage('Error cargando descuentos');
    } finally {
      setLoading(false);
    }
  }

  async function seedDefault() {
    setMessage('');
    try {
      const res = await api.seedDefaultDiscountTiers();
      setMessage(res.message);
      await loadTiers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await api.createDiscountTier({
        min_total: Number(form.min_total),
        max_total: form.max_total ? Number(form.max_total) : null,
        discount_percent: Number(form.discount_percent),
      });
      setForm({ min_total: '', max_total: '', discount_percent: '' });
      setShowForm(false);
      await loadTiers();
      setMessage('Rango de descuento creado.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al crear');
    }
  }

  async function toggleActive(tier: DiscountTier) {
    await api.updateDiscountTier(tier.id, { is_active: !tier.is_active });
    await loadTiers();
  }

  async function removeTier(id: string) {
    if (!confirm('¿Eliminar este rango de descuento?')) return;
    await api.deleteDiscountTier(id);
    await loadTiers();
  }

  if (loading) return <div className="panel">Cargando descuentos...</div>;

  return (
    <div className="discount-stack">
      <div className="panel">
        <div className="panel-header-row">
          <div>
            <h2>Descuentos por valor de reserva</h2>
            <p className="muted">
              Define rangos según el <strong>total de la reserva</strong> (noches × tarifa).
              El bot ofrece el descuento cuando el huésped dice que es caro, pide rebaja o algo
              más económico.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={seedDefault}>
              Cargar ejemplo (5% / 10% / 15%)
            </button>
            <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancelar' : '+ Nuevo rango'}
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
          <h3>Nuevo rango de descuento</h3>
          <div
            className="field-row"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}
          >
            <label>
              Total mínimo (COP)
              <input
                type="number"
                required
                min={0}
                value={form.min_total}
                onChange={(e) => setForm({ ...form, min_total: e.target.value })}
              />
            </label>
            <label>
              Total máximo (COP)
              <input
                type="number"
                min={0}
                placeholder="Vacío = sin límite"
                value={form.max_total}
                onChange={(e) => setForm({ ...form, max_total: e.target.value })}
              />
            </label>
            <label>
              Descuento (%)
              <input
                type="number"
                required
                min={1}
                max={100}
                value={form.discount_percent}
                onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
              />
            </label>
          </div>
          <p className="muted">
            Ejemplo: de 0 a 500.000 → 5%; de 500.001 a 1.000.000 → 10%.
          </p>
          <button type="submit" className="btn-primary">
            Guardar rango
          </button>
        </form>
      )}

      <div className="panel">
        {tiers.length === 0 ? (
          <p className="muted">
            No hay rangos configurados. Pulsa &quot;Cargar ejemplo&quot; o crea uno manualmente.
          </p>
        ) : (
          <table className="tier-table">
            <thead>
              <tr>
                <th>Rango total reserva</th>
                <th>Descuento</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.id}>
                  <td>{formatRange(tier)}</td>
                  <td>
                    <strong>{tier.discount_percent}%</strong>
                  </td>
                  <td>
                    <span className={`pill ${tier.is_active ? 'ok' : 'off'}`}>
                      {tier.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="tier-actions">
                    <button type="button" className="btn-secondary" onClick={() => toggleActive(tier)}>
                      {tier.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => removeTier(tier.id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        .discount-stack {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .panel-header-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }
        .tier-table {
          width: 100%;
          border-collapse: collapse;
        }
        .tier-table th,
        .tier-table td {
          text-align: left;
          padding: 0.75rem 0.5rem;
          border-bottom: 1px solid var(--border);
        }
        .tier-actions {
          display: flex;
          gap: 0.5rem;
        }
        .pill {
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          font-size: 0.8rem;
        }
        .pill.ok {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
        }
        .pill.off {
          background: rgba(148, 163, 184, 0.15);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
