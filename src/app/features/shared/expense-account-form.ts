import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Account, Category, SharedExpense } from '../../core/api/api-types';
import { isManagedAccount } from '../../core/api/managed-accounts';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { AccountPicker, accountGroups } from '../../shared/ui/account-picker';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney } from '../../shared/ui/money';
import { SharedApi } from './shared-api';

/** An expense the person paid and did not put in one of their accounts when registering it. */
export interface ExpenseAccountFormTarget {
  readonly groupId: string;
  readonly currency: string;
  readonly expense: SharedExpense;
  readonly categories: readonly Category[];
}

const REQUIRED = { kind: 'required', message: 'Este dato es necesario.' };

/** Puts the whole expense in one of the person's accounts; what the others repay then takes away from it. */
@Component({
  selector: 'app-expense-account-form',
  imports: [AccountPicker, Dialog, Field, FormField],
  template: `
    <app-dialog title="Registrar en mi cuenta" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <p class="form-note">
          Pagaste <strong>{{ total() }}</strong> por «{{ target().expense.description }}». Regístralo en tu cuenta como un gasto tuyo. Lo que te devuelvan lo
          irá restando.
        </p>
        @if (usable().length === 0) {
          <p class="form-note">No tienes cuentas en {{ target().currency }}. Crea una en Cuentas para registrar este gasto.</p>
        } @else {
          <app-field label="Cuenta" [state]="accountForm.accountId()">
            <app-account-picker label="Cuenta" [groups]="accountGroups()" [formField]="accountForm.accountId" />
          </app-field>
            <app-field label="Categoría" [state]="accountForm.categoryId()">
              <select class="input" [formField]="accountForm.categoryId">
                <option value="">Elige una categoría</option>
                @for (option of categoryOptions(); track option.id) {
                  <option [value]="option.id">{{ option.label }}</option>
                }
              </select>
            </app-field>
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          @if (usable().length > 0) {
            <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Registrar' }}</button>
          }
        </div>
      </form>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseAccountForm {
  private readonly api = inject(SharedApi);

  // Created with the form, so sending it twice registers the expense once.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<ExpenseAccountFormTarget>();
  /** The person's accounts, bound live: a balance that changes while the dialog is open shows here. */
  readonly accounts = input.required<readonly Account[]>();

  /** Emits the message to show once it is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly total = computed(() => formatMoney(this.target().expense.totalAmount, this.target().currency));

  /** The accounts that can take it: in the currency of the group and not the fund of a goal. */
  protected readonly usable = computed(() =>
    this.accounts().filter((account) => !account.isArchived && account.currency === this.target().currency && !isManagedAccount(account.type)),
  );
  protected readonly accountGroups = computed(() => accountGroups(this.usable()));
  protected readonly categoryOptions = computed(() =>
    this.target()
      .categories.filter((category) => !category.isArchived && category.kind === 'expense')
      .flatMap((category) => [
        { id: category.id, label: category.name },
        ...category.subcategories.filter((subcategory) => !subcategory.isArchived).map((subcategory) => ({ id: subcategory.id, label: `${category.name} / ${subcategory.name}` })),
      ]),
  );

  protected readonly model = linkedSignal(() => ({ accountId: '', categoryId: '' }));
  protected readonly accountForm = form(this.model, (path) => {
    validate(path.accountId, ({ value }) => (value() ? undefined : REQUIRED));
    validate(path.categoryId, ({ value }) => (value() ? undefined : REQUIRED));
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected save(): void {
    void submit(this.accountForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const { groupId, expense } = this.target();
        const model = this.model();
        await this.api.linkExpenseAccount(groupId, expense.id, model.accountId, model.categoryId, this.idempotencyKey);
        this.saved.emit(`«${expense.description}» registrado en tu cuenta como gasto.`);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
