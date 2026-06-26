'use client';

import { useEffect, useState } from 'react';
import { api, type IntegrationStatus, type PaymentConfig } from '@/lib/api';
import { IntegrationViewShell } from '@/components/IntegrationViewShell';
import { HOTEL_TAB_DESCRIPTIONS } from '@/lib/app-shell-nav';

interface Props {
  integration: IntegrationStatus | null;
  onUpdate: (i: IntegrationStatus) => void;
}

export function PaymentIntegrationPanel({ integration, onUpdate }: Props) {
  const [form, setForm] = useState({
    payment_provider: integration?.payment_provider ?? 'wompi',
    payment_public_key: '',
    payment_private_key: '',
    payment_webhook_secret: '',
    reservation_recommendations: '',
  });
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [validatingPayment, setValidatingPayment] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getPaymentConfig().then(setPaymentConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (integration) {
      setForm((prev) => ({
        ...prev,
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
      const payload: Record<string, string> = {
        payment_provider: form.payment_provider,
        reservation_recommendations: form.reservation_recommendations,
      };
      if (form.payment_public_key.trim()) payload.payment_public_key = form.payment_public_key.trim();
      if (form.payment_private_key.trim()) payload.payment_private_key = form.payment_private_key.trim();
      if (form.payment_webhook_secret.trim()) {
        payload.payment_webhook_secret = form.payment_webhook_secret.trim();
      }

      const updated = await api.updateIntegration(payload);
      onUpdate(updated);
      setForm((prev) => ({
        ...prev,
        payment_public_key: '',
        payment_private_key: '',
        payment_webhook_secret: '',
      }));
      const cfg = await refreshPaymentConfig();
      const savedKeys =
        payload.payment_public_key || payload.payment_private_key || payload.payment_webhook_secret;
      if (savedKeys && cfg.has_private_key) {
        setMessage('Configuración guardada. Llaves almacenadas de forma segura.');
      } else {
        setMessage('Configuración de pagos guardada correctamente.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setLoading(false);
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
    <IntegrationViewShell
      title="Pagos / Recaudo"
      description={HOTEL_TAB_DESCRIPTIONS['integration-payments']}
      statusLabel={
        integration?.payment_connected || paymentConfig?.connected
          ? 'Conectado'
          : 'Sin conectar'
      }
      statusOk={Boolean(integration?.payment_connected || paymentConfig?.connected)}
    >
      <section className="integration-card glass-panel">
        <form onSubmit={handleSave} className="integration-form">
          <p className="integration-lead">
            Configura Wompi (Colombia) o Stripe para procesar pagos de reservas directas.
          </p>

          {paymentConfig && (
            <div className="integration-info-box">
              <strong>URL de eventos (Wompi)</strong>
              <code>{paymentConfig.webhook_url}</code>
              <p>
                Copia esta URL en Wompi → Configuración → Eventos. El Webhook Secret es el
                &quot;Events Secret&quot; que te da Wompi.
              </p>
              <ol>
                {paymentConfig.setup_steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}

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
              <span className="field-hint">Guardada: {paymentConfig.public_key_hint ?? 'sí'}</span>
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
              <span className="field-hint">Private Key guardada de forma segura</span>
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
              <span className="field-hint">Webhook Secret guardado</span>
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
          <p className="integration-note">
            Este texto se envía al huésped por WhatsApp cuando el pago es aprobado.
          </p>

          <div className="integration-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleValidatePayment}
              disabled={validatingPayment || !paymentConfig?.has_private_key}
            >
              {validatingPayment ? 'Validando Wompi...' : 'Validar pasarela de pagos'}
            </button>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar pagos'}
          </button>
        </form>
        {message && <div className="integration-toast">{message}</div>}
      </section>
    </IntegrationViewShell>
  );
}
