import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Account, AccountType } from '../../core/api/api-types';
import { CurrencyCatalog } from '../../core/currency/currency-catalog';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { todayIso } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { ACCOUNT_TYPES, AccountsApi } from './accounts-api';

/** What the form is for: a new account, the details of an existing one, or stating its real balance. */
export type AccountFormTarget =
  | { readonly mode: 'open' }
  | { readonly mode: 'edit'; readonly account: Account }
  | { readonly mode: 'adjust'; readonly account: Account };

interface AccountFormModel {
  name: string;
  type: AccountType;
  currency: string;
  institution: string;
  /** What the account holds; for a credit card, what it owes. Always typed as a positive amount on a card. */
  balance: string;
  date: string;
  creditLimit: string;
  paymentDay: string;
  closingDay: string;
  includeInNetWorth: boolean;
}

function initialModel(target: AccountFormTarget, currency: string, today: Date): AccountFormModel {
  const account = target.mode === 'open' ? null : target.account;
  const card = account?.creditCard ?? null;
  // A card shows its debt as a positive number: nobody thinks of what they owe as "minus 200".
  const shown = account ? (card ? -Number(account.balance) : Number(account.balance)) : 0;
  return {
    name: account?.name ?? '',
    type: account?.type ?? 'bank',
    currency: account?.currency ?? currency,
    institution: account?.institution ?? '',
    balance: target.mode === 'adjust' ? (shown === 0 ? '0.00' : shown.toFixed(2)) : '',
    date: todayIso(today),
    creditLimit: card ? Number(card.creditLimit).toFixed(2) : '',
    paymentDay: card ? String(card.paymentDay) : '',
    closingDay: card?.closingDay ? String(card.closingDay) : '',
    includeInNetWorth: account?.includeInNetWorth ?? true,
  };
}

function dayOfMonth(text: string): number | null {
  return /^\d{1,2}$/.test(text.trim()) && +text >= 1 && +text <= 31 ? +text : null;
}

/** The dialog that opens, changes or adjusts an account. It saves by itself and reports what it did. */
@Component({
  selector: 'app-account-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog [title]="title()" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (target().mode === 'adjust') {
          <p class="form-note">
            {{ isCard() ? 'La deuda registrada es' : 'El saldo registrado es' }} <strong>{{ currentBalance() }}</strong
            >. Escribe {{ isCard() ? 'lo que la tarjeta debe de verdad' : 'lo que la cuenta tiene de verdad' }} y se registrará un ajuste por la diferencia;
            nada se sobrescribe.
          </p>
          <app-field [label]="isCard() ? 'Deuda real' : 'Saldo real'" [state]="accountForm.balance()">
            <input class="input" type="text" inputmode="decimal" [formField]="accountForm.balance" />
          </app-field>
          <app-field label="Fecha en que lo revisaste" [state]="accountForm.date()">
            <input class="input" type="date" [formField]="accountForm.date" />
          </app-field>
        } @else {
          <app-field label="Nombre" [state]="accountForm.name()">
            <input class="input" type="text" [placeholder]="isCard() ? 'ej. Visa Signature' : 'ej. BCP Sueldo, Efectivo'" [formField]="accountForm.name" />
          </app-field>
          @if (target().mode === 'open') {
            <div class="choice" role="group" aria-label="Tipo">
              <span class="label">Tipo</span>
              <div class="segmented segmented--block">
                @for (type of types; track type.value) {
                  <button type="button" [attr.aria-pressed]="model().type === type.value" (click)="chooseType(type.value)">{{ type.label }}</button>
                }
              </div>
            </div>
            <app-field label="Moneda" hint="No se puede cambiar después: todos sus movimientos estarán en esta moneda.">
              <select class="input" [formField]="accountForm.currency">
                @for (currency of currencies(); track currency.code) {
                  <option [value]="currency.code">{{ currency.name }} ({{ currency.symbol }})</option>
                }
              </select>
            </app-field>
          }
          <app-field label="Banco o proveedor (opcional)" [state]="accountForm.institution()">
            <input class="input" type="text" placeholder="ej. BCP, Yape" [formField]="accountForm.institution" />
          </app-field>
          @if (isCard()) {
            <app-field label="Línea de crédito" [state]="accountForm.creditLimit()">
              <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="accountForm.creditLimit" />
            </app-field>
            <div class="form-pair">
              <app-field label="Día de pago" [state]="accountForm.paymentDay()">
                <input class="input" type="text" inputmode="numeric" placeholder="1 a 31" [formField]="accountForm.paymentDay" />
              </app-field>
              <app-field label="Día de cierre (opcional)" [state]="accountForm.closingDay()">
                <input class="input" type="text" inputmode="numeric" placeholder="1 a 31" [formField]="accountForm.closingDay" />
              </app-field>
            </div>
          }
          @if (target().mode === 'open') {
            <app-field
              [label]="isCard() ? 'Deuda actual (opcional)' : 'Saldo actual (opcional)'"
              [hint]="isCard() ? 'Lo que la tarjeta debe hoy. Se registra como su saldo inicial.' : 'Lo que la cuenta tiene hoy. Se registra como su saldo inicial.'"
              [state]="accountForm.balance()"
            >
              <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="accountForm.balance" />
            </app-field>
          }
          <label class="form-check">
            <input type="checkbox" [formField]="accountForm.includeInNetWorth" />
            <span>Incluir en mi patrimonio. Sin marcar, la cuenta se sigue viendo y usando, pero no suma ni resta en el total.</span>
          </label>
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : submitLabel() }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: `
    .choice {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .label {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--tx2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountForm {
  private readonly api = inject(AccountsApi);
  private readonly today = inject(TODAY);

  // One key for the life of this dialog: a second click or a retry repeats the request instead of the effect.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<AccountFormTarget>();

  /** The currency a new account starts with: the one of the workspace. */
  readonly defaultCurrency = input('PEN');

  /** Emits the message to show once the change is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly types = ACCOUNT_TYPES;
  /** The currencies an account can have: the API's catalog. */
  protected readonly currencies = inject(CurrencyCatalog).list;

  protected readonly model = linkedSignal(() => initialModel(this.target(), this.defaultCurrency(), this.today()));
  protected readonly isCard = computed(() => this.model().type === 'creditCard');

  protected readonly accountForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => (this.target().mode !== 'adjust' && value().trim() === '' ? { kind: 'required', message: 'Escribe un nombre.' } : undefined));
    maxLength(path.name, 60, { message: 'Máximo 60 caracteres.' });
    maxLength(path.institution, 60, { message: 'Máximo 60 caracteres.' });
    validate(path.balance, ({ value }) => {
      const text = value().trim();
      if (text === '') {
        return this.target().mode === 'adjust' ? { kind: 'required', message: this.isCard() ? 'Escribe la deuda real.' : 'Escribe el saldo real.' } : undefined;
      }

      return parseAmount(text) === null ? { kind: 'amount', message: 'Escribe un monto con hasta dos decimales, por ejemplo 1250.50.' } : undefined;
    });
    required(path.date, { message: 'Elige una fecha.' });
    validate(path.creditLimit, ({ value }) => {
      if (!this.asksForCard()) {
        return undefined;
      }

      const limit = parseAmount(value());
      return limit === null || limit <= 0 ? { kind: 'amount', message: 'Escribe la línea de la tarjeta, mayor que cero.' } : undefined;
    });
    validate(path.paymentDay, ({ value }) =>
      this.asksForCard() && dayOfMonth(value()) === null ? { kind: 'day', message: 'Un día del mes, del 1 al 31.' } : undefined,
    );
    validate(path.closingDay, ({ value }) =>
      this.asksForCard() && value().trim() !== '' && dayOfMonth(value()) === null ? { kind: 'day', message: 'Un día del mes, del 1 al 31.' } : undefined,
    );
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly title = computed(() => ({ open: 'Nueva cuenta', edit: 'Editar cuenta', adjust: this.isCard() ? 'Ajustar deuda' : 'Ajustar saldo' })[this.target().mode]);
  protected readonly submitLabel = computed(() => ({ open: 'Crear cuenta', edit: 'Guardar', adjust: 'Registrar ajuste' })[this.target().mode]);
  protected readonly currentBalance = computed(() => {
    const target = this.target();
    if (target.mode === 'open') {
      return '';
    }

    const balance = Number(target.account.balance);
    return formatMoney(this.isCard() ? -balance : balance, target.account.currency);
  });

  protected chooseType(type: AccountType): void {
    this.model.update((model) => ({ ...model, type }));
  }

  protected save(): void {
    void submit(this.accountForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        this.saved.emit(await this.persist());
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  /** The line and the days are asked for a card being opened or edited, not when adjusting what it owes. */
  private asksForCard(): boolean {
    return this.isCard() && this.target().mode !== 'adjust';
  }

  private async persist(): Promise<string> {
    const target = this.target();
    const { type, currency, date, includeInNetWorth } = this.model();
    const name = this.model().name.trim();
    const institution = this.model().institution.trim() || null;
    const typed = parseAmount(this.model().balance) ?? 0;
    // What a card owes is a negative balance in the ledger.
    const balance = this.isCard() && typed !== 0 ? -typed : typed;
    const creditCard = this.isCard()
      ? { creditLimit: parseAmount(this.model().creditLimit), paymentDay: dayOfMonth(this.model().paymentDay), closingDay: dayOfMonth(this.model().closingDay) }
      : null;
    switch (target.mode) {
      case 'open':
        await this.api.open({ name, type, currency, institution, openingBalance: balance, includeInNetWorth, creditCard }, this.idempotencyKey);
        return `${this.isCard() ? 'Tarjeta' : 'Cuenta'} «${name}» creada.`;
      case 'edit':
        await this.api.update(target.account.id, { name, institution, includeInNetWorth, creditCard });
        return `${this.isCard() ? 'Tarjeta' : 'Cuenta'} «${name}» guardada.`;
      case 'adjust': {
        const account = await this.api.adjustBalance(target.account.id, balance, date, this.idempotencyKey);
        return this.isCard()
          ? `Deuda de «${account.name}» ajustada a ${formatMoney(-Number(account.balance), account.currency)}.`
          : `Saldo de «${account.name}» ajustado a ${formatMoney(account.balance, account.currency)}.`;
      }
    }
  }
}
