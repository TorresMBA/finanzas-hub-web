import { Routes } from '@angular/router';

export const ACCOUNTS_ROUTES: Routes = [
  { path: '', title: 'Cuentas · FinanzasHub', loadComponent: () => import('./accounts').then((m) => m.Accounts) },
];
