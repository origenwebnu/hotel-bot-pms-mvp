'use client';

import { useEffect, useState } from 'react';
import { superAdminApi, type PlatformBillingConfig } from '@/lib/super-admin-api';

export function SubscriptionBillingAdminPanel() {
  const [config, setConfig] = useState<PlatformBillingConfig | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    superAdminApi
      .getBillingConfig()
      .then(setConfig)
      .catch(() => setMessage('Error cargando configuración de pagos'))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const updated = await superAdminApi.updateBillingConfig({
        ...(accessToken.trim() && { mercadopago_access_token: accessToken.trim() }),
        ...(publicKey.trim() && { mercadopago_public_key: publicKey.trim() }),
      });
      setConfig(updated);
      setAccessToken('');
      setPublicKey('');
      setMessage('Credenciales de Mercado Pago guardadas.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    setValidating(true);
    setMessage('');
    try {
      const result = await superAdminApi.validateBillingConfig();
      setMessage(
        result.valid
          ? `Conexión OK${result.user_id ? ` — cuenta MP ${result.user_id}` : ''}.`
          : result.reason ?? 'Credenciales inválidas',
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al validar');
    } finally {
      setValidating(false);
    }
  }

  if (loading) {
    return (
      <div className="panel">
        <p className="muted">Cargando pagos de suscripción…</p>
      </div>
    );
  }

  return (
    <form className="panel form-panel" onSubmit={save}>
      <h2>Pagos de suscripción — Mercado Pago</h2>
      <p className="muted">
        Credenciales de la cuenta de BookiChat para cobrar planes mensuales a hoteles y
        restaurantes. Los negocios pagan desde <strong>Mi cuenta</strong> en su panel.
      </p>

      {message && (
        <div className={message.includes('Error') || message.includes('inválid') || message.includes('rechaz') ? 'error-banner' : 'info-banner'}>
          {message}
        </div>
      )}

      <div className="billing-status">
        <span className={`pill ${config?.configured ? 'ok' : 'warn'}`}>
          {config?.configured ? 'Configurado' : 'Sin configurar'}
        </span>
        {config?.access_token_hint && (
          <span className="muted">Access Token: {config.access_token_hint}</span>
        )}
        {config?.public_key_hint && (
          <span className="muted">Public Key: {config.public_key_hint}</span>
        )}
      </div>

      <label>
        Access Token de Mercado Pago
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder={config?.has_access_token ? 'Dejar vacío para mantener el actual' : 'APP_USR-… o TEST-…'}
          autoComplete="off"
        />
      </label>
      <label>
        Public Key (opcional)
        <input
          type="text"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder={config?.has_public_key ? 'Dejar vacío para mantener la actual' : 'APP_USR-…'}
          autoComplete="off"
        />
      </label>

      <label>
        Webhook (configurar en Mercado Pago Developers)
        <div className="webhook-row">
          <input type="text" readOnly value={config?.webhook_url ?? ''} />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => config?.webhook_url && navigator.clipboard.writeText(config.webhook_url)}
          >
            Copiar
          </button>
        </div>
      </label>

      <p className="muted small">
        En Mercado Pago → Tu integración → Webhooks, suscríbete a eventos de{' '}
        <strong>pagos</strong> con esta URL. Usa credenciales de producción en live y{' '}
        <strong>TEST-</strong> para pruebas.
      </p>

      <div className="billing-actions">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar credenciales'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={validating || !config?.configured}
          onClick={validate}
        >
          {validating ? 'Validando…' : 'Probar conexión'}
        </button>
      </div>

      <style jsx>{`
        .billing-status {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: center;
          margin-bottom: 1rem;
        }
        .webhook-row {
          display: flex;
          gap: 0.5rem;
        }
        .webhook-row input {
          flex: 1;
        }
        .billing-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.5rem;
        }
        .small {
          font-size: 0.85rem;
        }
      `}</style>
    </form>
  );
}
