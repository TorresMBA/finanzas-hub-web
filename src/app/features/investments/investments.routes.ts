import { Routes } from '@angular/router';

export const INVESTMENTS_ROUTES: Routes = [{ path: '', title: 'Inversiones · FinanzasHub', loadComponent: () => import('./investments').then((m) => m.Investments) }];
