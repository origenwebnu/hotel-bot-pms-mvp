import type { AppNavItem } from '@/components/AppShell';

export const HOTEL_NAV: AppNavItem[] = [
  { id: 'overview', label: 'Resumen', icon: '/icons/modules/overview.svg' },
  { id: 'reservations', label: 'Reservas', icon: '/icons/modules/reservations.svg' },
  { id: 'integrations', label: 'Integraciones', icon: '/icons/modules/integrations.svg' },
  { id: 'inventory', label: 'Inventario', icon: '/icons/modules/inventory.svg' },
  { id: 'discounts', label: 'Descuentos', icon: '/icons/modules/discounts.svg' },
  { id: 'knowledge', label: 'Knowledge Base', icon: '/icons/modules/knowledge.svg' },
  { id: 'simulator', label: 'Simulador IA', icon: '/icons/modules/simulator.svg' },
];

export const HOTEL_TAB_TITLES: Record<string, string> = {
  overview: 'Resumen del hotel',
  reservations: 'Historial de reservas',
  integrations: 'Integraciones',
  inventory: 'Inventario de habitaciones',
  discounts: 'Descuentos automáticos',
  knowledge: 'Knowledge Base',
  simulator: 'Simulador de Chat',
};

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
