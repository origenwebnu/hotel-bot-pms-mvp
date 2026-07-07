'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  isEmbeddedSignupFinishEvent,
  launchCoexistenceSignup,
  loadFacebookSdk,
  parseEmbeddedSignupMessage,
  type EmbeddedSignupMessage,
} from '@/lib/whatsapp-embedded-signup';

interface Props {
  appId: string;
  configId: string;
  apiVersion: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onConnected: () => void;
}

export function WhatsAppCoexistenceConnect({
  appId,
  configId,
  apiVersion,
  onSuccess,
  onError,
  onConnected,
}: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef<EmbeddedSignupMessage | null>(null);
  const codeRef = useRef<string | null>(null);

  const tryComplete = useCallback(async () => {
    const session = sessionRef.current;
    const code = codeRef.current;
    if (!session || !code || !isEmbeddedSignupFinishEvent(session.event)) return;

    const phoneNumberId = session.data?.phone_number_id;
    const wabaId = session.data?.waba_id;
    if (!phoneNumberId || !wabaId) {
      onError('Meta no devolvió el número o la cuenta de WhatsApp. Completa el flujo en la ventana de Meta.');
      setLoading(false);
      return;
    }

    try {
      const result = await api.completeWhatsAppEmbeddedSignup({
        code,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        event: session.event,
      });
      onSuccess(result.message ?? 'WhatsApp conectado.');
      onConnected();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al completar la conexión');
    } finally {
      setLoading(false);
      sessionRef.current = null;
      codeRef.current = null;
    }
  }, [onConnected, onError, onSuccess]);

  useEffect(() => {
    let active = true;
    loadFacebookSdk(appId, apiVersion)
      .then(() => {
        if (active) setSdkReady(true);
      })
      .catch((err) => {
        onError(err instanceof Error ? err.message : 'Error cargando Meta SDK');
      });
    return () => {
      active = false;
    };
  }, [appId, apiVersion, onError]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      const parsed = parseEmbeddedSignupMessage(event.data);
      if (!parsed) return;

      if (parsed.event === 'ERROR') {
        onError('Meta reportó un error durante la conexión. Intenta de nuevo.');
        setLoading(false);
        return;
      }

      if (isEmbeddedSignupFinishEvent(parsed.event)) {
        sessionRef.current = parsed;
        void tryComplete();
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onError, tryComplete]);

  function handleLaunch() {
    if (!sdkReady) {
      onError('Espera un momento mientras cargamos Meta…');
      return;
    }

    setLoading(true);
    sessionRef.current = null;
    codeRef.current = null;

    launchCoexistenceSignup(
      configId,
      (code) => {
        codeRef.current = code;
        void tryComplete();
      },
      (message) => {
        onError(message);
        setLoading(false);
      },
    );
  }

  return (
    <div className="wa-coexistence-box">
      <h4>Conectar WhatsApp Business existente</h4>
      <p className="integration-lead">
        Usa el número que ya tienes en el celular. El bot y tu equipo comparten el mismo chat
        (coexistencia oficial de Meta).
      </p>

      <ol className="wa-instructions">
        <li>Haz clic en el botón y accede con tu cuenta de Meta Business.</li>
        <li>Elige <strong>conectar tu cuenta de WhatsApp Business existente</strong>.</li>
        <li>Ingresa el mismo número que usas en el celular.</li>
        <li>En la app WhatsApp Business: abre el mensaje de Meta → <strong>Conectar</strong> → confirma.</li>
      </ol>

      <div className="wa-coexistence-notes">
        <p className="muted small">
          Requisitos: WhatsApp Business app 2.24.17 o superior. No desinstales la app ni borres la
          cuenta.
        </p>
      </div>

      <button
        type="button"
        className="btn-primary wa-coexistence-btn"
        onClick={handleLaunch}
        disabled={loading || !sdkReady}
      >
        {loading
          ? 'Conectando con Meta…'
          : sdkReady
            ? 'Conectar mi WhatsApp Business'
            : 'Cargando Meta…'}
      </button>
    </div>
  );
}
