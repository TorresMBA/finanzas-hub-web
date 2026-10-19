import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { Icon } from './icon';

let nextId = 0;

/**
 * Optional parts of a form folded under one line, so the common case stays short. While closed it counts how many of
 * them are filled, so nothing typed goes unnoticed.
 */
@Component({
  selector: 'app-disclosure',
  imports: [Icon],
  template: `
    <button type="button" class="toggle" [attr.aria-expanded]="open()" [attr.aria-controls]="panelId" (click)="open.set(!open())">
      <app-icon [name]="open() ? 'expand_less' : 'add'" [size]="18" />
      {{ open() ? openLabel() : label() }}
      @if (!open() && count() > 0) {
        <span class="count" [attr.aria-label]="count() + ' con datos'">{{ count() }}</span>
      }
    </button>
    <div class="panel" [id]="panelId" [hidden]="!open()">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .toggle {
      align-self: flex-start;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 800;
      color: var(--tx2);

      app-icon {
        color: var(--mu);
      }
    }
    .count {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      display: grid;
      place-items: center;
      border-radius: 99px;
      background: var(--acs);
      color: var(--ac);
      font-size: 11px;
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .panel[hidden] {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Disclosure {
  /** What is folded, read while closed: "Etiquetas, comercio, nota, repetir". */
  readonly label = input.required<string>();
  readonly openLabel = input('Ocultar detalles');
  /** How many of the folded parts hold something. */
  readonly count = input(0);
  readonly open = model(false);

  protected readonly panelId = `disclosure-${nextId++}`;
}
