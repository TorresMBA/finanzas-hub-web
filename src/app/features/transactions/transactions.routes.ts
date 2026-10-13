import { Routes } from '@angular/router';

export const TRANSACTIONS_ROUTES: Routes = [
  { path: '', title: 'Transacciones · FinanzasHub', loadComponent: () => import('./transactions').then((m) => m.Transactions) },
];
