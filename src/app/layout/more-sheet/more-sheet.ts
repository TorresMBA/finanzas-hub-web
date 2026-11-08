import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { MOBILE_MORE, withoutCollaboration } from '../navigation';

/**
 * Bottom sheet with the sections that have no tab of their own on mobile. It is the shared modal dialog, so focus
 * stays inside while it is open, the page behind is inert, Escape closes it and focus goes back to "Más".
 */
@Component({
  selector: 'app-more-sheet',
  imports: [Dialog, RouterLink, RouterLinkActive, Icon],
  template: `
    <app-dialog title="Todas las secciones" (closed)="closed.emit()">
      <nav aria-label="Todas las secciones">
        @for (item of items(); track item.id) {
          @let unreadHere = item.id === 'notifications' ? unread() : 0;
          <a
            [routerLink]="item.path"
            routerLinkActive="is-active"
            ariaCurrentWhenActive="page"
            [attr.aria-label]="unreadHere > 0 ? item.label + ': ' + unreadHere + ' sin leer' : null"
            (click)="closed.emit()"
          >
            <app-icon [name]="item.icon" [size]="24" />
            @if (unreadHere > 0) {
              <b class="count" aria-hidden="true">{{ unreadHere > 99 ? '99+' : unreadHere }}</b>
            }
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
    </app-dialog>
  `,
  styles: `
    nav {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    a {
      position: relative;
      min-height: 76px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 4px;
      border-radius: 14px;
      background: var(--sf2);
      color: var(--tx2);
      font-size: 11.5px;
      font-weight: 700;
      text-align: center;
      line-height: 1.2;

      app-icon {
        color: var(--mu);
      }
    }
    .count {
      position: absolute;
      top: 8px;
      left: calc(50% + 6px);
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: var(--rd);
      color: var(--bg);
      font-size: 10.5px;
      font-weight: 800;
    }
    a.is-active {
      background: var(--acs);
      color: var(--tx);

      app-icon {
        color: var(--ac);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoreSheet {
  readonly closed = output<void>();

  private readonly workspaces = inject(WorkspaceStore);
  protected readonly items = computed(() => (this.workspaces.allowsCollaboration() ? MOBILE_MORE : withoutCollaboration(MOBILE_MORE)));
  protected readonly unread = inject(NotificationCenter).unread;
}
