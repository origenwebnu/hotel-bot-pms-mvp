'use client';

import { useEffect, useState } from 'react';
import { api, type IntegrationStatus, type PaymentConfig } from '@/lib/api';
import { IntegrationViewShell } from '@/components/IntegrationViewShell';
import { HOTEL_TAB_DESCRIPTIONS } from '@/lib/app-shell-nav';

interface Props {
  integration: IntegrationStatus | null;
  onUpdate: (i: IntegrationStatus) => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  wompi: 'Wompi',
  bold: 'Bold',
  epayco: 'ePayco',
  stripe: 'Stripe',
};

const PROVIDER_UI: Record<
  string,
  {
    requires_public_key: boolean;
    requires_customer_id: boolean;
    show_webhook_secret: boolean;
    private_key_label: string;
    public_key_label: string;
    webhook_secret_label: string;
    webhook_help: string;
    setup_steps: string[];
  }
> = {
  wompi: {
    requires_public_key: true,
    requires_customer_id: false,
    show_webhook_secret: true,
    private_key_label: 'Private Key',
    public_key_label: 'Public Key',
    webhook_secret_label: 'Webhook Secret (Events Secret)',
    webhook_help:
      'Copia esta URL en Wompi → Configuración → Eventos. El Webhook Secret es el "Events Secret" que te da Wompi.',
    setup_steps: [
      'En Wompi → Configuración → Eventos, agrega la URL de eventos indicada abajo.',
      'Copia el Events Secret de Wompi y pégalo en Webhook Secret.',
      'Ingresa Public Key y Private Key de Wompi.',
      'Pulsa Validar pasarela de pagos.',
    ],
  },
  bold: {
    requires_public_key: false,
    requires_customer_id: false,
    show_webhook_secret: false,
    private_key_label: 'API Key (llave de identidad)',
    public_key_label: 'Public Key',
    webhook_secret_label: 'Webhook Secret',
    webhook_help:
      'En Bold → Integraciones → Webhooks, agrega la URL para eventos SALE_APPROVED y SALE_REJECTED.',
    setup_steps: [
      'Obtén tu API Key en Bold → Integraciones → Llaves de integración.',
      'Pégala en API Key y guarda.',
      'Configura la URL de webhook en Bold.',
      'Pulsa Validar pasarela de pagos.',
    ],
  },
  epayco: {
    requires_public_key: true,
    requires_customer_id: true,
    show_webhook_secret: true,
    private_key_label: 'Private Key (llave privada)',
    public_key_label: 'Public Key (llave pública)',
    webhook_secret_label: 'P_KEY (firma de confirmación)',
    webhook_help:
      'En ePayco → Integraciones → Webhooks, configura la URL de confirmación (POST). Customer ID (COD_EMP) y P_KEY están en tu panel ePayco.',
    setup_steps: [
      'Ingresa Public Key y Private Key de ePayco.',
      'Ingresa Customer ID (COD_EMP) y P_KEY.',
      'Configura la URL de confirmación en ePayco.',
      'Pulsa Validar pasarela de pagos.',
    ],
  },
  stripe: {
    requires_public_key: false,
    requires_customer_id: false,
    show_webhook_secret: false,
    private_key_label: 'Secret Key',
    public_key_label: 'Public Key',
    webhook_secret_label: 'Webhook Signing Secret',
    webhook_help: 'En Stripe → Developers → Webhooks, agrega la URL indicada abajo.',
    setup_steps: [
      'Ingresa tu Secret Key de Stripe.',
      'Configura el webhook en Stripe.',
      'Pulsa Validar pasarela de pagos.',
    ],
  },
};

function resolveWebhookUrl(provider: string, cfg: PaymentConfig): string {
  switch (provider) {
    case 'bold':
      return cfg.bold_webhook_url;
    case 'epayco':
      return cfg.epayco_webhook_url;
    case 'stripe':
      return cfg.stripe_webhook_url;
    default:
      return cfg.wompi_webhook_url;
  }
}

export function PaymentIntegrationPanel({ integration, onUpdate }: Props) {
  const [form, setForm] = useState({
    payment_provider: integration?.payment_provider ?? 'wompi',
    payment_public_key: '',
    payment_private_key: '',
    payment_webhook_secret: '',
    payment_customer_id: '',
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
        payment_provider: paymentConfig.provider ?? prev.payment_provider,
        reservation_recommendations: paymentConfig.reservation_recommendations,
      }));
    }
  }, [paymentConfig]);

  async function refreshPaymentConfig() {
    const cfg = await api.getPaymentConfig();
    setPaymentConfig(cfg);
    return cfg;
  }

  const providerLabel =
    PROVIDER_LABELS[form.payment_provider] ?? form.payment_provider;
  const ui =
    paymentConfig?.provider === form.payment_provider
      ? {
          requires_public_key: paymentConfig.requires_public_key,
          requires_customer_id: paymentConfig.requires_customer_id,
          show_webhook_secret:
            form.payment_provider === 'wompi' || form.payment_provider === 'epayco',
          private_key_label: paymentConfig.private_key_label,
          public_key_label: paymentConfig.public_key_label,
          webhook_secret_label: paymentConfig.webhook_secret_label,
          webhook_help: paymentConfig.webhook_help,
          setup_steps: paymentConfig.setup_steps,
        }
      : PROVIDER_UI[form.payment_provider] ?? PROVIDER_UI.wompi;
  const showPublicKey = ui.requires_public_key;
  const showCustomerId = ui.requires_customer_id;
  const showWebhookSecret = ui.show_webhook_secret;
  const webhookUrl = paymentConfig
    ? resolveWebhookUrl(form.payment_provider, paymentConfig)
    : '';

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
      if (form.payment_customer_id.trim()) {
        payload.payment_customer_id = form.payment_customer_id.trim();
      }

      const updated = await api.updateIntegration(payload);
      onUpdate(updated);
      setForm((prev) => ({
        ...prev,
        payment_public_key: '',
        payment_private_key: '',
        payment_webhook_secret: '',
        payment_customer_id: '',
      }));
      const cfg = await refreshPaymentConfig();
      const savedKeys =
        payload.payment_public_key ||
        payload.payment_private_key ||
        payload.payment_webhook_secret ||
        payload.payment_customer_id;
      if (savedKeys && cfg.has_private_key) {
        setMessage('Configuración guardada. Credenciales almacenadas de forma segura.');
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
          `✓ ${providerLabel} conectado correctamente${result.api_base ? ` (${result.api_base})` : ''}`,
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
            Configura Wompi, Bold, ePayco o Stripe para procesar pagos de reservas directas en
            Colombia.
          </p>

          {paymentConfig && (
            <div className="integration-info-box">
              <strong>URL de webhook / confirmación ({providerLabel})</strong>
              <code>{webhookUrl}</code>
              <p>{ui.webhook_help}</p>
              <ol>
                {ui.setup_steps.map((step) => (
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
              <option value="bold">Bold</option>
              <option value="epayco">ePayco</option>
              <option value="stripe">Stripe</option>
            </select>
          </label>

          {showPublicKey && (
            <label>
              {ui.public_key_label ?? 'Public Key'}
              <input
                type="password"
                value={form.payment_public_key}
                onChange={(e) => setForm({ ...form, payment_public_key: e.target.value })}
                placeholder={
                  paymentConfig?.has_public_key
                    ? paymentConfig.public_key_hint
                      ? `${paymentConfig.public_key_hint} (dejar vacío para mantener)`
                      : '•••••••• (dejar vacío para mantener)'
                    : form.payment_provider === 'epayco'
                      ? 'Llave pública ePayco'
                      : 'pub_prod_... o pub_test_...'
                }
              />
              {paymentConfig?.has_public_key && (
                <span className="field-hint">
                  Guardada: {paymentConfig.public_key_hint ?? 'sí'}
                </span>
              )}
            </label>
          )}

          <label>
            {ui.private_key_label ?? 'Private Key / API Key'}
            <input
              type="password"
              value={form.payment_private_key}
              onChange={(e) => setForm({ ...form, payment_private_key: e.target.value })}
              placeholder={
                paymentConfig?.has_private_key
                  ? '•••••••• (dejar vacío para mantener)'
                  : form.payment_provider === 'bold'
                    ? 'API Key de Bold'
                    : 'prv_prod_... o prv_test_...'
              }
            />
            {paymentConfig?.has_private_key && (
              <span className="field-hint">Llave guardada de forma segura</span>
            )}
          </label>

          {showCustomerId && (
            <label>
              Customer ID (COD_EMP)
              <input
                type="password"
                value={form.payment_customer_id}
                onChange={(e) => setForm({ ...form, payment_customer_id: e.target.value })}
                placeholder={
                  paymentConfig?.has_customer_id
                    ? paymentConfig.customer_id_hint
                      ? `${paymentConfig.customer_id_hint} (dejar vacío para mantener)`
                      : '•••••••• (dejar vacío para mantener)'
                    : 'ID de comercio ePayco'
                }
              />
              {paymentConfig?.has_customer_id && (
                <span className="field-hint">Customer ID guardado</span>
              )}
            </label>
          )}

          {showWebhookSecret && (
            <label>
              {ui.webhook_secret_label ?? 'Webhook Secret'}
              <input
                type="password"
                value={form.payment_webhook_secret}
                onChange={(e) => setForm({ ...form, payment_webhook_secret: e.target.value })}
                placeholder={
                  paymentConfig?.has_webhook_secret
                    ? '•••••••• (dejar vacío para mantener)'
                    : form.payment_provider === 'epayco'
                      ? 'P_KEY de ePayco'
                      : 'Secreto para verificar webhooks'
                }
              />
              {paymentConfig?.has_webhook_secret && (
                <span className="field-hint">Secreto guardado</span>
              )}
            </label>
          )}

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
              {validatingPayment ? `Validando ${providerLabel}...` : 'Validar pasarela de pagos'}
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
