import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from './icon';

/** Shown when a view could not load. Always offers a retry. */
@Component({
  selector: 'app-error-state',
  imports: [Icon],
  template: `
    <app-icon name="error" [size]="30" />
    <div class="title">{{ title() }}</div>
    <div class="message">{{ message() }}</div>
    <button type="button" (click)="retry.emit()">Reintentar</button>
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
      color: var(--rd);
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
    button {
      margin-top: 6px;
      height: 34px;
      padding: 0 12px;
      border-radius: 9px;
      background: var(--acs);
      color: var(--ac);
      font-weight: 700;
      font-size: 12.5px;
    }
  `,
  host: { role: 'alert' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorState {
  readonly title = input('No se pudo cargar');
  readonly message = input('Revisa tu conexión e inténtalo de nuevo.');
  readonly retry = output<void>();
}
