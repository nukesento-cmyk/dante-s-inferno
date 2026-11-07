import { ORDER_TRANSITIONS, type OrderStatus, type StaffRole } from '@dantes/shared';

export interface NavItem {
  to: string;
  label: string;
  roles: StaffRole[];
  icon: string;
}

const ALL: StaffRole[] = ['OWNER', 'MANAGER', 'ORDER_STAFF', 'KITCHEN'];

/** Follows the contract role matrix: KITCHEN orders; ORDER_STAFF orders + payments; MANAGER all but staff; OWNER everything. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', roles: ['OWNER', 'MANAGER'], icon: '◧' },
  { to: '/orders', label: 'Orders', roles: ALL, icon: '🧾' },
  { to: '/products', label: 'Products', roles: ['OWNER', 'MANAGER'], icon: '🍕' },
  { to: '/categories', label: 'Categories', roles: ['OWNER', 'MANAGER'], icon: '🗂' },
  { to: '/ingredients', label: 'Ingredients', roles: ['OWNER', 'MANAGER'], icon: '🧀' },
  { to: '/customizations', label: 'Sizes & crusts', roles: ['OWNER', 'MANAGER'], icon: '📐' },
  { to: '/delivery', label: 'Delivery', roles: ['OWNER', 'MANAGER'], icon: '🛵' },
  { to: '/payments', label: 'Payments', roles: ['OWNER', 'MANAGER', 'ORDER_STAFF'], icon: '💳' },
  { to: '/customers', label: 'Customers', roles: ['OWNER', 'MANAGER'], icon: '👥' },
  { to: '/reports', label: 'Reports', roles: ['OWNER', 'MANAGER'], icon: '📈' },
  { to: '/staff', label: 'Staff', roles: ['OWNER'], icon: '🪪' },
  { to: '/audit', label: 'Audit log', roles: ['OWNER', 'MANAGER'], icon: '🔎' },
  { to: '/settings', label: 'Settings', roles: ['OWNER', 'MANAGER'], icon: '⚙' },
];

export function navForRole(role: StaffRole): NavItem[] {
  return NAV_ITEMS.filter((n) => n.roles.includes(role));
}

export function canAccess(role: StaffRole, path: string): boolean {
  const item = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length).find((n) => (n.to === '/' ? path === '/' : path.startsWith(n.to)));
  return item ? item.roles.includes(role) : true;
}

export function homeFor(role: StaffRole): string {
  return navForRole(role)[0]?.to ?? '/login';
}

/** Valid next statuses for a role: ORDER_TRANSITIONS, and KITCHEN may only set PREPARING/READY. */
export function nextStatuses(current: OrderStatus, role: StaffRole): OrderStatus[] {
  const all = ORDER_TRANSITIONS[current] ?? [];
  if (role === 'KITCHEN') return all.filter((s) => s === 'PREPARING' || s === 'READY');
  return all;
}
