import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Account, HoldingSummary, InvestmentType } from '../../core/api/api-types';
import { isManagedAccount } from '../../core/api/managed-accounts';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { toIsoDate } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { InvestmentsApi, TYPES, TYPE_LOOK, hasUnits } from './investments-api';

/** What the dialog does: register an investment, or put money in, take it out or write down what one is worth. */
export type HoldingFormTarget =
  | { readonly mode: 'open'; readonly accounts: readonly Account[] }
  | { readonly mode: 'contribute' | 'withdraw' | 'value'; readonly holding: HoldingSummary; readonly accounts: readonly Account[] };

const TITLES = { open: 'Registrar inversión', contribute: 'Aportar', withdraw: 'Rescatar', value: 'Actualizar valor' } as const;
const AMOUNT_ERROR = { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' };

/** At least `min`. False for NaN, so text that is not a number never passes. */
function atLeast(value: number, min: number): boolean {
  return value >= min;
}

/** Greater than zero. False for NaN, so text that is not a number never passes. */
function positive(value: number): boolean {
  return value > 0;
}

/** A decimal typed with a comma or a point. */
function decimal(text: string): number {
  return Number(text.replace(',', '.'));
}

/**
 * One dialog for everything that changes an investment. Money always moves between an account of the person and
 * the investment as a transfer: buying is not spending. Only the gain of a redemption is an income.
 */
@Component({
  selector: 'app-holding-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog [title]="title()" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }

        @if (target().mode === 'open') {
          <app-field label="Tipo">
            <select class="input" [formField]="holdingForm.type">
              @for (type of types; track type) {
                <option [value]="type">{{ typeLook[type].label }}</option>
              }
            </select>
          </app-field>
          <app-field label="Nombre" [state]="holdingForm.name()">
            <input class="input" type="text" placeholder="Fondo Conservador, Plazo fijo…" [formField]="holdingForm.name" />
          </app-field>
          <div class="form-pair">
            @if (units()) {
              <app-field label="Ticker (opcional)">
                <input class="input" type="text" placeholder="VOO" [formField]="holdingForm.ticker" />
              </app-field>
            }
            <app-field label="Institución (opcional)">
              <input class="input" type="text" placeholder="BCP, Interbank…" [formField]="holdingForm.institution" />
            </app-field>
          </div>
        }

        @if (target().mode === 'value') {
          <app-field label="Fecha" [state]="holdingForm.date()">
            <input class="input" type="date" [formField]="holdingForm.date" />
          </app-field>
          @if (units()) {
            <app-field [label]="'Precio de una unidad (' + currency() + ')'" [hint]="unitsHint()" [state]="holdingForm.price()">
              <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="holdingForm.price" />
            </app-field>
          } @else {
            <app-field [label]="'Valor actual (' + currency() + ')'" hint="Lo que dice tu banco o tu broker que vale hoy." [state]="holdingForm.amount()">
              <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="holdingForm.amount" />
            </app-field>
          }
        } @else if (accounts().length === 0) {
          <p class="form-note">No tienes una cuenta {{ currencyNote() }}con la que mover este dinero. Créala en Cuentas.</p>
        } @else {
          <div class="form-pair">
            <app-field [label]="'Monto' + (currency() ? ' (' + currency() + ')' : '')" [hint]="amountHint()" [state]="holdingForm.amount()">
              <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="holdingForm.amount" />
            </app-field>
            <app-field label="Fecha" [state]="holdingForm.date()">
              <input class="input" type="date" [formField]="holdingForm.date" />
            </app-field>
          </div>
          @if (target().mode === 'withdraw') {
            <button type="button" class="link" (click)="takeAll()">Rescatar todo ({{ worth() }})</button>
          }
          @if (units()) {
            <app-field [label]="target().mode === 'withdraw' ? 'Unidades vendidas (opcional)' : 'Unidades compradas'" [state]="holdingForm.quantity()">
              <input class="input" type="text" inputmode="decimal" placeholder="0" [formField]="holdingForm.quantity" />
            </app-field>
          }
          @if (deposit()) {
            <div class="form-pair">
              <app-field label="TEA (%)" [state]="holdingForm.rate()">
                <input class="input" type="text" inputmode="decimal" placeholder="6.5" [formField]="holdingForm.rate" />
              </app-field>
              <app-field label="Plazo (días)" [state]="holdingForm.days()">
                <input class="input" type="text" inputmode="numeric" placeholder="360" [formField]="holdingForm.days" />
              </app-field>
            </div>
            @if (projection(); as text) {
              <p class="form-note">{{ text }}</p>
            }
          }
          <app-field [label]="target().mode === 'withdraw' ? 'Hacia la cuenta' : 'Desde la cuenta'" [state]="holdingForm.accountId()">
            <select class="input" [formField]="holdingForm.accountId">
              <option value="">Elige una cuenta</option>
              @for (account of accounts(); track account.id) {
                <option [value]="account.id">{{ account.name }} · {{ account.currency }}</option>
              }
            </select>
          </app-field>
          <p class="form-note">{{ note() }}</p>
        }

        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy() || (target().mode !== 'value' && accounts().length === 0)">
            {{ busy() ? 'Guardando…' : action() }}
          </button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: `
    .link {
      align-self: flex-start;
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoldingForm {
  private readonly api = inject(InvestmentsApi);
  private readonly today = inject(TODAY);

  // Created with the form, so sending it twice moves the money once.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<HoldingFormTarget>();

  /** Emits the message to show once it is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly types = TYPES;
  protected readonly typeLook = TYPE_LOOK;

  private readonly holding = computed(() => {
    const target = this.target();
    return target.mode === 'open' ? null : target.holding;
  });

  protected readonly model = linkedSignal(() => ({
    type: 'mutualFund' as InvestmentType,
    name: '',
    ticker: '',
    institution: '',
    amount: '',
    quantity: '',
    price: '',
    rate: '',
    days: '',
    date: toIsoDate(this.today()),
    // With a single account it could be, it is already chosen.
    accountId: this.accounts().length === 1 ? this.accounts()[0].id : '',
  }));

  protected readonly type = computed(() => this.holding()?.type ?? this.model().type);
  protected readonly units = computed(() => hasUnits(this.type()));
  protected readonly deposit = computed(() => this.target().mode === 'open' && this.type() === 'termDeposit');
  protected readonly action = computed(() => TITLES[this.target().mode]);
  protected readonly title = computed(() => {
    const holding = this.holding();
    return holding ? `${TITLES[this.target().mode]} · ${holding.name}` : TITLES.open;
  });

  /** Accounts that hold money: not a card, not a goal or another investment; in the currency of the investment once it has one. */
  protected readonly accounts = computed(() => {
    const currency = this.holding()?.currency;
    return this.target().accounts.filter(
      (account) => !account.isArchived && account.type !== 'creditCard' && !isManagedAccount(account.type) && (!currency || account.currency === currency),
    );
  });

  protected readonly currency = computed(
    () => this.holding()?.currency ?? this.target().accounts.find((account) => account.id === this.model().accountId)?.currency ?? '',
  );
  protected readonly currencyNote = computed(() => (this.holding() ? `en ${this.holding()!.currency} ` : ''));
  protected readonly worth = computed(() => {
    const holding = this.holding();
    return holding ? formatMoney(holding.value, holding.currency) : '';
  });
  protected readonly amountHint = computed(() => (this.target().mode === 'withdraw' ? `Hoy vale ${this.worth()}.` : ''));
  protected readonly unitsHint = computed(() => {
    const quantity = Number(this.holding()?.quantity ?? 0);
    return `Tienes ${quantity.toLocaleString('es-PE', { maximumFractionDigits: 8 })} unidades.`;
  });

  /** What a deposit will be worth at maturity, as the bank counts it: a year of 360 days. */
  protected readonly projection = computed(() => {
    const amount = parseAmount(this.model().amount);
    const rate = Number(this.model().rate);
    const days = Number(this.model().days);
    if (!amount || !positive(rate) || !positive(days) || !this.currency()) {
      return null;
    }

    const value = amount * Math.pow(1 + rate / 100, days / 360);
    return `Al vencer valdrá unos ${formatMoney(Math.round(value * 100) / 100, this.currency())}.`;
  });

  protected readonly note = computed(() => {
    switch (this.target().mode) {
      case 'withdraw':
        return 'Vuelve a tu cuenta. Lo que ganaste sobre lo invertido entra como ingreso de «Inversiones»; si perdiste, como gasto.';
      case 'contribute':
        return 'Es una transferencia a tu inversión, no un gasto. Tu patrimonio no cambia.';
      default:
        return 'Es una transferencia desde tu cuenta, no un gasto: tu patrimonio no cambia. La inversión queda en la moneda de la cuenta.';
    }
  });

  protected readonly holdingForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => (this.target().mode === 'open' && value().trim() === '' ? { kind: 'required', message: 'Escribe un nombre.' } : undefined));
    validate(path.amount, ({ value }) => {
      if (this.target().mode === 'value' && this.units()) {
        return undefined;
      }

      const amount = parseAmount(value());
      if (this.target().mode === 'value') {
        return amount === null || amount < 0 ? { kind: 'amount', message: 'Un valor de cero o más.' } : undefined;
      }

      if (!amount || amount <= 0) {
        return AMOUNT_ERROR;
      }

      return this.target().mode === 'withdraw' && amount > Number(this.holding()?.value ?? 0)
        ? { kind: 'max', message: 'No puedes rescatar más de lo que vale hoy.' }
        : undefined;
    });
    validate(path.price, ({ value }) =>
      this.target().mode === 'value' && this.units() && !positive(parseAmount(value()) ?? 0) ? { kind: 'amount', message: 'Un precio mayor que cero.' } : undefined,
    );
    validate(path.quantity, ({ value }) =>
      this.units() && this.target().mode !== 'value' && this.target().mode !== 'withdraw' && !positive(decimal(value()))
        ? { kind: 'quantity', message: 'Cuántas unidades compraste.' }
        : undefined,
    );
    validate(path.rate, ({ value }) => (this.deposit() && !positive(decimal(value())) ? { kind: 'rate', message: 'La TEA, por ejemplo 6.5.' } : undefined));
    validate(path.days, ({ value }) => (this.deposit() && !atLeast(Number(value()), 1) ? { kind: 'days', message: 'El plazo en días.' } : undefined));
    validate(path.date, ({ value }) => (value() ? undefined : { kind: 'required', message: 'Elige una fecha.' }));
    validate(path.accountId, ({ value }) => (this.target().mode !== 'value' && !value() ? { kind: 'required', message: 'Elige una cuenta.' } : undefined));
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected takeAll(): void {
    this.model.update((model) => ({ ...model, amount: Number(this.holding()?.value ?? 0).toFixed(2) }));
  }

  protected save(): void {
    void submit(this.holdingForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        this.saved.emit(await this.send());
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  private async send(): Promise<string> {
    const model = this.model();
    const amount = parseAmount(model.amount) ?? 0;
    const quantity = model.quantity.trim() ? decimal(model.quantity) : null;
    const target = this.target();
    if (target.mode === 'open') {
      return this.open(amount, quantity);
    }

    const { holding } = target;
    if (target.mode === 'value') {
      await this.api.value(holding.id, model.date, this.units() ? null : amount, this.units() ? parseAmount(model.price) : null);
      return `Valor de «${holding.name}» actualizado.`;
    }

    const money = { amount, quantity: this.units() ? quantity : null, occurredOn: model.date, accountId: model.accountId };
    await this.api.move(holding.id, target.mode === 'withdraw' ? 'withdrawals' : 'contributions', money, this.idempotencyKey);
    const text = formatMoney(amount, holding.currency);
    return target.mode === 'withdraw' ? `Rescataste ${text} de «${holding.name}».` : `Aportaste ${text} a «${holding.name}».`;
  }

  private async open(amount: number, quantity: number | null): Promise<string> {
    const model = this.model();
    const units = this.units();
    const deposit = this.deposit();
    await this.api.open(
      {
        type: model.type,
        name: model.name.trim(),
        ticker: units ? model.ticker.trim() || null : null,
        institution: model.institution.trim() || null,
        amount,
        quantity: units ? quantity : null,
        openedOn: model.date,
        fromAccountId: model.accountId,
        annualRate: deposit ? decimal(model.rate) : null,
        termDays: deposit ? Number(model.days) : null,
      },
      this.idempotencyKey,
    );
    return `Registraste «${model.name.trim()}» con ${formatMoney(amount, this.currency())}.`;
  }
}
