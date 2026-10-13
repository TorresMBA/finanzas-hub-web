import { Routes } from '@angular/router';
import { guestGuard } from '../../core/auth/guards';

/** Pages reached without a session. The invitation and confirmation links work with or without one. */
export const AUTH_ROUTES: Routes = [
  { path: 'login', title: 'Iniciar sesión · FinanzasHub', canActivate: [guestGuard], loadComponent: () => import('./login').then((m) => m.Login) },
  { path: 'register', title: 'Crear cuenta · FinanzasHub', canActivate: [guestGuard], loadComponent: () => import('./register').then((m) => m.Register) },
  { path: 'forgot-password', title: 'Recuperar acceso · FinanzasHub', loadComponent: () => import('./password-recovery').then((m) => m.ForgotPassword) },
  { path: 'reset-password', title: 'Contraseña nueva · FinanzasHub', loadComponent: () => import('./password-recovery').then((m) => m.ResetPassword) },
  { path: 'confirm-email', title: 'Confirmar correo · FinanzasHub', loadComponent: () => import('./password-recovery').then((m) => m.ConfirmEmail) },
  { path: 'invite/:token', title: 'Invitación · FinanzasHub', loadComponent: () => import('./invite').then((m) => m.Invite) },
];
