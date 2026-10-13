import { Routes } from '@angular/router';
import { Settings } from './settings';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    component: Settings,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      { path: 'profile', title: 'Perfil · FinanzasHub', loadComponent: () => import('./profile').then((m) => m.SettingsProfile) },
      { path: 'workspace', title: 'Espacio y miembros · FinanzasHub', loadComponent: () => import('./workspace').then((m) => m.SettingsWorkspace) },
      { path: 'preferences', title: 'Preferencias · FinanzasHub', loadComponent: () => import('./preferences').then((m) => m.SettingsPreferences) },
      { path: 'security', title: 'Seguridad · FinanzasHub', loadComponent: () => import('./security').then((m) => m.SettingsSecurity) },
    ],
  },
];
