'use client';

import { useState } from 'react';
import { api, type IntegrationStatus } from '@/lib/api';

interface Props {
  integration: IntegrationStatus | null;
  onUpdate: (i: IntegrationStatus) => void;
}

export function IntegrationsPanel({ integration, onUpdate }: Props) {
  const [form, setForm] = useState({
    pms_provider: integration?.pms_provider ?? 'cloudbeds',
    pms_property_id: '',
    pms_api_key: '',
    payment_provider: integration?.payment_provider ?? 'wompi',
    payment_public_key: '',
    payment_private_key: '',
    payment_webhook_secret: '',
  });
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const updated = await api.updateIntegration(form);
      onUpdate(updated);
      setMessage('Integración guardada correctamente.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoading(false);
    }
  }

  async function handleValidate() {
    setValidating(true);
    setMessage('');
    try {
      const { valid } = await api.validatePms();
      setMessage(valid ? '✓ Credenciales PMS válidas' : '✗ Credenciales PMS inválidas');
    } catch {
      setMessage('Error al validar credenciales');
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="panel">
      <section className="card">
        <h2>PMS — Property Management System</h2>
        <p className="desc">Conecta Cloudbeds o Lobby PMS para sincronizar disponibilidad y reservas.</p>

        <form onSubmit={handleSave} className="form">
          <div className="field-row">
            <label>
              Proveedor PMS
              <select
                value={form.pms_provider}
                onChange={(e) => setForm({ ...form, pms_provider: e.target.value })}
              >
                <option value="cloudbeds">Cloudbeds</option>
                <option value="lobby">Lobby PMS</option>
              </select>
            </label>
            <label>
              Property ID
              <input
                type="text"
                value={form.pms_property_id}
                onChange={(e) => setForm({ ...form, pms_property_id: e.target.value })}
                placeholder="ID de propiedad en el PMS"
              />
            </label>
          </div>
          <label>
            API Key
            <input
              type="password"
              value={form.pms_api_key}
              onChange={(e) => setForm({ ...form, pms_api_key: e.target.value })}
              placeholder="Tu API key del PMS"
            />
          </label>

          <div className="actions">
            <button type="button" className="btn-secondary" onClick={handleValidate} disabled={validating}>
              {validating ? 'Validando...' : 'Validar PMS'}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Pasarela de Pagos</h2>
        <p className="desc">Configura Wompi (Colombia) o Stripe para procesar pagos de reservas.</p>

        <form onSubmit={handleSave} className="form">
          <label>
            Proveedor de pagos
            <select
              value={form.payment_provider}
              onChange={(e) => setForm({ ...form, payment_provider: e.target.value })}
            >
              <option value="wompi">Wompi</option>
              <option value="stripe">Stripe</option>
            </select>
          </label>
          <label>
            Public Key
            <input
              type="password"
              value={form.payment_public_key}
              onChange={(e) => setForm({ ...form, payment_public_key: e.target.value })}
              placeholder="pub_prod_..."
            />
          </label>
          <label>
            Private Key
            <input
              type="password"
              value={form.payment_private_key}
              onChange={(e) => setForm({ ...form, payment_private_key: e.target.value })}
              placeholder="prv_prod_..."
            />
          </label>
          <label>
            Webhook Secret
            <input
              type="password"
              value={form.payment_webhook_secret}
              onChange={(e) => setForm({ ...form, payment_webhook_secret: e.target.value })}
              placeholder="Secreto para verificar webhooks"
            />
          </label>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar integraciones'}
          </button>
        </form>
      </section>

      {message && <div className="toast">{message}</div>}

      <style jsx>{`
        .panel {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.5rem;
        }
        h2 {
          font-size: 1.15rem;
          margin-bottom: 0.35rem;
        }
        .desc {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        input, select {
          padding: 0.65rem 0.875rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
        }
        .actions {
          display: flex;
          gap: 0.75rem;
        }
        .btn-primary {
          padding: 0.75rem 1.5rem;
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          align-self: flex-start;
        }
        .btn-secondary {
          padding: 0.65rem 1.25rem;
          background: var(--surface-hover);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .toast {
          padding: 1rem;
          background: var(--surface-hover);
          border-radius: 8px;
          border-left: 3px solid var(--accent);
        }
      `}</style>
    </div>
  );
}
