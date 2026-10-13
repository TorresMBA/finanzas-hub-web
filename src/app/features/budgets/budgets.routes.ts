import { Routes } from '@angular/router';

export const BUDGETS_ROUTES: Routes = [
  { path: '', title: 'Presupuestos · FinanzasHub', loadComponent: () => import('./budgets').then((m) => m.Budgets) },
];
