'use client';

import { useEffect, useState } from 'react';
import { api, type IntegrationStatus } from '@/lib/api';
import { IntegrationViewShell } from '@/components/IntegrationViewShell';
import { HOTEL_TAB_DESCRIPTIONS } from '@/lib/app-shell-nav';

interface Props {
  integration: IntegrationStatus | null;
  onUpdate: (i: IntegrationStatus) => void;
}

export function PmsIntegrationPanel({ integration, onUpdate }: Props) {
  const [form, setForm] = useState({
    pms_provider: integration?.pms_provider ?? 'local',
    pms_property_id: '',
    pms_api_key: '',
  });
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (integration) {
      setForm((prev) => ({
        ...prev,
        pms_provider: integration.pms_provider ?? 'local',
      }));
    }
  }, [integration]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const payload: Record<string, string> = { pms_provider: form.pms_provider };
      if (form.pms_property_id.trim()) payload.pms_property_id = form.pms_property_id.trim();
      if (form.pms_api_key.trim()) payload.pms_api_key = form.pms_api_key.trim();

      const updated = await api.updateIntegration(payload);
      onUpdate(updated);
      setForm((prev) => ({ ...prev, pms_api_key: '' }));
      setMessage('Configuración PMS guardada correctamente.');
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
    <IntegrationViewShell
      title="PMS"
      description={HOTEL_TAB_DESCRIPTIONS['integration-pms']}
      statusLabel={integration?.pms_connected ? 'Conectado' : 'Sin conectar'}
      statusOk={integration?.pms_connected}
    >
      <section className="integration-card glass-panel">
        <form onSubmit={handleSave} className="integration-form">
          <p className="integration-lead">
            Conecta Cloudbeds, Lobby PMS o usa inventario local para demos sin credenciales
            externas.
          </p>

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

          {form.pms_provider !== 'local' ? (
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
              <div className="integration-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleValidate}
                  disabled={validating}
                >
                  {validating ? 'Validando...' : 'Validar PMS'}
                </button>
              </div>
            </>
          ) : (
            <p className="integration-note">
              Con inventario local no necesitas API keys. Agrega habitaciones en{' '}
              <strong>Inventario</strong> o usa &quot;Cargar demo&quot;.
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar PMS'}
          </button>
        </form>
        {message && <div className="integration-toast">{message}</div>}
      </section>
    </IntegrationViewShell>
  );
}
