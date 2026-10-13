import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from '../../shared/ui/icon';
import { MOBILE_MORE, MOBILE_TABS } from '../navigation';

/** Bottom navigation on mobile: the three most used sections and "Más" for the rest. */
@Component({
  selector: 'app-mobile-tab-bar',
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <nav aria-label="Secciones principales">
      @for (tab of tabs; track tab.id) {
        <a
          [routerLink]="tab.path"
          routerLinkActive="is-active"
          #link="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: tab.path === '/' }"
          ariaCurrentWhenActive="page"
          [attr.aria-label]="tab.label"
        >
          <app-icon [name]="tab.icon" [size]="24" [filled]="link.isActive" />
          <span>{{ tab.shortLabel }}</span>
        </a>
      }
      <button
        type="button"
        aria-haspopup="dialog"
        [attr.aria-expanded]="moreOpen()"
        [class.is-active]="moreOpen() || onMoreSection()"
        (click)="more.emit()"
      >
        <app-icon name="menu" [size]="24" />
        <span>Más</span>
      </button>
    </nav>
  `,
  styles: `
    @use 'mixins' as m;

    :host {
      flex: none;
      display: block;
      background: var(--sf);
      border-top: 1px solid var(--bd);

      @include m.tablet-up {
        display: none;
      }
    }
    nav {
      height: 64px;
      display: flex;
      align-items: center;
      padding: 0 8px;
    }
    a,
    button {
      flex: 1;
      height: 56px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      border-radius: 10px;
      color: var(--mu);
      font-size: 10.5px;
      font-weight: 700;
    }
    .is-active {
      color: var(--ac);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileTabBar {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly moreOpen = input(false);
  readonly more = output<void>();

  protected readonly tabs = MOBILE_TABS;
  protected readonly onMoreSection = computed(() => MOBILE_MORE.some((item) => this.url().startsWith(item.path)));
}
