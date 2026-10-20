import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import { Account } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { AccountPicker, accountGroups } from '../../shared/ui/account-picker';
import { todayIso } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { AccountsApi } from './accounts-api';
import { isManagedAccount } from '../../core/api/managed-accounts';

interface PaymentModel {
  fromAccountId: string;
  amount: string;
  sourceAmount: string;
  date: string;
}

const AMOUNT_ERROR = { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' };

/**
 * Pays a credit card from an account that holds money. It is a transfer: the purchase was the expense, so
 * paying the card is neither an expense nor a change in net worth.
 */
@Component({
  selector: 'app-card-payment-form',
  imports: [AccountPicker, Dialog, Field, FormField],
  template: `
    <app-dialog title="Pagar tarjeta" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <p class="form-note">
          «{{ card().name }}» debe <strong>{{ owed() }}</strong
          >. El pago sale de una de tus cuentas y no cuenta como gasto: el gasto fue la compra.
        </p>
        @if (sources().length === 0) {
          <div class="alert alert--info" role="status">Necesitas una cuenta de banco, efectivo o billetera para pagar desde ella.</div>
        } @else {
          <app-field label="Pagar desde" [state]="paymentForm.fromAccountId()">
            <app-account-picker label="Pagar desde" [groups]="sourceGroups()" [formField]="paymentForm.fromAccountId" />
          </app-field>
          <div class="form-pair">
            <app-field [label]="'Monto del pago (' + card().currency + ')'" [state]="paymentForm.amount()">
              <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="paymentForm.amount" />
            </app-field>
            <app-field label="Fecha" [state]="paymentForm.date()">
              <input class="input" type="date" [formField]="paymentForm.date" />
            </app-field>
          </div>
          @if (source(); as from) {
            @if (from.currency !== card().currency) {
              <app-field
                [label]="'Sale de la cuenta (' + from.currency + ')'"
                hint="La cuenta tiene otra moneda: escribe cuánto salió de ella, como figura en tu banco."
                [state]="paymentForm.sourceAmount()"
              >
                <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="paymentForm.sourceAmount" />
              </app-field>
            }
          }
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy() || sources().length === 0">{{ busy() ? 'Guardando…' : 'Registrar pago' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardPaymentForm {
  private readonly api = inject(AccountsApi);
  private readonly today = inject(TODAY);

  // One key for the life of this dialog: a second click or a retry repeats the request instead of the effect.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly card = input.required<Account>();
  readonly accounts = input.required<readonly Account[]>();

  /** Emits the message to show once the payment is registered. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  /** A card is paid with money, so another card is not offered. */
  protected readonly sources = computed(() => this.accounts().filter((account) => !account.isArchived && account.type !== 'creditCard' && !isManagedAccount(account.type)));

  /** The card's currency first: paying from an account in it needs no exchange. */
  protected readonly sourceGroups = computed(() => accountGroups(this.sources(), this.card().currency));

  protected readonly model = linkedSignal<PaymentModel>(() => {
    const owed = Number(this.card().creditCard?.used ?? 0);
    // Not tracked: balances arriving while the dialog is open must not clear what was typed.
    const sources = untracked(this.sources);
    return { fromAccountId: sources.length === 1 ? sources[0].id : '', amount: owed > 0 ? owed.toFixed(2) : '', sourceAmount: '', date: todayIso(this.today()) };
  });

  protected readonly source = computed(() => this.sources().find((account) => account.id === this.model().fromAccountId) ?? null);
  protected readonly owed = computed(() => formatMoney(this.card().creditCard?.used ?? 0, this.card().currency));

  protected readonly paymentForm = form(this.model, (path) => {
    required(path.fromAccountId, { message: 'Elige la cuenta desde la que pagas.' });
    validate(path.amount, ({ value }) => ((parseAmount(value()) ?? 0) > 0 ? undefined : AMOUNT_ERROR));
    validate(path.sourceAmount, ({ value }) => (!this.needsSourceAmount() || (parseAmount(value()) ?? 0) > 0 ? undefined : AMOUNT_ERROR));
    required(path.date, { message: 'Elige una fecha.' });
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected save(): void {
    void submit(this.paymentForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const { fromAccountId, date } = this.model();
        const amount = parseAmount(this.model().amount) ?? 0;
        const sourceAmount = this.needsSourceAmount() ? parseAmount(this.model().sourceAmount) : null;
        await this.api.payCard(this.card().id, { fromAccountId, amount, sourceAmount, occurredOn: date }, this.idempotencyKey);
        this.saved.emit(`Pago de ${formatMoney(amount, this.card().currency)} a «${this.card().name}» registrado.`);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  private needsSourceAmount(): boolean {
    const source = this.source();
    return source !== null && source.currency !== this.card().currency;
  }
}
