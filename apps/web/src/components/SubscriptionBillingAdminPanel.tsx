'use client';

import { useEffect, useState } from 'react';
import { superAdminApi, type PlatformBillingConfig } from '@/lib/super-admin-api';

function modeLabel(mode: PlatformBillingConfig['access_token_mode']) {
  if (mode === 'test') return 'Pruebas (TEST-)';
  if (mode === 'production') return 'Producción (APP_USR-)';
  return 'Sin definir';
}

function modeClass(mode: PlatformBillingConfig['access_token_mode']) {
  if (mode === 'test') return 'warn';
  if (mode === 'production') return 'ok';
  return 'off';
}

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
    const tokenValue = accessToken.trim();
    const publicKeyValue = publicKey.trim();

    if (!tokenValue && !publicKeyValue) {
      setMessage('Ingresa el Access Token de Mercado Pago antes de guardar.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const updated = await superAdminApi.updateBillingConfig({
        ...(tokenValue && { mercadopago_access_token: tokenValue }),
        ...(publicKeyValue && { mercadopago_public_key: publicKeyValue }),
      });
      setConfig(updated);
      setAccessToken('');
      setPublicKey('');
      setMessage(
        `Credenciales guardadas. Modo activo: ${modeLabel(updated.access_token_mode)}${
          updated.access_token_hint ? ` (${updated.access_token_hint})` : ''
        }.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    if (accessToken.trim() || publicKey.trim()) {
      setMessage('Guarda las credenciales primero y luego prueba la conexión.');
      return;
    }

    setValidating(true);
    setMessage('');
    try {
      const result = await superAdminApi.validateBillingConfig();
      setMessage(
        result.valid
          ? `Conexión OK — cuenta MP ${result.user_id ?? '—'} · ${modeLabel(config?.access_token_mode ?? null)}`
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
        <div
          className={
            message.includes('Error') ||
            message.includes('inválid') ||
            message.includes('rechaz') ||
            message.includes('Ingresa')
              ? 'error-banner'
              : 'info-banner'
          }
        >
          {message}
        </div>
      )}

      <div className="billing-status">
        <span className={`pill ${config?.configured ? 'ok' : 'warn'}`}>
          {config?.configured ? 'Configurado' : 'Sin configurar'}
        </span>
        {config?.access_token_mode && (
          <span className={`pill ${modeClass(config.access_token_mode)}`}>
            {modeLabel(config.access_token_mode)}
          </span>
        )}
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
          type="text"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder={
            config?.has_access_token
              ? 'Pega aquí el nuevo token (TEST- o APP_USR-)'
              : 'TEST-… o APP_USR-…'
          }
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        Public Key (opcional)
        <input
          type="text"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder={
            config?.has_public_key
              ? 'Pega aquí la nueva Public Key si quieres cambiarla'
              : 'TEST-… o APP_USR-…'
          }
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <p className="muted small">
        Para pruebas usa credenciales de <strong>Credenciales de prueba</strong> en Mercado Pago
        (token <strong>TEST-</strong>). Para cobros reales usa <strong>producción</strong>{' '}
        (<strong>APP_USR-</strong>). Debes pulsar <strong>Guardar credenciales</strong> antes de
        probar la conexión.
      </p>

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
        <strong>pagos</strong> con esta URL. Usa el webhook en modo <strong>Prueba</strong> si el
        token es TEST-, y en <strong>Producción</strong> si es APP_USR-.
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
