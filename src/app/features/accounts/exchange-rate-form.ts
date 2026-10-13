import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { errorMessage } from '../../core/errors/error-messages';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { AccountsApi } from './accounts-api';

/** What the dialog needs to know: the currency being valued, the one it is valued in, and the rate in force if any. */
export interface ExchangeRateTarget {
  readonly currency: string;
  readonly baseCurrency: string;
  readonly rate: number | string | null;
}

function parseRate(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return /^\d{1,7}(\.\d{1,6})?$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}

/**
 * States how much of the base currency one unit of another currency is worth, from today on. It is a reference
 * the person keeps by hand to see everything in one currency; it never moves money.
 */
@Component({
  selector: 'app-exchange-rate-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog [title]="'Tipo de cambio de ' + target().currency" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <p class="form-note">
          Sirve para sumar tus cuentas en {{ target().currency }} a tu patrimonio en {{ target().baseCurrency }}. Vale desde hoy: lo que ya registraste
          conserva el valor que tenía.
        </p>
        <app-field [label]="'1 ' + target().currency + ' equivale a (' + target().baseCurrency + ')'" [state]="rateForm.rate()">
          <input class="input" type="text" inputmode="decimal" placeholder="ej. 3.75" [formField]="rateForm.rate" />
        </app-field>
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExchangeRateForm {
  private readonly api = inject(AccountsApi);

  readonly target = input.required<ExchangeRateTarget>();

  /** Emits the message to show once the rate is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly model = linkedSignal(() => ({ rate: this.target().rate === null ? '' : String(Number(this.target().rate)) }));
  protected readonly rateForm = form(this.model, (path) => {
    validate(path.rate, ({ value }) => (parseRate(value()) === null ? { kind: 'rate', message: 'Un número mayor que cero, con hasta seis decimales.' } : undefined));
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected save(): void {
    void submit(this.rateForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const { currency, baseCurrency } = this.target();
        const saved = await this.api.setRate(currency, parseRate(this.model().rate) ?? 0);
        this.saved.emit(`Tipo de cambio guardado: 1 ${currency} = ${Number(saved.rate)} ${baseCurrency}.`);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
