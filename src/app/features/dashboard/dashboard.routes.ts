import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
  { path: '', pathMatch: 'full', title: 'Inicio · FinanzasHub', loadComponent: () => import('./dashboard').then((m) => m.Dashboard) },
];
