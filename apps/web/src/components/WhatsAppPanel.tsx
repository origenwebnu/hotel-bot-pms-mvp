'use client';

import { useEffect, useState } from 'react';
import { api, type WhatsAppConfig } from '@/lib/api';

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
    api.getWhatsApp().then((c) => {
      setConfig(c);
      setPhoneNumberId(c.phone_number_id ?? '');
      setDisplayPhone(c.display_phone ?? '');
    }).catch(console.error);
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
      setMessage(valid ? '✓ WhatsApp conectado y verificado' : '✗ No se pudo verificar. Revisa Phone Number ID y token.');
    } catch {
      setMessage('Error al validar WhatsApp');
    } finally {
      setValidating(false);
    }
  }

  if (!config) {
    return <p className="desc">Cargando configuración WhatsApp...</p>;
  }

  return (
    <section className="card">
      <h2>WhatsApp Business</h2>
      <p className="desc">
        Conecta el número de WhatsApp de tu hotel. Cada hotel usa su propio Phone Number ID y token de Meta.
      </p>

      <div className="info-box">
        <strong>Webhook (configurado por BookiChat — no lo cambies en Meta):</strong>
        <code>{config.webhook_url}</code>
      </div>

      <ol className="steps">
        {config.setup_steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      <form onSubmit={handleSave} className="form">
        <label>
          Phone Number ID
          <input
            type="text"
            required
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="1171887486007790"
          />
          <span className="hint">Meta → WhatsApp → Configuración de la API</span>
        </label>

        <label>
          Access Token
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={config.has_token ? '•••••••• (dejar vacío para mantener)' : 'EAA... token permanente de Meta'}
          />
          <span className="hint">Usuario del sistema → Generar identificador</span>
        </label>

        <label>
          Número WhatsApp (para volver desde la galería)
          <input
            type="text"
            value={displayPhone}
            onChange={(e) => setDisplayPhone(e.target.value)}
            placeholder="573001234567"
          />
          <span className="hint">
            Formato internacional sin + (ej: 573001234567). Se detecta al validar o puedes ingresarlo manualmente.
          </span>
        </label>

        <div className="status-row">
          <span className={`status-badge ${config.connected ? 'ok' : 'warn'}`}>
            {config.connected ? 'Conectado' : 'Sin verificar'}
          </span>
          {config.has_token && <span className="hint-inline">Token guardado</span>}
        </div>

        <div className="actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar WhatsApp'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleValidate} disabled={validating}>
            {validating ? 'Validando...' : 'Validar conexión'}
          </button>
        </div>
      </form>

      {message && <div className="toast">{message}</div>}

      <style jsx>{`
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.5rem;
        }
        h2 { font-size: 1.15rem; margin-bottom: 0.35rem; }
        .desc { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem; }
        .info-box {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin-bottom: 1rem;
          font-size: 0.85rem;
        }
        .info-box code {
          display: block;
          margin-top: 0.35rem;
          word-break: break-all;
          color: var(--accent);
        }
        .steps {
          margin: 0 0 1.25rem 1.25rem;
          color: var(--text-muted);
          font-size: 0.85rem;
          line-height: 1.6;
        }
        .form { display: flex; flex-direction: column; gap: 1rem; }
        label {
          display: flex; flex-direction: column; gap: 0.35rem;
          font-size: 0.85rem; color: var(--text-muted);
        }
        input {
          padding: 0.65rem 0.875rem;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
        }
        .hint { font-size: 0.75rem; color: var(--text-muted); opacity: 0.85; }
        .status-row { display: flex; align-items: center; gap: 0.75rem; }
        .status-badge {
          font-size: 0.8rem;
          padding: 0.25rem 0.65rem;
          border-radius: 12px;
          font-weight: 500;
        }
        .status-badge.ok { background: rgba(34,197,94,0.15); color: var(--success); }
        .status-badge.warn { background: rgba(245,158,11,0.15); color: var(--warning); }
        .hint-inline { font-size: 0.8rem; color: var(--text-muted); }
        .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .btn-primary {
          padding: 0.75rem 1.5rem;
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 600;
        }
        .btn-secondary {
          padding: 0.65rem 1.25rem;
          background: var(--surface-hover);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .toast {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--surface-hover);
          border-radius: 8px;
          border-left: 3px solid var(--accent);
        }
      `}</style>
    </section>
  );
}
