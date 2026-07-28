'use client';

import { BUSINESS_VERTICAL_LABELS, type BusinessVertical } from '@hotel-bot/shared';

interface Props {
  vertical: BusinessVertical;
}

export function BusinessOnboardingPanel({ vertical }: Props) {
  const label = BUSINESS_VERTICAL_LABELS[vertical];

  if (vertical === 'hotel') {
    return null;
  }

  const steps = [
    'Conecta WhatsApp en Integraciones.',
    'Carga menú, horarios y políticas en Entrenamiento AI.',
    'Prueba respuestas en Simulador IA — ya puedes atender preguntas por WhatsApp.',
    'Configura pagos cuando actives reservas o ventas (módulo en desarrollo para tu vertical).',
  ];

  return (
    <section className="business-onboarding glass-panel">
      <p className="business-onboarding-eyebrow">Configuración {label}</p>
      <h2>Empieza con preguntas y respuestas por WhatsApp</h2>
      <p className="business-onboarding-lead">
        Puedes usar BookiChat hoy para responder dudas de tus clientes. Cuando esté listo el
        módulo de reservas/ventas para {label.toLowerCase()}, lo activarás desde el mismo panel
        (incluyendo pagos si lo necesitas).
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
