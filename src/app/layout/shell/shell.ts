import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CurrencyCatalog } from '../../core/currency/currency-catalog';
import { MovementsFeed, QUICK_OUTLET, QUICK_TRANSACTION_PATH } from '../../core/movements/movements-feed';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { Icon } from '../../shared/ui/icon';
import { useCurrencies } from '../../shared/ui/money';
import { MobileTabBar } from '../mobile-tab-bar/mobile-tab-bar';
import { MoreSheet } from '../more-sheet/more-sheet';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

const NOTICE_MS = 5000;

/**
 * Frame around every signed-in page. Which navigation is visible is decided by CSS at the three
 * breakpoints of the mock: sidebar (desktop), icon rail (tablet), bottom tab bar (mobile).
 */
@Component({
  selector: 'app-shell',
  imports: [Icon, RouterLink, RouterOutlet, Sidebar, Topbar, MobileTabBar, MoreSheet],
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
      <!-- The heart of the application one tap away from any page: a new movement over the page that is open. -->
      <button type="button" class="fab" aria-haspopup="dialog" (click)="newMovement()">
        <app-icon name="add" [size]="26" />
        <span class="fab-label">Nueva transacción</span>
      </button>
      <router-outlet [name]="quickOutlet" />
      @if (feed.notice(); as message) {
        <div class="toast toast--saved" role="status">
          <app-icon name="check_circle" [size]="20" [filled]="true" />
          <p class="toast-text">{{ message }}</p>
          <a routerLink="/transactions" (click)="feed.dismiss()">Ver</a>
          <button type="button" class="toast-close" aria-label="Cerrar aviso" (click)="feed.dismiss()"><app-icon name="close" [size]="16" /></button>
        </div>
      } @else if (center.toast(); as toast) {
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
      /* The bottom leaves room for the floating button, so it never covers the last row of a page. */
      padding: 20px 16px 96px;

      @include m.tablet-up {
        padding: 24px 24px 104px;
      }

      @include m.desktop {
        padding: 28px 32px 104px;
      }
    }
    .fab {
      position: absolute;
      right: 16px;
      /* Above the tab bar on mobile, and above the notch of the phones that have one. */
      bottom: calc(64px + 16px + env(safe-area-inset-bottom, 0px));
      /* Below the sheet of "Más", which covers it while open. */
      z-index: 15;
      height: 56px;
      min-width: 56px;
      padding: 0 15px;
      display: inline-flex;
      align-items: center;
      gap: 0;
      border-radius: 999px;
      background: var(--ac);
      color: var(--onac);
      font-size: 14px;
      font-weight: 800;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
      transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        gap 200ms ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.4);
      }
      &:active {
        transform: scale(0.96);
      }
      &:focus-visible {
        outline: 3px solid var(--acs);
        outline-offset: 3px;
      }

      @include m.tablet-up {
        right: 24px;
        bottom: 24px;
      }
      /* On a pointer screen the label slides out on hover or focus; on touch it stays an icon. */
      @include m.desktop {
        &:hover,
        &:focus-visible {
          gap: 8px;
        }
        &:hover .fab-label,
        &:focus-visible .fab-label {
          max-width: 180px;
          opacity: 1;
        }
      }
    }
    /* Hidden by its width, not by display: it stays the button's name for screen readers. */
    .fab-label {
      max-width: 0;
      overflow: hidden;
      white-space: nowrap;
      opacity: 0;
      transition:
        max-width 200ms ease,
        opacity 160ms ease;
    }
    @media (prefers-reduced-motion: reduce) {
      .fab,
      .fab-label {
        transition: none;
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
      /* Over the floating button. */
      bottom: calc(64px + 16px + 56px + 12px + env(safe-area-inset-bottom, 0px));
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

      @include m.tablet-up {
        right: 24px;
        bottom: calc(24px + 56px + 12px);
      }
    }
    .toast--saved {
      flex-direction: row;
      align-items: center;
      gap: 10px;
      animation: rise 200ms ease-out;

      > app-icon {
        color: var(--ac);
      }
      a {
        color: var(--ac);
        font-weight: 800;
      }
    }
    .toast-text {
      flex: 1;
      font-weight: 600;
    }
    .toast-close {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      color: var(--mu);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast--saved {
        animation: none;
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
  protected readonly feed = inject(MovementsFeed);
  protected readonly quickOutlet = QUICK_OUTLET;
  private readonly router = inject(Router);
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // The inbox is followed for as long as a signed-in page is on screen.
    this.center.start();
    inject(DestroyRef).onDestroy(() => this.center.stop());

    // Every amount is written with the symbol and the decimals of the API's catalog of currencies.
    const currencies = inject(CurrencyCatalog);
    effect(() => useCurrencies(currencies.list().map((currency) => ({ ...currency, minorUnits: Number(currency.minorUnits) }))));

    // What was saved from the quick button shows for a few seconds.
    effect(() => {
      if (this.feed.notice()) {
        clearTimeout(this.noticeTimer);
        this.noticeTimer = setTimeout(() => this.feed.dismiss(), NOTICE_MS);
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.noticeTimer));
  }

  /** Opens the new movement over the page; the address stays, since it is not a place to come back to. */
  protected newMovement(): void {
    void this.router.navigate([{ outlets: { [QUICK_OUTLET]: QUICK_TRANSACTION_PATH } }], { skipLocationChange: true });
  }
}
