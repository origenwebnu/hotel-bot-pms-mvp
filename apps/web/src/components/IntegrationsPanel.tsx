'use client';

import { useEffect, useState } from 'react';
import { api, type IntegrationStatus, type PaymentConfig } from '@/lib/api';

interface Props {
  integration: IntegrationStatus | null;
  onUpdate: (i: IntegrationStatus) => void;
}

function buildSavePayload(form: {
  pms_provider: string;
  pms_property_id: string;
  pms_api_key: string;
  payment_provider: string;
  payment_public_key: string;
  payment_private_key: string;
  payment_webhook_secret: string;
  reservation_recommendations: string;
}) {
  const payload: Record<string, string> = {
    pms_provider: form.pms_provider,
    payment_provider: form.payment_provider,
    reservation_recommendations: form.reservation_recommendations,
  };

  if (form.pms_property_id.trim()) payload.pms_property_id = form.pms_property_id.trim();
  if (form.pms_api_key.trim()) payload.pms_api_key = form.pms_api_key.trim();
  if (form.payment_public_key.trim()) payload.payment_public_key = form.payment_public_key.trim();
  if (form.payment_private_key.trim()) payload.payment_private_key = form.payment_private_key.trim();
  if (form.payment_webhook_secret.trim()) {
    payload.payment_webhook_secret = form.payment_webhook_secret.trim();
  }

  return payload;
}

export function IntegrationsPanel({ integration, onUpdate }: Props) {
  const [form, setForm] = useState({
    pms_provider: integration?.pms_provider ?? 'local',
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
  const [validatingPayment, setValidatingPayment] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getPaymentConfig().then(setPaymentConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (integration) {
      setForm((prev) => ({
        ...prev,
        pms_provider: integration.pms_provider ?? 'local',
        payment_provider: integration.payment_provider ?? 'wompi',
      }));
    }
  }, [integration]);

  useEffect(() => {
    if (paymentConfig) {
      setForm((prev) => ({
        ...prev,
        reservation_recommendations: paymentConfig.reservation_recommendations,
      }));
    }
  }, [paymentConfig]);

  async function refreshPaymentConfig() {
    const cfg = await api.getPaymentConfig();
    setPaymentConfig(cfg);
    return cfg;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const payload = buildSavePayload(form);
      const updated = await api.updateIntegration(payload);
      onUpdate(updated);
      setForm((prev) => ({
        ...prev,
        pms_api_key: '',
        payment_public_key: '',
        payment_private_key: '',
        payment_webhook_secret: '',
      }));
      const cfg = await refreshPaymentConfig();
      const savedKeys =
        payload.payment_public_key || payload.payment_private_key || payload.payment_webhook_secret;
      if (savedKeys && cfg.has_private_key) {
        setMessage('Integración guardada. Llaves de pago almacenadas de forma segura.');
      } else {
        setMessage('Integración guardada correctamente.');
      }
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

  async function handleValidatePayment() {
    setValidatingPayment(true);
    setMessage('');
    try {
      const result = await api.validatePayment();
      if (result.valid) {
        setMessage(
          `✓ Wompi conectado correctamente${result.api_base ? ` (${result.api_base})` : ''}`,
        );
        const updated = await api.getIntegration();
        onUpdate(updated);
        await refreshPaymentConfig();
      } else {
        setMessage(`✗ Pagos: ${result.reason ?? 'Credenciales inválidas'}`);
      }
    } catch {
      setMessage('Error al validar pasarela de pagos');
    } finally {
      setValidatingPayment(false);
    }
  }

  return (
    <div className="panel">
      <form onSubmit={handleSave} className="panel-form">
        <section className="card">
          <h2>PMS — Property Management System</h2>
          <p className="desc">
            Conecta Cloudbeds, Lobby PMS o usa inventario local para demos sin credenciales externas.
          </p>

          <div className="form">
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
          </div>
        </section>

        <section className="card">
          <h2>Pasarela de Pagos</h2>
          <p className="desc">Configura Wompi (Colombia) o Stripe para procesar pagos de reservas.</p>

          {paymentConfig && (
            <>
              <div className="status-row">
                <span className={`status-badge ${paymentConfig.connected ? 'ok' : 'warn'}`}>
                  {paymentConfig.connected ? 'Wompi verificado' : 'Sin verificar con Wompi'}
                </span>
                {paymentConfig.has_private_key && (
                  <span className="hint-inline">Private Key guardada</span>
                )}
              </div>

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
            </>
          )}

          <div className="form">
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
                placeholder={
                  paymentConfig?.has_public_key
                    ? paymentConfig.public_key_hint
                      ? `${paymentConfig.public_key_hint} (dejar vacío para mantener)`
                      : '•••••••• (dejar vacío para mantener)'
                    : 'pub_prod_... o pub_test_...'
                }
              />
              {paymentConfig?.has_public_key && (
                <span className="hint">Guardada: {paymentConfig.public_key_hint ?? 'sí'}</span>
              )}
            </label>
            <label>
              Private Key
              <input
                type="password"
                value={form.payment_private_key}
                onChange={(e) => setForm({ ...form, payment_private_key: e.target.value })}
                placeholder={
                  paymentConfig?.has_private_key
                    ? '•••••••• (dejar vacío para mantener)'
                    : 'prv_prod_... o prv_test_...'
                }
              />
              {paymentConfig?.has_private_key && (
                <span className="hint">Private Key guardada de forma segura</span>
              )}
            </label>
            <label>
              Webhook Secret (Events Secret de Wompi)
              <input
                type="password"
                value={form.payment_webhook_secret}
                onChange={(e) => setForm({ ...form, payment_webhook_secret: e.target.value })}
                placeholder={
                  paymentConfig?.has_webhook_secret
                    ? '•••••••• (dejar vacío para mantener)'
                    : 'Secreto para verificar webhooks'
                }
              />
              {paymentConfig?.has_webhook_secret && (
                <span className="hint">Webhook Secret guardado</span>
              )}
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

            <div className="actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleValidatePayment}
                disabled={validatingPayment || !paymentConfig?.has_private_key}
              >
                {validatingPayment ? 'Validando Wompi...' : 'Validar pasarela de pagos'}
              </button>
            </div>
          </div>
        </section>

        <button type="submit" className="btn-primary save-all" disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar integraciones'}
        </button>
      </form>

      {message && <div className="toast">{message}</div>}

      <style jsx>{`
        .panel {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .panel-form {
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
        .hint {
          display: block;
          margin-top: 0.35rem;
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        .status-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.65rem;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .status-badge.ok {
          background: rgba(34, 197, 94, 0.15);
          color: #16a34a;
        }
        .status-badge.warn {
          background: rgba(234, 179, 8, 0.15);
          color: #ca8a04;
        }
        .hint-inline {
          color: var(--text-muted);
          font-size: 0.82rem;
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
        .save-all {
          align-self: flex-start;
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
