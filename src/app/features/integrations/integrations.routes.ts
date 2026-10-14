import { Routes } from '@angular/router';

export const INTEGRATIONS_ROUTES: Routes = [
  { path: '', title: 'Integraciones · FinanzasHub', loadComponent: () => import('./integrations').then((m) => m.Integrations) },
];
