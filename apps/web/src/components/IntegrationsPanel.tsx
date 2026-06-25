'use client';

import { useEffect, useState } from 'react';
import { api, type IntegrationStatus, type PaymentConfig } from '@/lib/api';

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
    reservation_recommendations: '',
  });
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getPaymentConfig().then(setPaymentConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (paymentConfig?.reservation_recommendations) {
      setForm((prev) => ({
        ...prev,
        reservation_recommendations: paymentConfig.reservation_recommendations,
      }));
    }
  }, [paymentConfig]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const updated = await api.updateIntegration(form);
      onUpdate(updated);
      setMessage('Integración guardada correctamente.');
      const cfg = await api.getPaymentConfig();
      setPaymentConfig(cfg);
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
        <p className="desc">
          Conecta Cloudbeds, Lobby PMS o usa inventario local para demos sin credenciales externas.
        </p>

        <form onSubmit={handleSave} className="form">
          <label>
            Proveedor PMS
            <select
              value={form.pms_provider}
              onChange={(e) => setForm({ ...form, pms_provider: e.target.value })}
            >
              <option value="cloudbeds">Cloudbeds</option>
              <option value="lobby">Lobby PMS</option>
              <option value="local">Inventario local (demo / pruebas)</option>
            </select>
          </label>

          {form.pms_provider !== 'local' && (
            <>
              <label>
                Property ID
                <input
                  type="text"
                  value={form.pms_property_id}
                  onChange={(e) => setForm({ ...form, pms_property_id: e.target.value })}
                  placeholder="ID de propiedad en el PMS"
                />
              </label>
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
            </>
          )}

          {form.pms_provider === 'local' && (
            <p className="desc">
              Con inventario local no necesitas API keys. Agrega habitaciones en la pestaña{' '}
              <strong>Inventario</strong> o usa &quot;Cargar demo&quot;.
            </p>
          )}
        </form>
      </section>

      <section className="card">
        <h2>Pasarela de Pagos</h2>
        <p className="desc">Configura Wompi (Colombia) o Stripe para procesar pagos de reservas.</p>

        {paymentConfig && (
          <div className="webhook-box">
            <strong>URL de eventos (Wompi)</strong>
            <code>{paymentConfig.webhook_url}</code>
            <p className="desc">
              Copia esta URL en Wompi → Configuración → Eventos. El *Webhook Secret* es el
              &quot;Events Secret&quot; que te da Wompi.
            </p>
            <ol className="steps">
              {paymentConfig.setup_steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        )}

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
            Webhook Secret (Events Secret de Wompi)
            <input
              type="password"
              value={form.payment_webhook_secret}
              onChange={(e) => setForm({ ...form, payment_webhook_secret: e.target.value })}
              placeholder="Secreto para verificar webhooks"
            />
          </label>

          <label>
            Recomendaciones post-pago (WhatsApp)
            <textarea
              rows={5}
              value={form.reservation_recommendations}
              onChange={(e) =>
                setForm({ ...form, reservation_recommendations: e.target.value })
              }
              placeholder="Ej: Check-in desde las 3pm. Trae documento de identidad. Desayuno incluido de 7am a 10am."
            />
          </label>
          <p className="desc">
            Este texto se envía al huésped por WhatsApp cuando el pago es aprobado.
          </p>

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
        .webhook-box {
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.25);
          border-radius: 10px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .webhook-box code {
          display: block;
          margin: 0.5rem 0;
          padding: 0.65rem;
          background: #0f172a;
          color: #e2e8f0;
          border-radius: 8px;
          font-size: 0.82rem;
          word-break: break-all;
        }
        .steps {
          margin: 0.75rem 0 0 1.1rem;
          color: var(--text-muted);
          font-size: 0.85rem;
          line-height: 1.45;
        }
        textarea {
          width: 100%;
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font-family: inherit;
        }
        .toast {
          padding: 0.75rem 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}
