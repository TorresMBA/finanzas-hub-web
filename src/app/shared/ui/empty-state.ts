import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from './icon';

/** Shown when a view has loaded and there is nothing to show. Project buttons to offer a next step. */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  template: `
    <app-icon [name]="icon()" [size]="30" />
    <div class="title">{{ title() }}</div>
    @if (message(); as text) {
      <div class="message">{{ text }}</div>
    }
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 20px;
      text-align: center;
      background: var(--sf);
      border: 1px solid var(--bd);
      border-radius: 16px;
    }
    app-icon {
      color: var(--mu);
    }
    .title {
      font-weight: 800;
    }
    .message {
      font-size: 13px;
      color: var(--mu);
      max-width: 46ch;
      text-wrap: pretty;
    }
    .actions {
      margin-top: 6px;
      display: flex;
      gap: 8px;
    }
    .actions:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly message = input<string>();
}
