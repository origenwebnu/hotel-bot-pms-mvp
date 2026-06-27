'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, type WhatsAppConfig } from '@/lib/api';
import { IntegrationViewShell } from '@/components/IntegrationViewShell';
import { HOTEL_TAB_DESCRIPTIONS } from '@/lib/app-shell-nav';
import {
  META_LINKS,
  WIZARD_STEPS,
  validateAccessToken,
  validateDisplayPhone,
  validatePhoneNumberId,
  type WizardStepId,
} from '@/lib/whatsapp-setup-wizard';

interface Props {
  onConnectionChange?: (connected: boolean) => void;
}

const PREREQUISITE_ITEMS = [
  {
    id: 'meta-business',
    label: 'Tengo una cuenta de Meta Business activa',
    link: META_LINKS.businessSuite,
    linkLabel: 'Abrir Meta Business',
  },
  {
    id: 'whatsapp-number',
    label: 'Mi hotel tiene un número de WhatsApp Business verificado',
    link: META_LINKS.whatsappManager,
    linkLabel: 'Abrir WhatsApp Manager',
  },
  {
    id: 'admin-access',
    label: 'Tengo permisos de administrador en esa cuenta',
  },
] as const;

function stepIndex(step: WizardStepId) {
  return WIZARD_STEPS.findIndex((s) => s.id === step);
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button type="button" className="btn-copy" onClick={handleCopy}>
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

export function WhatsAppPanel({ onConnectionChange }: Props) {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStepId>('prerequisites');
  const [checkedPrereqs, setCheckedPrereqs] = useState<Record<string, boolean>>({});

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [accessToken, setAccessToken] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
        if (c.connected) {
          setCurrentStep('validate');
        } else if (c.has_token && c.phone_number_id) {
          setCurrentStep('validate');
        } else if (c.phone_number_id) {
          setCurrentStep('token');
        }
      })
      .catch(console.error);
  }, []);

  const prerequisitesDone = PREREQUISITE_ITEMS.every((item) => checkedPrereqs[item.id]);

  const completedSteps = useMemo(() => {
    const done = new Set<WizardStepId>();
    if (prerequisitesDone) done.add('prerequisites');
    if (!validatePhoneNumberId(phoneNumberId)) done.add('phone-id');
    if (!validateAccessToken(accessToken, config?.has_token ?? false)) done.add('token');
    if (displayPhone.trim() || config?.connected) done.add('display-phone');
    if (config?.connected) done.add('validate');
    return done;
  }, [prerequisitesDone, phoneNumberId, accessToken, config, displayPhone]);

  function goToStep(step: WizardStepId) {
    setCurrentStep(step);
    setMessage('');
    setFieldErrors({});
  }

  function goNext() {
    const idx = stepIndex(currentStep);
    if (idx < WIZARD_STEPS.length - 1) {
      goToStep(WIZARD_STEPS[idx + 1].id);
    }
  }

  function goBack() {
    const idx = stepIndex(currentStep);
    if (idx > 0) {
      goToStep(WIZARD_STEPS[idx - 1].id);
    }
  }

  function validateCurrentStep(): boolean {
    const errors: Record<string, string> = {};

    if (currentStep === 'phone-id') {
      const err = validatePhoneNumberId(phoneNumberId);
      if (err) errors.phoneNumberId = err;
    }

    if (currentStep === 'token') {
      const err = validateAccessToken(accessToken, config?.has_token ?? false);
      if (err) errors.accessToken = err;
    }

    if (currentStep === 'display-phone') {
      const err = validateDisplayPhone(displayPhone);
      if (err) errors.displayPhone = err;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave(options?: { advance?: boolean; silent?: boolean }) {
    if (!validateCurrentStep()) return false;

    setLoading(true);
    if (!options?.silent) setMessage('');

    try {
      const updated = await api.updateWhatsApp({
        phone_number_id: phoneNumberId,
        display_phone: displayPhone,
        ...(accessToken.trim() ? { access_token: accessToken } : {}),
      });
      setConfig(updated);
      setAccessToken('');
      setDisplayPhone(updated.display_phone ?? '');
      onConnectionChange?.(updated.connected);
      if (!options?.silent) {
        setMessage('Configuración guardada correctamente.');
      }
      if (options?.advance) goNext();
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    if (currentStep === 'prerequisites') {
      if (!prerequisitesDone) {
        setMessage('Marca todos los requisitos antes de continuar.');
        return;
      }
      goNext();
      return;
    }

    if (currentStep === 'display-phone') {
      const saved = await handleSave({ advance: true, silent: !displayPhone.trim() });
      if (saved || !displayPhone.trim()) goNext();
      return;
    }

    if (currentStep === 'phone-id' || currentStep === 'token') {
      const saved = await handleSave({ advance: true });
      if (saved) goNext();
      return;
    }
  }

  async function handleValidate() {
    setValidating(true);
    setMessage('');

    const saved = await handleSave({ silent: true });
    if (!saved) {
      setValidating(false);
      return;
    }

    try {
      const { valid } = await api.validateWhatsApp();
      const refreshed = await api.getWhatsApp();
      setConfig(refreshed);
      setDisplayPhone(refreshed.display_phone ?? '');
      onConnectionChange?.(refreshed.connected);

      setMessage(
        valid
          ? 'WhatsApp conectado y verificado. Ya puedes recibir reservas por chat.'
          : 'No se pudo verificar. Revisa el Phone Number ID y el Access Token en Meta.',
      );
    } catch {
      setMessage('Error al validar la conexión con WhatsApp');
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
      <div className="wa-wizard">
        <nav className="wa-wizard-steps" aria-label="Pasos de configuración WhatsApp">
          {WIZARD_STEPS.map((step, index) => {
            const isActive = step.id === currentStep;
            const isDone = completedSteps.has(step.id);
            return (
              <button
                key={step.id}
                type="button"
                className={`wa-wizard-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                onClick={() => goToStep(step.id)}
              >
                <span className="wa-wizard-step-num">{isDone ? '✓' : index + 1}</span>
                <span className="wa-wizard-step-label">{step.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="wa-wizard-layout">
          <section className="integration-card glass-panel wa-wizard-main">
            {currentStep === 'prerequisites' && (
              <>
                <h3 className="wa-wizard-title">Antes de empezar</h3>
                <p className="integration-lead">
                  Necesitas acceso a Meta Business y un número de WhatsApp Business del hotel.
                  BookiChat se conecta a tu número; el webhook ya está configurado por nosotros.
                </p>

                <ul className="wa-checklist">
                  {PREREQUISITE_ITEMS.map((item) => (
                    <li key={item.id}>
                      <label className="wa-checklist-item">
                        <input
                          type="checkbox"
                          checked={Boolean(checkedPrereqs[item.id])}
                          onChange={(e) =>
                            setCheckedPrereqs((prev) => ({
                              ...prev,
                              [item.id]: e.target.checked,
                            }))
                          }
                        />
                        <span>{item.label}</span>
                      </label>
                      {'link' in item && item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="wa-external-link"
                        >
                          {item.linkLabel} ↗
                        </a>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="integration-info-box wa-webhook-box">
                  <strong>Webhook de BookiChat (no lo cambies en Meta)</strong>
                  <div className="wa-code-row">
                    <code>{config.webhook_url}</code>
                    <CopyButton value={config.webhook_url} />
                  </div>
                  <p>
                    Esta URL ya está registrada en la plataforma. Tu hotel solo debe conectar su
                    número y token; no necesitas configurar webhooks manualmente.
                  </p>
                </div>
              </>
            )}

            {currentStep === 'phone-id' && (
              <>
                <h3 className="wa-wizard-title">Paso 2 — Phone Number ID</h3>
                <ol className="wa-instructions">
                  <li>
                    Abre{' '}
                    <a href={META_LINKS.developersApps} target="_blank" rel="noopener noreferrer">
                      Meta for Developers ↗
                    </a>{' '}
                    y entra a la app de WhatsApp de tu hotel.
                  </li>
                  <li>
                    Ve a <strong>WhatsApp → Configuración de la API</strong> (API Setup).
                  </li>
                  <li>
                    Copia el <strong>Phone number ID</strong> del número que usarás para reservas.
                  </li>
                  <li>Pégalo abajo y guarda para continuar.</li>
                </ol>

                <div className="integration-form">
                  <label className={fieldErrors.phoneNumberId ? 'has-error' : ''}>
                    Phone Number ID
                    <input
                      type="text"
                      inputMode="numeric"
                      value={phoneNumberId}
                      onChange={(e) => {
                        setPhoneNumberId(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, phoneNumberId: '' }));
                      }}
                      placeholder="1171887486007790"
                    />
                    {fieldErrors.phoneNumberId ? (
                      <span className="field-error">{fieldErrors.phoneNumberId}</span>
                    ) : (
                      <span className="field-hint">
                        Solo números. Lo encuentras en Meta → WhatsApp → Configuración de la API
                      </span>
                    )}
                  </label>
                </div>
              </>
            )}

            {currentStep === 'token' && (
              <>
                <h3 className="wa-wizard-title">Paso 3 — Access Token permanente</h3>
                <ol className="wa-instructions">
                  <li>
                    En{' '}
                    <a href={META_LINKS.businessSuite} target="_blank" rel="noopener noreferrer">
                      Meta Business ↗
                    </a>
                    , ve a <strong>Configuración → Usuarios → Usuarios del sistema</strong>.
                  </li>
                  <li>
                    Crea o selecciona un usuario del sistema con acceso a WhatsApp y genera un{' '}
                    <strong>token permanente</strong>.
                  </li>
                  <li>
                    Asigna permisos de <strong>WhatsApp Business Management</strong> y{' '}
                    <strong>WhatsApp Business Messaging</strong>.
                  </li>
                  <li>Pega el token abajo. Se guarda cifrado en BookiChat.</li>
                </ol>

                <a
                  href={META_LINKS.whatsAppApiDocs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wa-external-link wa-docs-link"
                >
                  Ver documentación oficial de Meta ↗
                </a>

                <div className="integration-form">
                  <label className={fieldErrors.accessToken ? 'has-error' : ''}>
                    Access Token
                    <input
                      type="password"
                      value={accessToken}
                      onChange={(e) => {
                        setAccessToken(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, accessToken: '' }));
                      }}
                      placeholder={
                        config.has_token
                          ? '•••••••• (dejar vacío para mantener el actual)'
                          : 'EAA... token permanente'
                      }
                    />
                    {fieldErrors.accessToken ? (
                      <span className="field-error">{fieldErrors.accessToken}</span>
                    ) : config.has_token ? (
                      <span className="field-hint">Token guardado de forma segura. Puedes dejarlo vacío.</span>
                    ) : (
                      <span className="field-hint">Empieza normalmente con EAA…</span>
                    )}
                  </label>
                </div>
              </>
            )}

            {currentStep === 'display-phone' && (
              <>
                <h3 className="wa-wizard-title">Paso 4 — Número público (opcional)</h3>
                <p className="integration-lead">
                  Este número se usa en la galería de habitaciones para el botón &quot;Continuar
                  reserva&quot;. Si lo dejas vacío, intentamos detectarlo al validar la conexión.
                </p>

                <div className="integration-form">
                  <label className={fieldErrors.displayPhone ? 'has-error' : ''}>
                    Número WhatsApp
                    <input
                      type="text"
                      inputMode="tel"
                      value={displayPhone}
                      onChange={(e) => {
                        setDisplayPhone(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, displayPhone: '' }));
                      }}
                      placeholder="573001234567"
                    />
                    {fieldErrors.displayPhone ? (
                      <span className="field-error">{fieldErrors.displayPhone}</span>
                    ) : (
                      <span className="field-hint">
                        Formato internacional sin + (ej: 573001234567)
                      </span>
                    )}
                  </label>
                </div>
              </>
            )}

            {currentStep === 'validate' && (
              <>
                <h3 className="wa-wizard-title">Paso 5 — Probar conexión</h3>
                <p className="integration-lead">
                  Verificamos con Meta que el Phone Number ID y el token funcionen con tu número.
                </p>

                <dl className="wa-summary">
                  <div>
                    <dt>Phone Number ID</dt>
                    <dd>{phoneNumberId || '—'}</dd>
                  </div>
                  <div>
                    <dt>Access Token</dt>
                    <dd>{config.has_token || accessToken.trim() ? 'Configurado' : 'Falta'}</dd>
                  </div>
                  <div>
                    <dt>Número público</dt>
                    <dd>{displayPhone || config.display_phone || 'Se detectará al validar'}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      <span
                        className={`pill ${config.connected ? 'ok' : 'off'}`}
                      >
                        {config.connected ? 'Conectado' : 'Sin conectar'}
                      </span>
                    </dd>
                  </div>
                </dl>

                <div className="integration-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleValidate}
                    disabled={validating || !phoneNumberId.trim()}
                  >
                    {validating ? 'Probando conexión…' : 'Probar conexión'}
                  </button>
                </div>

                {config.connected && (
                  <div className="wa-success-box">
                    <strong>¡Listo!</strong>
                    <p>
                      Envía un mensaje de prueba al número de tu hotel desde WhatsApp para confirmar
                      que el bot responde.
                    </p>
                  </div>
                )}
              </>
            )}

            {message && (
              <div
                className={`integration-toast ${
                  message.includes('Error') ||
                  message.includes('No se') ||
                  message.includes('Revisa') ||
                  message.includes('Marca')
                    ? 'error'
                    : 'ok'
                }`}
              >
                {message}
              </div>
            )}

            <div className="wa-wizard-nav">
              {stepIndex(currentStep) > 0 && (
                <button type="button" className="btn-secondary" onClick={goBack}>
                  Anterior
                </button>
              )}
              {currentStep !== 'validate' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleNext}
                  disabled={loading}
                >
                  {loading ? 'Guardando…' : 'Siguiente'}
                </button>
              )}
            </div>
          </section>

          <aside className="wa-wizard-aside glass-panel">
            <h4>Checklist rápido</h4>
            <ul className="wa-aside-checklist">
              {WIZARD_STEPS.map((step) => (
                <li key={step.id} className={completedSteps.has(step.id) ? 'done' : ''}>
                  {completedSteps.has(step.id) ? '✓' : '○'} {step.label}
                </li>
              ))}
            </ul>
            <p className="integration-note">
              ¿Necesitas ayuda? Escríbenos a soporte BookiChat con capturas de Meta Business.
            </p>
          </aside>
        </div>
      </div>
    </IntegrationViewShell>
  );
}
