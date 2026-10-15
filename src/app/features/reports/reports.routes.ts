import { Routes } from '@angular/router';

export const REPORTS_ROUTES: Routes = [{ path: '', title: 'Reportes · FinanzasHub', loadComponent: () => import('./reports').then((m) => m.Reports) }];
