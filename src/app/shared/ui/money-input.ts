import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { currencySymbol } from './money';

/**
 * An amount with the symbol of its currency in front, as the mock draws it. With several `currencies` the symbol
 * becomes a choice, for a price set in another currency than the account's. Bind the amount with `[formField]`; it
 * stays the text the person typed, for the form to read with `parseAmount`.
 */
@Component({
  selector: 'app-money-input',
  template: `
    <div class="box" [class.is-invalid]="invalid() && touched()">
      @if (currencies().length > 1) {
        <select class="prefix" aria-label="Moneda" [value]="currency()" [disabled]="disabled()" (change)="pick($event)">
          @for (code of currencies(); track code) {
            <option [value]="code" [selected]="code === currency()">{{ symbol(code) }} {{ code }}</option>
          }
        </select>
      } @else {
        <span class="symbol" aria-hidden="true">{{ symbol(currency()) }}</span>
      }
      <input
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [placeholder]="placeholder()"
        [attr.aria-label]="label()"
        [value]="value()"
        [disabled]="disabled()"
        (input)="value.set($any($event.target).value)"
        (blur)="touch.emit()"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .box {
      height: 42px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px 0 4px;
      border-radius: 10px;
      border: 1px solid var(--bd);
      background: var(--sf2);

      &:focus-within {
        border-color: var(--ac);
      }
      &.is-invalid {
        border-color: var(--rd);
      }
    }
    .symbol {
      padding: 0 4px 0 8px;
      font-size: 13px;
      font-weight: 800;
      color: var(--mu);
    }
    .prefix {
      height: 32px;
      flex: none;
      padding: 0 6px;
      border: 0;
      border-radius: 7px;
      background: var(--sf3);
      color: var(--tx);
      font-size: 12.5px;
      font-weight: 800;
    }
    input {
      flex: 1;
      min-width: 0;
      width: 100%;
      border: 0;
      outline: 0;
      background: none;
      color: var(--tx);
      font-size: 14px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoneyInput implements FormValueControl<string> {
  readonly value = model('');
  /** The currency of the amount: its symbol goes in front. */
  readonly currency = input.required<string>();
  /** The currencies the amount may be in, to choose among; empty or one, and there is nothing to choose. */
  readonly currencies = input<readonly string[]>([]);
  /** For assistive technology, since the field's label is read for the first control only. */
  readonly label = input<string>();
  readonly placeholder = input('0.00');

  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touch = output<void>();

  /** Emits the code the person chose in front of the amount. */
  readonly currencyChange = output<string>();

  protected readonly symbol = currencySymbol;

  protected pick(event: Event): void {
    this.currencyChange.emit((event.target as HTMLSelectElement).value);
  }
}
