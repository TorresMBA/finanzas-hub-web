import { Route, Routes } from '@angular/router';
import { NAV_ITEMS } from './layout/navigation';
import { Shell } from './layout/shell/shell';

/**
 * Every section is routed and lazy loaded from day one. Until a phase builds a section, its route shows
 * the placeholder; building it means replacing that one entry with the feature's own routes.
 */
const sections: Routes = NAV_ITEMS.map(
  (item): Route => ({
    path: item.path.slice(1),
    pathMatch: item.path === '/' ? 'full' : 'prefix',
    title: `${item.label} · FinanzasHub`,
    data: { heading: item.label, description: item.description, phase: item.phase },
    loadComponent: () => import('./features/placeholder/feature-placeholder').then((m) => m.FeaturePlaceholder),
  }),
);

export const routes: Routes = [
  { path: '', component: Shell, children: sections },
  { path: '**', redirectTo: '' },
];
