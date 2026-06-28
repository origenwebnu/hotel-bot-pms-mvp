'use client';

import {
  BUSINESS_VERTICAL_LABELS,
  type BusinessVertical,
} from '@hotel-bot/shared';

interface Props {
  vertical: BusinessVertical;
  infoOnlyMode: boolean;
}

export function BusinessOnboardingPanel({ vertical, infoOnlyMode }: Props) {
  const label = BUSINESS_VERTICAL_LABELS[vertical];

  if (vertical === 'hotel' && !infoOnlyMode) {
    return null;
  }

  const steps = infoOnlyMode
    ? [
        'Conecta WhatsApp en Integraciones.',
        'Carga documentos en Entrenamiento AI (menú, servicios, horarios, políticas).',
        'Prueba respuestas en Simulador IA.',
        'Cuando quieras vender o reservar, contáctanos para activar ese módulo.',
      ]
    : [
        'Conecta WhatsApp en Integraciones.',
        'Entrena tu asistente en Entrenamiento AI.',
        `Estamos preparando reservas/ventas para ${label.toLowerCase()} — por ahora tu bot responde preguntas.`,
        'Configura pagos cuando el módulo de tu vertical esté disponible.',
      ];

  return (
    <section className="business-onboarding glass-panel">
      <p className="business-onboarding-eyebrow">
        {infoOnlyMode ? 'Modo informativo activo' : `Configuración ${label}`}
      </p>
      <h2>
        {infoOnlyMode
          ? 'Tu asistente de preguntas y respuestas'
          : `Próximamente reservas para ${label}`}
      </h2>
      <p className="business-onboarding-lead">
        {infoOnlyMode
          ? 'BookiChat responderá dudas de tus clientes por WhatsApp usando la información que cargues. No necesitas inventario ni pagos para empezar.'
          : `Tu cuenta está registrada como ${label}. Mientras lanzamos el flujo de reservas/ventas, puedes usar el asistente informativo por WhatsApp.`}
      </p>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <style jsx>{`
        .business-onboarding {
          margin-bottom: 1.25rem;
          padding: 1.25rem 1.5rem;
          border-radius: 14px;
          border: 1px solid rgba(99, 102, 241, 0.25);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(14, 165, 233, 0.06));
        }
        .business-onboarding-eyebrow {
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6366f1;
          margin-bottom: 0.35rem;
        }
        h2 {
          font-size: 1.15rem;
          margin-bottom: 0.5rem;
          color: #0f172a;
        }
        .business-onboarding-lead {
          color: #475569;
          font-size: 0.92rem;
          line-height: 1.5;
          margin-bottom: 0.85rem;
        }
        ol {
          margin: 0;
          padding-left: 1.2rem;
          color: #334155;
          font-size: 0.9rem;
          line-height: 1.55;
        }
      `}</style>
    </section>
  );
}
