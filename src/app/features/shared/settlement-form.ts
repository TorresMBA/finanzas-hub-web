import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Account, Category } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { AccountPicker, accountGroups } from '../../shared/ui/account-picker';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { SharedApi } from './shared-api';
import { isManagedAccount } from '../../core/api/managed-accounts';

/**
 * A payment between two members to register, or one already registered that the person now puts in one of
 * their accounts. `iPay` says which side the person is on: paying is an expense of theirs, being paid a refund.
 */
export interface SettlementFormTarget {
  readonly groupId: string;
  readonly currency: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly otherName: string;
  readonly iPay: boolean;
  /** What is owed, for a new payment; the amount of the payment when it already exists. */
  readonly amount: number;
  /** Set when the payment exists and only the account is missing. */
  readonly settlementId: string | null;
  /** The one expense a new payment is for; then `amount` is what is still owed of it. Null pays the oldest first. */
  readonly expense?: { readonly id: string; readonly description: string } | null;
  readonly categories: readonly Category[];
}

const REQUIRED = { kind: 'required', message: 'Este dato es necesario.' };

@Component({
  selector: 'app-settlement-form',
  imports: [AccountPicker, Dialog, Field, FormField],
  template: `
    <app-dialog [title]="title()" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (isNew()) {
          <app-field [label]="'Monto (' + target().currency + ')'" [hint]="owedHint()" [state]="paymentForm.amount()">
            <input class="input" type="text" inputmode="decimal" [formField]="paymentForm.amount" />
          </app-field>
          <label class="form-check">
            <input type="checkbox" [formField]="paymentForm.toLedger" />
            <span>{{ target().iPay ? 'Registrar el pago en una de mis cuentas, como un gasto mío.' : 'Registrar el cobro en una de mis cuentas, como reembolso.' }}</span>
          </label>
        } @else {
          <p class="form-note">
            {{ target().iPay ? 'Pagaste' : 'Te pagaron' }} <strong>{{ owed() }}</strong>.
            {{ target().iPay ? 'Regístralo en tu cuenta como un gasto tuyo.' : 'Regístralo en tu cuenta como reembolso: resta de lo que gastaste, no es un ingreso.' }}
          </p>
        }
        @if (model().toLedger) {
          <app-field label="Cuenta" [state]="paymentForm.accountId()">
<app-account-picker label="Cuenta" [groups]="accountGroups()" [formField]="paymentForm.accountId" />
          </app-field>
          <app-field
            label="Categoría"
            [hint]="target().iPay ? '' : 'Déjala vacía para usar la del gasto original, si lo registraste en tu cuenta.'"
            [state]="paymentForm.categoryId()"
          >
            <select class="input" [formField]="paymentForm.categoryId">
              <option value="">{{ target().iPay ? 'Elige una categoría' : 'La del gasto original' }}</option>
              @for (option of categoryOptions(); track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
          </app-field>
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : isNew() ? 'Registrar' : 'Guardar' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettlementForm {
  private readonly api = inject(SharedApi);

  // Created with the form, so sending it twice registers the payment once.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<SettlementFormTarget>();
  /** The person's accounts, bound live: a balance that changes while the dialog is open shows here. */
  readonly accounts = input.required<readonly Account[]>();

  /** Emits the message to show once it is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly isNew = computed(() => this.target().settlementId === null);
  protected readonly owed = computed(() => formatMoney(this.target().amount, this.target().currency));
  protected readonly owedHint = computed(() => {
    const expense = this.target().expense;
    return expense ? `De «${expense.description}» quedan ${this.owed()}.` : `Se deben ${this.owed()}.`;
  });
  protected readonly title = computed(() => {
    const { iPay, otherName, expense } = this.target();
    if (!this.isNew()) {
      return 'Registrar en mi cuenta';
    }

    if (expense) {
      return iPay ? `Pagar «${expense.description}» a ${otherName}` : `Cobrar «${expense.description}» de ${otherName}`;
    }

    return iPay ? `Pagar a ${otherName}` : `Registrar cobro de ${otherName}`;
  });

  /** The accounts that can take it: in the currency of the group and not the fund of a goal. */
  protected readonly usable = computed(() =>
    this.accounts().filter((account) => !account.isArchived && account.currency === this.target().currency && !isManagedAccount(account.type)),
  );
  protected readonly accountGroups = computed(() => accountGroups(this.usable()));
  protected readonly categoryOptions = computed(() =>
    this.target()
      .categories.filter((category) => !category.isArchived)
      .flatMap((category) => [
        { id: category.id, label: category.name },
        ...category.subcategories.filter((subcategory) => !subcategory.isArchived).map((subcategory) => ({ id: subcategory.id, label: `${category.name} / ${subcategory.name}` })),
      ]),
  );

  protected readonly model = linkedSignal(() => ({
    amount: this.target().amount.toFixed(2),
    // Putting an existing payment in an account is the whole point of that form.
    toLedger: this.target().settlementId !== null,
    accountId: '',
    categoryId: '',
  }));
  protected readonly paymentForm = form(this.model, (path) => {
    validate(path.amount, ({ value }) => {
      const amount = parseAmount(value()) ?? 0;
      if (amount <= 0) {
        return { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' };
      }

      return this.isNew() && amount > this.target().amount ? { kind: 'max', message: 'No puede ser más de lo que se debe.' } : undefined;
    });
    validate(path.accountId, ({ value, valueOf }) => (!valueOf(path.toLedger) || value() ? undefined : REQUIRED));
    validate(path.categoryId, ({ value, valueOf }) => (!valueOf(path.toLedger) || !this.target().iPay || value() ? undefined : REQUIRED));
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected save(): void {
    void submit(this.paymentForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const target = this.target();
        const model = this.model();
        const accountId = model.toLedger ? model.accountId : null;
        const categoryId = model.toLedger && model.categoryId ? model.categoryId : null;
        if (target.settlementId) {
          await this.api.linkAccount(target.groupId, target.settlementId, model.accountId, categoryId, this.idempotencyKey);
          this.saved.emit('Pago registrado en tu cuenta.');
          return;
        }

        const amount = parseAmount(model.amount) ?? 0;
        const expense = target.expense ?? null;
        await this.api.recordSettlement(
          target.groupId,
          { fromUserId: target.fromUserId, toUserId: target.toUserId, amount, accountId, categoryId, expenseId: expense?.id ?? null },
          this.idempotencyKey,
        );
        const money = formatMoney(amount, target.currency);
        const of = expense ? ` de «${expense.description}»` : '';
        this.saved.emit(target.iPay ? `Pagaste ${money}${of} a ${target.otherName}.` : `Cobro de ${money}${of} de ${target.otherName} registrado.`);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
