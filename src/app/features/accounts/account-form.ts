import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Account, AccountType } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { todayIso } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { ACCOUNT_TYPES, AccountsApi, CURRENCIES } from './accounts-api';

/** What the form is for: a new account, the name of an existing one, or stating its real balance. */
export type AccountFormTarget =
  | { readonly mode: 'open' }
  | { readonly mode: 'edit'; readonly account: Account }
  | { readonly mode: 'adjust'; readonly account: Account };

interface AccountFormModel {
  name: string;
  type: AccountType;
  currency: string;
  institution: string;
  balance: string;
  date: string;
}

function initialModel(target: AccountFormTarget, currency: string): AccountFormModel {
  const account = target.mode === 'open' ? null : target.account;
  return {
    name: account?.name ?? '',
    type: account?.type ?? 'bank',
    currency: account?.currency ?? currency,
    institution: account?.institution ?? '',
    balance: target.mode === 'adjust' ? Number(target.account.balance).toFixed(2) : '',
    date: todayIso(),
  };
}

/** The dialog that opens, renames or adjusts an account. It saves by itself and reports what it did. */
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
          <p class="note">
            El saldo registrado es <strong>{{ currentBalance() }}</strong>. Escribe lo que la cuenta tiene de verdad y se registrará un ajuste por la
            diferencia; nada se sobrescribe.
          </p>
          <app-field label="Saldo real" [state]="accountForm.balance()">
            <input class="input" type="text" inputmode="decimal" [formField]="accountForm.balance" />
          </app-field>
          <app-field label="Fecha en que lo revisaste" [state]="accountForm.date()">
            <input class="input" type="date" [formField]="accountForm.date" />
          </app-field>
        } @else {
          <app-field label="Nombre" [state]="accountForm.name()">
            <input class="input" type="text" placeholder="ej. BCP Sueldo, Efectivo" [formField]="accountForm.name" />
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
                @for (currency of currencies; track currency.code) {
                  <option [value]="currency.code">{{ currency.label }}</option>
                }
              </select>
            </app-field>
          }
          <app-field label="Banco o proveedor (opcional)" [state]="accountForm.institution()">
            <input class="input" type="text" placeholder="ej. BCP, Yape" [formField]="accountForm.institution" />
          </app-field>
          @if (target().mode === 'open') {
            <app-field label="Saldo actual (opcional)" hint="Lo que la cuenta tiene hoy. Se registra como su saldo inicial." [state]="accountForm.balance()">
              <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="accountForm.balance" />
            </app-field>
          }
        }
        <div class="actions">
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
    .note {
      font-size: 13px;
      color: var(--mu);
      text-wrap: pretty;

      strong {
        color: var(--tx);
      }
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountForm {
  private readonly api = inject(AccountsApi);

  // One key for the life of this dialog: a second click or a retry repeats the request instead of the effect.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<AccountFormTarget>();

  /** The currency a new account starts with: the one of the workspace. */
  readonly defaultCurrency = input('PEN');

  /** Emits the message to show once the change is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly types = ACCOUNT_TYPES;
  protected readonly currencies = CURRENCIES;

  protected readonly model = linkedSignal(() => initialModel(this.target(), this.defaultCurrency()));
  protected readonly accountForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => (this.target().mode !== 'adjust' && value().trim() === '' ? { kind: 'required', message: 'Escribe un nombre.' } : undefined));
    maxLength(path.name, 60, { message: 'Máximo 60 caracteres.' });
    maxLength(path.institution, 60, { message: 'Máximo 60 caracteres.' });
    validate(path.balance, ({ value }) => {
      const text = value().trim();
      if (text === '') {
        return this.target().mode === 'adjust' ? { kind: 'required', message: 'Escribe el saldo real.' } : undefined;
      }

      return parseAmount(text) === null ? { kind: 'amount', message: 'Escribe un monto con hasta dos decimales, por ejemplo 1250.50.' } : undefined;
    });
    required(path.date, { message: 'Elige una fecha.' });
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly title = computed(() => ({ open: 'Nueva cuenta', edit: 'Editar cuenta', adjust: 'Ajustar saldo' })[this.target().mode]);
  protected readonly submitLabel = computed(() => ({ open: 'Crear cuenta', edit: 'Guardar', adjust: 'Registrar ajuste' })[this.target().mode]);
  protected readonly currentBalance = computed(() => {
    const target = this.target();
    return target.mode === 'open' ? '' : formatMoney(target.account.balance, target.account.currency);
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

  private async persist(): Promise<string> {
    const target = this.target();
    const { type, currency, date } = this.model();
    const name = this.model().name.trim();
    const institution = this.model().institution.trim() || null;
    const balance = parseAmount(this.model().balance) ?? 0;
    switch (target.mode) {
      case 'open':
        await this.api.open({ name, type, currency, institution, openingBalance: balance }, this.idempotencyKey);
        return `Cuenta «${name}» creada.`;
      case 'edit':
        await this.api.update(target.account.id, name, institution);
        return `Cuenta «${name}» guardada.`;
      case 'adjust': {
        const account = await this.api.adjustBalance(target.account.id, balance, date, this.idempotencyKey);
        return `Saldo de «${account.name}» ajustado a ${formatMoney(account.balance, account.currency)}.`;
      }
    }
  }
}
