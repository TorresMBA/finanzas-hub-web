import { Route, Routes } from '@angular/router';
import { appGuard, onboardingGuard } from './core/auth/guards';
import { AUTH_ROUTES } from './features/auth/auth.routes';
import { NAV_ITEMS } from './layout/navigation';
import { Shell } from './layout/shell/shell';

/** The sections that already have their own pages. Every other section still shows the placeholder. */
const BUILT: Readonly<Record<string, Pick<Route, 'loadChildren'>>> = {
  accounts: { loadChildren: () => import('./features/accounts/accounts.routes').then((m) => m.ACCOUNTS_ROUTES) },
  categories: { loadChildren: () => import('./features/categories/categories.routes').then((m) => m.CATEGORIES_ROUTES) },
  transactions: { loadChildren: () => import('./features/transactions/transactions.routes').then((m) => m.TRANSACTIONS_ROUTES) },
  settings: { loadChildren: () => import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES) },
};

/**
 * Every section is routed and lazy loaded from day one. Until a phase builds a section, its route shows
 * the placeholder; building it means adding its entry to BUILT.
 */
const sections: Routes = NAV_ITEMS.map((item): Route => {
  const path = item.path.slice(1);
  return BUILT[item.id]
    ? { path, ...BUILT[item.id] }
    : {
        path,
        pathMatch: item.path === '/' ? 'full' : 'prefix',
        title: `${item.label} · FinanzasHub`,
        data: { heading: item.label, description: item.description, phase: item.phase },
        loadComponent: () => import('./features/placeholder/feature-placeholder').then((m) => m.FeaturePlaceholder),
      };
});

export const routes: Routes = [
  ...AUTH_ROUTES,
  {
    path: 'onboarding',
    title: 'Configura tu espacio · FinanzasHub',
    canActivate: [onboardingGuard],
    loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding),
  },
  { path: '', component: Shell, canActivate: [appGuard], children: sections },
  { path: '**', redirectTo: '' },
];
