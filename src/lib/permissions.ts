// ============================================================
// ALiSiO PMS — Permissions & Role-based Access Control
// ============================================================

import type { UserRole } from '@/types/database';

// ─── All available permissions ─────────────────────────────
export const ALL_PERMISSIONS = [
  // Navigation
  'nav:dashboard',
  'nav:calendar',
  'nav:bookings',
  'nav:pricing',
  'nav:reports',
  'nav:guests',
  'nav:documents',
  'nav:finance',
  'nav:settings',
  // Features
  'manage_users',
  'manage_pricing',
  'manage_properties',
  'manage_bookings',
  'manage_guests',
  'view_reports',
  'manage_payments',
  'manage_documents',
  'manage_expenses',
  'view_finance',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// ─── Permission groups for UI display ──────────────────────
export const PERMISSION_GROUPS: { title: string; permissions: { key: Permission; label: string }[] }[] = [
  {
    title: 'Навігація',
    permissions: [
      { key: 'nav:dashboard', label: 'Dashboard' },
      { key: 'nav:calendar', label: 'Календар' },
      { key: 'nav:bookings', label: 'Бронювання' },
      { key: 'nav:pricing', label: 'Ціноутворення' },
      { key: 'nav:reports', label: 'Звіти' },
      { key: 'nav:guests', label: 'Гості' },
      { key: 'nav:documents', label: 'Документи' },
      { key: 'nav:finance', label: 'Фінанси' },
      { key: 'nav:settings', label: 'Налаштування' },
    ],
  },
  {
    title: 'Функції',
    permissions: [
      { key: 'manage_users', label: 'Керування користувачами' },
      { key: 'manage_pricing', label: 'Керування цінами' },
      { key: 'manage_properties', label: "Керування об'єктами" },
      { key: 'manage_bookings', label: 'Керування бронюваннями' },
      { key: 'manage_guests', label: 'Керування гостями' },
      { key: 'view_reports', label: 'Перегляд звітів' },
      { key: 'manage_payments', label: 'Керування оплатами' },
      { key: 'manage_documents', label: 'Керування документами' },
      { key: 'manage_expenses', label: 'Керування витратами' },
      { key: 'view_finance', label: 'Перегляд фінансів' },
    ],
  },
];

// ─── Default permissions per role ──────────────────────────
export const ROLE_DEFAULTS: Record<UserRole, Permission[]> = {
  owner: [...ALL_PERMISSIONS],
  director: [...ALL_PERMISSIONS],
  manager: [
    'nav:dashboard', 'nav:calendar', 'nav:bookings', 'nav:pricing',
    'nav:reports', 'nav:guests', 'nav:documents', 'nav:finance',
    'manage_bookings', 'manage_guests', 'manage_pricing',
    'view_reports', 'manage_payments', 'manage_documents',
    'manage_expenses', 'view_finance',
  ],
  receptionist: [
    'nav:dashboard', 'nav:calendar', 'nav:bookings', 'nav:guests',
    'manage_bookings', 'manage_guests',
  ],
  housekeeper: [
    'nav:dashboard',
  ],
  maintenance: [
    'nav:dashboard',
  ],
  accountant: [
    'nav:dashboard', 'nav:reports', 'nav:documents', 'nav:finance',
    'view_reports', 'manage_payments', 'manage_documents',
    'manage_expenses', 'view_finance',
  ],
};

// ─── Role labels (Ukrainian) ──────────────────────────────
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Власник',
  director: 'Директор',
  manager: 'Менеджер',
  receptionist: 'Рецепціоніст',
  housekeeper: 'Покоївка',
  maintenance: 'Технік',
  accountant: 'Бухгалтер',
};

// ─── Role colors for badges ───────────────────────────────
export const ROLE_COLORS: Record<UserRole, string> = {
  owner: '#ef4444',
  director: '#f97316',
  manager: '#8b5cf6',
  receptionist: '#3b82f6',
  housekeeper: '#10b981',
  maintenance: '#6b7280',
  accountant: '#eab308',
};

// ─── Permission override type ─────────────────────────────
export interface PermissionOverride {
  permission: Permission;
  granted: boolean; // true = grant, false = revoke
}

// ─── Merge defaults with overrides ────────────────────────
export function getUserPermissions(
  role: UserRole,
  overrides: PermissionOverride[] = []
): Permission[] {
  const defaults = new Set<Permission>(ROLE_DEFAULTS[role] || []);

  for (const override of overrides) {
    if (override.granted) {
      defaults.add(override.permission);
    } else {
      defaults.delete(override.permission);
    }
  }

  return Array.from(defaults);
}

// ─── Check if user has a specific permission ──────────────
export function hasPermission(
  userPermissions: Permission[],
  permission: Permission
): boolean {
  return userPermissions.includes(permission);
}

// ─── Nav items → required permissions mapping ─────────────
export const NAV_PERMISSION_MAP: Record<string, Permission> = {
  '/dashboard': 'nav:dashboard',
  '/calendar': 'nav:calendar',
  '/bookings': 'nav:bookings',
  '/pricing': 'nav:pricing',
  '/reports': 'nav:reports',
  '/guests': 'nav:guests',
  '/documents': 'nav:documents',
  '/finance': 'nav:finance',
  '/finance/expenses': 'nav:finance',
  '/finance/pnl': 'nav:finance',
  '/finance/cashflow': 'nav:finance',
  '/finance/capex': 'nav:finance',
  '/finance/expected-payments': 'nav:finance',
  '/finance/accruals': 'nav:finance',
  '/finance/bank': 'nav:finance',
  '/settings': 'nav:settings',
  '/settings/properties': 'nav:settings',
  '/settings/units': 'nav:settings',
  '/settings/users': 'manage_users',
};
