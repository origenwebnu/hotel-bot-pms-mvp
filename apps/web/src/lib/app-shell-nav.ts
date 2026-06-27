import type { AppNavItem } from '@/components/AppShell';

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
];

export type HotelTab =
  | 'overview'
  | 'reservations'
  | 'inventory'
  | 'discounts'
  | 'knowledge'
  | 'simulator'
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
};

export const HOTEL_TAB_DESCRIPTIONS: Record<string, string> = {
  'integration-whatsapp': 'Conecta el número de WhatsApp de tu hotel para recibir reservas.',
  'integration-pms': 'Sincroniza disponibilidad con tu sistema de gestión hotelera.',
  'integration-payments': 'Configura Wompi o Stripe para cobrar reservas en línea.',
};

export function isIntegrationTab(tab: string): tab is HotelIntegrationTab {
  return HOTEL_INTEGRATION_ITEMS.some((item) => item.id === tab);
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
