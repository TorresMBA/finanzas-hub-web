import { Routes } from '@angular/router';

export const GOALS_ROUTES: Routes = [{ path: '', title: 'Metas · FinanzasHub', loadComponent: () => import('./goals').then((m) => m.Goals) }];
