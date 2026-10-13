/** A section of the application, as it appears in every navigation surface. */
export interface NavItem {
  readonly id: string;
  /** Absolute router path. */
  readonly path: string;
  readonly label: string;
  /** For the tablet rail and the mobile tab bar, where the full label does not fit. */
  readonly shortLabel: string;
  /** Material Symbols name. */
  readonly icon: string;
  readonly description: string;
  /** Roadmap phase that delivers the section; shown while its page is still a placeholder. */
  readonly phase: number;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

/** Sections and grouping exactly as in the UI mock. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Principal',
    items: [
      { id: 'home', path: '/', label: 'Inicio', shortLabel: 'Inicio', icon: 'space_dashboard', phase: 4, description: 'El resumen de tus finanzas del mes.' },
      { id: 'transactions', path: '/transactions', label: 'Transacciones', shortLabel: 'Movim.', icon: 'receipt_long', phase: 3, description: 'Revisa, busca y clasifica todos tus movimientos.' },
      { id: 'accounts', path: '/accounts', label: 'Cuentas', shortLabel: 'Cuentas', icon: 'account_balance_wallet', phase: 3, description: 'Saldos de tus bancos, billeteras y tarjetas en un solo lugar.' },
    ],
  },
  {
    label: 'Planificación',
    items: [
      { id: 'budgets', path: '/budgets', label: 'Presupuestos', shortLabel: 'Presup.', icon: 'donut_large', phase: 5, description: 'Cuánto puedes gastar por categoría y a qué ritmo vas este mes.' },
      { id: 'goals', path: '/goals', label: 'Metas', shortLabel: 'Metas', icon: 'flag', phase: 8, description: 'Ahorra con propósito: sigue tu avance y ajusta tus aportes a tiempo.' },
      { id: 'calendar', path: '/calendar', label: 'Calendario', shortLabel: 'Calendario', icon: 'calendar_month', phase: 7, description: 'Ingresos, pagos recurrentes y vencimientos del mes en un vistazo.' },
    ],
  },
  {
    label: 'Compartir y analizar',
    items: [
      { id: 'shared', path: '/shared', label: 'Gastos compartidos', shortLabel: 'Compartidos', icon: 'group', phase: 9, description: 'Divide gastos y liquida deudas sin fricción.' },
      { id: 'investments', path: '/investments', label: 'Inversiones', shortLabel: 'Inversión', icon: 'trending_up', phase: 13, description: 'Tus fondos, depósitos y acciones con su rendimiento real.' },
      { id: 'reports', path: '/reports', label: 'Reportes', shortLabel: 'Reportes', icon: 'bar_chart', phase: 12, description: 'Entiende en qué se va tu dinero y cómo evoluciona tu ahorro.' },
      { id: 'categories', path: '/categories', label: 'Categorías', shortLabel: 'Categorías', icon: 'sell', phase: 2, description: 'Tu taxonomía financiera: categorías, subcategorías y tags.' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'integrations', path: '/integrations', label: 'Integraciones', shortLabel: 'Integrac.', icon: 'sync_alt', phase: 10, description: 'Importa archivos de tu banco y automatiza la clasificación.' },
      { id: 'notifications', path: '/notifications', label: 'Notificaciones', shortLabel: 'Avisos', icon: 'notifications', phase: 6, description: 'Alertas de presupuesto, pagos próximos y actividad compartida.' },
      { id: 'settings', path: '/settings', label: 'Configuración', shortLabel: 'Ajustes', icon: 'settings', phase: 1, description: 'Perfil, miembros del workspace, preferencias y seguridad.' },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** The sections with their own tab on mobile; the rest are reached through "Más". */
const MOBILE_TAB_IDS = ['home', 'transactions', 'budgets'];

export const MOBILE_TABS: readonly NavItem[] = NAV_ITEMS.filter((item) => MOBILE_TAB_IDS.includes(item.id));

export const MOBILE_MORE: readonly NavItem[] = NAV_ITEMS.filter((item) => !MOBILE_TAB_IDS.includes(item.id));
