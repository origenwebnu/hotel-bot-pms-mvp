'use client';

import { useEffect, useState } from 'react';
import { api, type DiscountTier } from '@/lib/api';

const emptyForm = {
  min_total: '',
  max_total: '',
  discount_percent: '',
};

function formatRange(tier: DiscountTier) {
  const fmt = (n: number) => `COP ${n.toLocaleString('es-CO')}`;
  if (tier.max_total == null) {
    return `${fmt(tier.min_total)} en adelante`;
  }
  return `${fmt(tier.min_total)} – ${fmt(tier.max_total)}`;
}

function tierToForm(tier: DiscountTier) {
  return {
    min_total: String(tier.min_total),
    max_total: tier.max_total == null ? '' : String(tier.max_total),
    discount_percent: String(tier.discount_percent),
  };
}

export function DiscountTiersPanel() {
  const [tiers, setTiers] = useState<DiscountTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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

  function cancelForm() {
    setForm(emptyForm);
    setShowCreateForm(false);
    setEditingId(null);
  }

  function startCreate() {
    cancelForm();
    setShowCreateForm(true);
  }

  function startEdit(tier: DiscountTier) {
    setShowCreateForm(false);
    setEditingId(tier.id);
    setForm(tierToForm(tier));
    setMessage('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setSaving(true);

    const payload = {
      min_total: Number(form.min_total),
      max_total: form.max_total ? Number(form.max_total) : null,
      discount_percent: Number(form.discount_percent),
    };

    try {
      if (editingId) {
        await api.updateDiscountTier(editingId, payload);
        setMessage('Rango de descuento actualizado.');
      } else {
        await api.createDiscountTier(payload);
        setMessage('Rango de descuento creado.');
      }
      cancelForm();
      await loadTiers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(tier: DiscountTier) {
    await api.updateDiscountTier(tier.id, { is_active: !tier.is_active });
    await loadTiers();
  }

  async function removeTier(id: string) {
    if (!confirm('¿Eliminar este rango de descuento?')) return;
    await api.deleteDiscountTier(id);
    if (editingId === id) cancelForm();
    await loadTiers();
  }

  const showForm = showCreateForm || editingId !== null;

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
            <button
              type="button"
              className="btn-primary"
              onClick={() => (showCreateForm ? cancelForm() : startCreate())}
            >
              {showCreateForm ? 'Cancelar' : '+ Nuevo rango'}
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
          <h3>{editingId ? 'Editar rango de descuento' : 'Nuevo rango de descuento'}</h3>
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
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar rango'}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={cancelForm}>
                Cancelar
              </button>
            )}
          </div>
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
                <tr key={tier.id} className={editingId === tier.id ? 'row-editing' : undefined}>
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
                    <button type="button" className="btn-secondary" onClick={() => startEdit(tier)}>
                      Editar
                    </button>
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
        .row-editing {
          background: rgba(95, 66, 209, 0.08);
        }
        .tier-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
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
