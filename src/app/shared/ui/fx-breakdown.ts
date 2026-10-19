import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from './icon';

/** One line of a conversion: "Tipo aplicado — 1 US$ = S/ 3.770". A cost reads as bad, no cost as good. */
export interface FxRow {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'good' | 'bad';
}

/**
 * How an amount went from one currency to another: the rates and what the change cost, as a small block of label and
 * value lines with a note below. Project an action, like adjusting the rate, to show it at the end.
 */
@Component({
  selector: 'app-fx-breakdown',
  imports: [Icon],
  template: `
    @if (title(); as text) {
      <p class="title"><app-icon [name]="icon()" [size]="17" />{{ text }}</p>
    }
    <dl>
      @for (row of rows(); track row.label) {
        <div>
          <dt>{{ row.label }}</dt>
          <dd [attr.data-tone]="row.tone ?? null">{{ row.value }}</dd>
        </div>
      }
    </dl>
    @if (note(); as text) {
      <p class="note">{{ text }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border-radius: 12px;
      background: var(--bls);
    }
    .title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 800;

      app-icon {
        color: var(--bl);
      }
    }
    dl {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;

      div {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      dt {
        color: var(--tx2);
      }
      dd {
        margin: 0;
        font-weight: 800;
        text-align: right;
      }
    }
    [data-tone='bad'] {
      color: var(--rd);
    }
    [data-tone='good'] {
      color: var(--ac);
    }
    .note {
      font-size: 11.5px;
      color: var(--tx2);
      text-wrap: pretty;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FxBreakdown {
  readonly rows = input.required<readonly FxRow[]>();
  readonly title = input<string>();
  readonly icon = input('currency_exchange');
  readonly note = input<string>();
}
