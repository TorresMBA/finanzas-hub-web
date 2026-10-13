import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { MobileTabBar } from '../mobile-tab-bar/mobile-tab-bar';
import { MoreSheet } from '../more-sheet/more-sheet';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

/**
 * Frame around every signed-in page. Which navigation is visible is decided by CSS at the three
 * breakpoints of the mock: sidebar (desktop), icon rail (tablet), bottom tab bar (mobile).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterOutlet, Sidebar, Topbar, MobileTabBar, MoreSheet],
  template: `
    <a class="skip-link" href="#main">Saltar al contenido</a>
    <app-sidebar />
    <div class="column">
      <app-topbar />
      <main id="main" tabindex="-1">
        <div class="content">
          <router-outlet />
        </div>
      </main>
      @if (center.toast(); as toast) {
        <a class="toast" aria-live="polite" routerLink="/notifications" (click)="center.dismissToast()">
          <strong>{{ toast.title }}</strong>
          <span>Ver en Notificaciones</span>
        </a>
      }
      <app-mobile-tab-bar [moreOpen]="moreOpen()" (more)="moreOpen.set(true)" />
      @if (moreOpen()) {
        <app-more-sheet (closed)="moreOpen.set(false)" />
      }
    </div>
  `,
  styles: `
    @use 'mixins' as m;

    :host {
      display: flex;
      height: 100dvh;
      overflow: hidden;
      background: var(--bg);
      color: var(--tx);
    }
    .column {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    main {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      outline: none;
    }
    .content {
      max-width: 1480px;
      margin: 0 auto;
      padding: 20px 16px 24px;

      @include m.tablet-up {
        padding: 24px;
      }

      @include m.desktop {
        padding: 28px 32px;
      }
    }
    .skip-link {
      position: absolute;
      left: -9999px;
      top: 8px;
      z-index: 50;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--ac);
      color: var(--onac);
      font-weight: 700;
    }
    .toast {
      position: absolute;
      right: 16px;
      bottom: 84px;
      z-index: 40;
      max-width: min(360px, calc(100% - 32px));
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      border-radius: 14px;
      background: var(--sf);
      border: 1px solid var(--bd);
      box-shadow: var(--sh);
      color: var(--tx);
      font-size: 13px;

      span {
        color: var(--ac);
        font-weight: 700;
      }

      @include m.desktop {
        bottom: 24px;
      }
    }
    .skip-link:focus {
      left: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly center = inject(NotificationCenter);
  protected readonly moreOpen = signal(false);

  constructor() {
    // The inbox is followed for as long as a signed-in page is on screen.
    this.center.start();
    inject(DestroyRef).onDestroy(() => this.center.stop());
  }
}
