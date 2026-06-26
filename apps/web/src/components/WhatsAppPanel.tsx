'use client';

import { useEffect, useState } from 'react';
import { api, type WhatsAppConfig } from '@/lib/api';
import { IntegrationViewShell } from '@/components/IntegrationViewShell';
import { HOTEL_TAB_DESCRIPTIONS } from '@/lib/app-shell-nav';

interface Props {
  onConnectionChange?: (connected: boolean) => void;
}

export function WhatsAppPanel({ onConnectionChange }: Props) {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .getWhatsApp()
      .then((c) => {
        setConfig(c);
        setPhoneNumberId(c.phone_number_id ?? '');
        setDisplayPhone(c.display_phone ?? '');
      })
      .catch(console.error);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const updated = await api.updateWhatsApp({
        phone_number_id: phoneNumberId,
        display_phone: displayPhone,
        ...(accessToken.trim() ? { access_token: accessToken } : {}),
      });
      setConfig(updated);
      setAccessToken('');
      setDisplayPhone(updated.display_phone ?? '');
      setMessage('WhatsApp guardado correctamente.');
      onConnectionChange?.(updated.connected);
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
      const { valid } = await api.validateWhatsApp();
      if (config) {
        const refreshed = await api.getWhatsApp();
        setConfig(refreshed);
        setDisplayPhone(refreshed.display_phone ?? '');
        onConnectionChange?.(refreshed.connected);
      }
      setMessage(
        valid
          ? '✓ WhatsApp conectado y verificado'
          : '✗ No se pudo verificar. Revisa Phone Number ID y token.',
      );
    } catch {
      setMessage('Error al validar WhatsApp');
    } finally {
      setValidating(false);
    }
  }

  if (!config) {
    return <p className="integration-loading">Cargando configuración WhatsApp...</p>;
  }

  return (
    <IntegrationViewShell
      title="WhatsApp Business"
      description={HOTEL_TAB_DESCRIPTIONS['integration-whatsapp']}
      statusLabel={config.connected ? 'Conectado' : 'Sin conectar'}
      statusOk={config.connected}
    >
      <section className="integration-card glass-panel">
        <div className="integration-info-box">
          <strong>Webhook (configurado por BookiChat — no lo cambies en Meta):</strong>
          <code>{config.webhook_url}</code>
        </div>

        <ol className="integration-steps">
          {config.setup_steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        <form onSubmit={handleSave} className="integration-form">
          <label>
            Phone Number ID
            <input
              type="text"
              required
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="1171887486007790"
            />
            <span className="field-hint">Meta → WhatsApp → Configuración de la API</span>
          </label>

          <label>
            Access Token
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={
                config.has_token ? '•••••••• (dejar vacío para mantener)' : 'EAA... token permanente'
              }
            />
            <span className="field-hint">Usuario del sistema → Generar identificador</span>
          </label>

          <label>
            Número WhatsApp (para volver desde la galería)
            <input
              type="text"
              value={displayPhone}
              onChange={(e) => setDisplayPhone(e.target.value)}
              placeholder="573001234567"
            />
            <span className="field-hint">
              Formato internacional sin + (ej: 573001234567). Se detecta al validar o puedes
              ingresarlo manualmente.
            </span>
          </label>

          {config.has_token && (
            <p className="integration-note">Token de acceso guardado de forma segura.</p>
          )}

          <div className="integration-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar WhatsApp'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleValidate}
              disabled={validating}
            >
              {validating ? 'Validando...' : 'Validar conexión'}
            </button>
          </div>
        </form>

        {message && <div className="integration-toast">{message}</div>}
      </section>
    </IntegrationViewShell>
  );
}
