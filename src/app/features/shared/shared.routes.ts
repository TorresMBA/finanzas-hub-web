import { Routes } from '@angular/router';

export const SHARED_ROUTES: Routes = [
  { path: '', title: 'Gastos compartidos · FinanzasHub', loadComponent: () => import('./shared').then((m) => m.Shared) },
];
