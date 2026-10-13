import { Routes } from '@angular/router';

export const NOTIFICATIONS_ROUTES: Routes = [
  { path: '', title: 'Notificaciones · FinanzasHub', loadComponent: () => import('./notifications').then((m) => m.Notifications) },
];
