import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';

const TABS = [
  { path: 'profile', label: 'Perfil' },
  { path: 'workspace', label: 'Espacio y miembros' },
  { path: 'preferences', label: 'Preferencias' },
  { path: 'security', label: 'Seguridad' },
] as const;

@Component({
  selector: 'app-settings',
  imports: [PageHeader, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <app-page-header title="Configuración" subtitle="Tu perfil, el espacio que compartes y cómo quieres ver la aplicación." />
    <nav aria-label="Secciones de configuración">
      @for (tab of tabs; track tab.path) {
        <a [routerLink]="tab.path" routerLinkActive="is-active" ariaCurrentWhenActive="page">{{ tab.label }}</a>
      }
    </nav>
    <router-outlet />
  `,
  styles: `
    nav {
      display: flex;
      gap: 6px;
      margin-bottom: 20px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    a {
      flex: none;
      height: 36px;
      padding: 0 14px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      color: var(--tx2);
      background: var(--sf);
      border: 1px solid var(--bd);
    }
    a.is-active {
      background: var(--acs);
      border-color: transparent;
      color: var(--ac);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly tabs = TABS;
}
