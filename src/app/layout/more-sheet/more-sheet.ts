import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, output, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { MOBILE_MORE } from '../navigation';

/** Bottom sheet with the sections that have no tab of their own on mobile. */
@Component({
  selector: 'app-more-sheet',
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <button type="button" class="backdrop" aria-label="Cerrar" (click)="closed.emit()"></button>
    <div #sheet class="sheet" role="dialog" aria-modal="true" aria-labelledby="more-sheet-title" tabindex="-1">
      <div class="handle"></div>
      <h2 id="more-sheet-title">Todas las secciones</h2>
      <nav aria-label="Todas las secciones">
        @for (item of items; track item.id) {
          <a [routerLink]="item.path" routerLinkActive="is-active" ariaCurrentWhenActive="page" (click)="closed.emit()">
            <app-icon [name]="item.icon" [size]="24" />
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .backdrop {
      flex: 1;
      background: var(--ov);
      border-radius: 0;
    }
    .sheet {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 10px 16px 24px;
      background: var(--sf);
      border-top: 1px solid var(--bd);
      border-radius: 20px 20px 0 0;
      outline: none;
    }
    .handle {
      align-self: center;
      width: 40px;
      height: 4px;
      border-radius: 99px;
      background: var(--sf3);
    }
    h2 {
      font-size: 15px;
      font-weight: 800;
    }
    nav {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    a {
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
    a.is-active {
      background: var(--acs);
      color: var(--tx);

      app-icon {
        color: var(--ac);
      }
    }
  `,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoreSheet {
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  readonly closed = output<void>();

  protected readonly items = MOBILE_MORE;

  constructor() {
    // Move focus into the dialog so keyboard and screen reader users land on it.
    afterNextRender(() => this.sheet().nativeElement.focus());
  }
}
