import { Routes } from '@angular/router';

export const CALENDAR_ROUTES: Routes = [
  { path: '', title: 'Calendario · FinanzasHub', loadComponent: () => import('./calendar').then((m) => m.Calendar) },
];
