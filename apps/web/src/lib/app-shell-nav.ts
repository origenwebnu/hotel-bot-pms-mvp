import type { AppNavItem } from '@/components/AppShell';
import {
  type BusinessVertical,
  BUSINESS_VERTICAL_LABELS,
  supportsHotelBooking,
} from '@hotel-bot/shared';

export const HOTEL_INTEGRATION_ITEMS = [
  { id: 'integration-whatsapp', label: 'WhatsApp' },
  { id: 'integration-pms', label: 'PMS' },
  { id: 'integration-payments', label: 'Pagos / Recaudo' },
] as const;

export type HotelIntegrationTab = (typeof HOTEL_INTEGRATION_ITEMS)[number]['id'];

export const HOTEL_NAV: AppNavItem[] = [
  { id: 'overview', label: 'Resumen', icon: '/icons/modules/overview.svg' },
  { id: 'reservations', label: 'Reservas', icon: '/icons/modules/reservations.svg' },
  {
    id: 'integrations',
    label: 'Integraciones',
    icon: '/icons/modules/integrations.svg',
    children: [...HOTEL_INTEGRATION_ITEMS],
  },
  { id: 'inventory', label: 'Inventario', icon: '/icons/modules/inventory.svg' },
  { id: 'discounts', label: 'Descuentos', icon: '/icons/modules/discounts.svg' },
  { id: 'knowledge', label: 'Entrenamiento AI', icon: '/icons/modules/knowledge.svg' },
  { id: 'simulator', label: 'Simulador IA', icon: '/icons/modules/simulator.svg' },
  { id: 'account', label: 'Mi cuenta', icon: '/icons/modules/mi-cuenta.svg' },
];

export type HotelTab =
  | 'overview'
  | 'reservations'
  | 'inventory'
  | 'discounts'
  | 'knowledge'
  | 'simulator'
  | 'account'
  | HotelIntegrationTab;

export const HOTEL_TAB_TITLES: Record<string, string> = {
  overview: 'Resumen del hotel',
  reservations: 'Historial de reservas',
  'integration-whatsapp': 'WhatsApp Business',
  'integration-pms': 'PMS — Property Management',
  'integration-payments': 'Pagos / Recaudo',
  inventory: 'Inventario de habitaciones',
  discounts: 'Descuentos automáticos',
  knowledge: 'Entrenamiento AI',
  simulator: 'Simulador de Chat',
  account: 'Mi cuenta',
};

export const HOTEL_TAB_DESCRIPTIONS: Record<string, string> = {
  'integration-whatsapp': 'Conecta el número de WhatsApp de tu hotel para recibir reservas.',
  'integration-pms': 'Sincroniza disponibilidad con tu sistema de gestión hotelera.',
  'integration-payments': 'Configura Wompi o Stripe para cobrar reservas en línea.',
};

export function isIntegrationTab(tab: string): tab is HotelIntegrationTab {
  return HOTEL_INTEGRATION_ITEMS.some((item) => item.id === tab);
}

const HOTEL_TAB_IDS = new Set<string>([
  'overview',
  'reservations',
  'inventory',
  'discounts',
  'knowledge',
  'simulator',
  'account',
  ...HOTEL_INTEGRATION_ITEMS.map((item) => item.id),
]);

export function parseHotelTab(tabParam: string | null): HotelTab {
  if (tabParam && HOTEL_TAB_IDS.has(tabParam)) {
    return tabParam as HotelTab;
  }
  return 'overview';
}

export function buildHotelDashboardPath(tab: HotelTab): string {
  if (tab === 'overview') return '/dashboard';
  return `/dashboard?tab=${encodeURIComponent(tab)}`;
}

export function buildDashboardNav(vertical: BusinessVertical): AppNavItem[] {
  if (supportsHotelBooking(vertical)) {
    return HOTEL_NAV;
  }

  const integrationChildren: Array<{ id: string; label: string }> = [
    { id: 'integration-whatsapp', label: 'WhatsApp' },
    { id: 'integration-payments', label: 'Pagos / Recaudo' },
  ];

  return [
    { id: 'overview', label: 'Resumen', icon: '/icons/modules/overview.svg' },
    {
      id: 'integrations',
      label: 'Integraciones',
      icon: '/icons/modules/integrations.svg',
      children: integrationChildren,
    },
    { id: 'knowledge', label: 'Entrenamiento AI', icon: '/icons/modules/knowledge.svg' },
    { id: 'simulator', label: 'Simulador IA', icon: '/icons/modules/simulator.svg' },
    { id: 'account', label: 'Mi cuenta', icon: '/icons/modules/mi-cuenta.svg' },
  ];
}

export function getDashboardTabIds(vertical: BusinessVertical): Set<string> {
  const nav = buildDashboardNav(vertical);
  const ids = new Set<string>();
  for (const item of nav) {
    ids.add(item.id);
    if (item.children) {
      for (const child of item.children) {
        ids.add(child.id);
      }
    }
  }
  return ids;
}

export function parseDashboardTab(
  tabParam: string | null,
  vertical: BusinessVertical,
): HotelTab {
  const allowed = getDashboardTabIds(vertical);
  if (tabParam && allowed.has(tabParam)) {
    return tabParam as HotelTab;
  }
  return 'overview';
}

export function getDashboardOverviewTitle(vertical: BusinessVertical): string {
  const label = BUSINESS_VERTICAL_LABELS[vertical];
  if (vertical === 'hotel') {
    return HOTEL_TAB_TITLES.overview;
  }
  return `Resumen — ${label}`;
}

export const SUPER_ADMIN_NAV: AppNavItem[] = [
  { id: 'overview', label: 'Resumen', icon: '/icons/modules/overview.svg' },
  { id: 'hotels', label: 'Hoteles', icon: '/icons/modules/hotels.svg' },
  { id: 'plans', label: 'Planes', icon: '/icons/modules/plans.svg' },
  { id: 'reservations', label: 'Reservas', icon: '/icons/modules/reservations.svg' },
  { id: 'users', label: 'Usuarios', icon: '/icons/modules/users.svg' },
  { id: 'admins', label: 'Super Admins', icon: '/icons/modules/usuario-super-admin.svg' },
  { id: 'settings', label: 'Parametrización', icon: '/icons/modules/settings.svg' },
];

export const SUPER_ADMIN_TAB_TITLES: Record<string, string> = {
  overview: 'Resumen de la plataforma',
  hotels: 'Gestión de hoteles',
  plans: 'Planes de suscripción',
  reservations: 'Historial de reservas',
  users: 'Usuarios de hoteles',
  admins: 'Super administradores',
  settings: 'Parametrización global',
};

export type SuperAdminTab = (typeof SUPER_ADMIN_NAV)[number]['id'];

const SUPER_ADMIN_TAB_IDS = new Set<string>(SUPER_ADMIN_NAV.map((item) => item.id));

export function parseSuperAdminTab(tabParam: string | null): SuperAdminTab {
  if (tabParam && SUPER_ADMIN_TAB_IDS.has(tabParam)) {
    return tabParam as SuperAdminTab;
  }
  return 'overview';
}

export function buildSuperAdminPath(tab: SuperAdminTab): string {
  if (tab === 'overview') return '/super-admin';
  return `/super-admin?tab=${encodeURIComponent(tab)}`;
}
