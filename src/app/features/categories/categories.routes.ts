import { Routes } from '@angular/router';

export const CATEGORIES_ROUTES: Routes = [
  { path: '', title: 'Categorías · FinanzasHub', loadComponent: () => import('./categories').then((m) => m.Categories) },
];
