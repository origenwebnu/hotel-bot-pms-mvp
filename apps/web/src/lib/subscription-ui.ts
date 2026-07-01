import type { HotelSubscription } from '@/lib/api';

/** Negocio que debe elegir o pagar un plan BookiChat. */
export function subscriptionNeedsPlanPicker(sub: HotelSubscription): boolean {
  if (sub.status === 'trial_expired' || sub.status === 'suspended') return true;
  if (sub.status === 'quota_reached') return true;
  if (
    sub.status === 'trial' &&
    sub.trial_days_left != null &&
    sub.trial_days_left <= 7
  ) {
    return true;
  }
  return false;
}

export function subscriptionBannerMessage(sub: HotelSubscription): {
  tone: 'ok' | 'warn' | 'danger';
  title: string;
  body: string;
  showPlanCta: boolean;
  ctaLabel: string;
} | null {
  if (sub.status === 'trial') {
    const endingSoon =
      sub.trial_days_left != null && sub.trial_days_left <= 7;
    if (!endingSoon) {
      return {
        tone: 'ok',
        title: 'Periodo de prueba activo',
        body: `${sub.used}/${sub.limit} reservas usadas · ${sub.trial_days_left ?? 0} día(s) restantes`,
        showPlanCta: false,
        ctaLabel: '',
      };
    }
    return {
      tone: 'warn',
      title: 'Tu prueba termina pronto',
      body: `Te quedan ${sub.trial_days_left} día(s). Elige un plan para no interrumpir las reservas por WhatsApp.`,
      showPlanCta: true,
      ctaLabel: 'Ver planes',
    };
  }

  if (sub.status === 'active' && sub.plan_name) {
    return {
      tone: 'ok',
      title: `Plan ${sub.plan_name}`,
      body: `${sub.used}/${sub.limit} reservas este mes${sub.period_month ? ` (${sub.period_month})` : ''}`,
      showPlanCta: false,
      ctaLabel: '',
    };
  }

  if (sub.status === 'quota_reached') {
    return {
      tone: 'danger',
      title: 'Límite mensual alcanzado',
      body: `Consumiste las ${sub.limit} reservas de tu plan este mes. Contrata un plan superior para seguir recibiendo reservas.`,
      showPlanCta: true,
      ctaLabel: 'Ver planes superiores',
    };
  }

  if (sub.status === 'trial_expired') {
    return {
      tone: 'danger',
      title: 'Periodo de prueba finalizado',
      body: 'Elige un plan y paga con Mercado Pago para seguir recibiendo reservas por WhatsApp.',
      showPlanCta: true,
      ctaLabel: 'Elegir plan y pagar',
    };
  }

  if (sub.status === 'suspended') {
    return {
      tone: 'danger',
      title: 'Suscripción suspendida',
      body: 'Regulariza tu plan para reactivar las reservas por WhatsApp.',
      showPlanCta: true,
      ctaLabel: 'Reactivar con Mercado Pago',
    };
  }

  return null;
}
