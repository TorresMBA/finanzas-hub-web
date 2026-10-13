import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Account, Category, Transaction, TransactionType } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { todayIso } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { isValidTag, parseTags } from '../../shared/ui/tags';
import { TransactionsApi } from './transactions-api';

/** What the form is for: a new transaction, optionally on a given account, or one being edited. */
export type TransactionFormTarget =
  | { readonly mode: 'post'; readonly accountId?: string }
  | { readonly mode: 'edit'; readonly transaction: Transaction };

interface TransactionFormModel {
  type: TransactionType;
  amount: string;
  description: string;
  categoryId: string;
  accountId: string;
  date: string;
  tags: string;
  pending: boolean;
  merchant: string;
  note: string;
}

const TYPES: readonly { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
];

/** The dialog that registers or edits an income or an expense. It saves by itself and reports what it did. */
@Component({
  selector: 'app-transaction-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog [title]="target().mode === 'post' ? 'Nueva transacción' : 'Editar transacción'" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <div class="segmented segmented--block" role="group" aria-label="Tipo">
          @for (type of types; track type.value) {
            <button type="button" [attr.aria-pressed]="model().type === type.value" (click)="chooseType(type.value)">{{ type.label }}</button>
          }
        </div>
        <div class="pair">
          <app-field [label]="'Monto' + (currency() ? ' (' + currency() + ')' : '')" [state]="transactionForm.amount()">
            <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="transactionForm.amount" />
          </app-field>
          <app-field label="Fecha" [state]="transactionForm.date()">
            <input class="input" type="date" [formField]="transactionForm.date" />
          </app-field>
        </div>
        <app-field label="Descripción" [state]="transactionForm.description()">
          <input class="input" type="text" placeholder="ej. Compra de la semana" [formField]="transactionForm.description" />
        </app-field>
        <div class="pair">
          <app-field label="Categoría" [state]="transactionForm.categoryId()">
            <select class="input" [formField]="transactionForm.categoryId" (change)="suggestTags()">
              <option value="">Elige una categoría</option>
              @for (option of categoryOptions(); track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
          </app-field>
          <app-field label="Cuenta" [state]="transactionForm.accountId()">
            <select class="input" [formField]="transactionForm.accountId">
              <option value="">Elige una cuenta</option>
              @for (account of accountOptions(); track account.id) {
                <option [value]="account.id">{{ account.name }} · {{ account.currency }}</option>
              }
            </select>
          </app-field>
        </div>
        <app-field label="Etiquetas (opcional)" hint="Separadas por coma. Al elegir la categoría se proponen las suyas." [state]="transactionForm.tags()">
          <input class="input" type="text" [formField]="transactionForm.tags" />
        </app-field>
        <app-field label="Comercio (opcional)" [state]="transactionForm.merchant()">
          <input class="input" type="text" [formField]="transactionForm.merchant" />
        </app-field>
        <app-field label="Nota (opcional)" [state]="transactionForm.note()">
          <input class="input" type="text" [formField]="transactionForm.note" />
        </app-field>
        @if (target().mode === 'post') {
          <label class="check">
            <input type="checkbox" [formField]="transactionForm.pending" />
            <span>Marcar como pendiente de revisar. Cuenta en el saldo igual.</span>
          </label>
        }
        <div class="actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : target().mode === 'post' ? 'Registrar' : 'Guardar' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: `
    .pair {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .check {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 13px;
      color: var(--tx2);

      input {
        margin-top: 2px;
        accent-color: var(--ac);
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
export class TransactionForm {
  private readonly api = inject(TransactionsApi);

  // One key for the life of this dialog: a second click or a retry repeats the request instead of the effect.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<TransactionFormTarget>();
  readonly accounts = input.required<readonly Account[]>();
  readonly categories = input.required<readonly Category[]>();

  /** Emits the message to show once the transaction is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly types = TYPES;

  protected readonly model = linkedSignal<TransactionFormModel>(() => this.initialModel());
  protected readonly transactionForm = form(this.model, (path) => {
    validate(path.amount, ({ value }) => {
      const amount = parseAmount(value());
      if (value().trim() === '') {
        return { kind: 'required', message: 'Escribe el monto.' };
      }

      return amount === null || amount <= 0 ? { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' } : undefined;
    });
    required(path.date, { message: 'Elige una fecha.' });
    validate(path.description, ({ value }) => (value().trim() === '' ? { kind: 'required', message: 'Escribe una descripción.' } : undefined));
    maxLength(path.description, 120, { message: 'Máximo 120 caracteres.' });
    required(path.categoryId, { message: 'Elige una categoría.' });
    required(path.accountId, { message: 'Elige una cuenta.' });
    validate(path.tags, ({ value }) => {
      const tags = parseTags(value());
      if (tags.length > 10) {
        return { kind: 'tooManyTags', message: 'Máximo 10 etiquetas.' };
      }

      return tags.every(isValidTag) ? undefined : { kind: 'tagName', message: 'Cada etiqueta tiene hasta 40 letras, números o guiones.' };
    });
    maxLength(path.merchant, 80, { message: 'Máximo 80 caracteres.' });
    maxLength(path.note, 500, { message: 'Máximo 500 caracteres.' });
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** The categories of the chosen type and their subcategories, plus the one the transaction already has. */
  protected readonly categoryOptions = computed(() => {
    const target = this.target();
    const current = target.mode === 'edit' ? target.transaction.category?.id : undefined;
    return this.categories()
      .filter((category) => category.kind === this.model().type)
      .flatMap((category) => [
        { id: category.id, label: category.name, archived: category.isArchived },
        ...category.subcategories.map((subcategory) => ({
          id: subcategory.id,
          label: `${category.name} › ${subcategory.name}`,
          archived: category.isArchived || subcategory.isArchived,
        })),
      ])
      .filter((option) => !option.archived || option.id === current);
  });

  protected readonly accountOptions = computed(() => {
    const target = this.target();
    const current = target.mode === 'edit' ? target.transaction.accountId : undefined;
    return this.accounts().filter((account) => !account.isArchived || account.id === current);
  });

  protected readonly currency = computed(() => this.accounts().find((account) => account.id === this.model().accountId)?.currency ?? '');

  constructor() {
    // With a single account there is nothing to choose. The accounts may arrive after the dialog opened, so
    // this fills the one field without touching what the person already typed in the others.
    effect(() => {
      const open = this.accounts().filter((account) => !account.isArchived);
      untracked(() => {
        if (this.target().mode === 'post' && this.model().accountId === '' && open.length === 1) {
          this.model.update((model) => ({ ...model, accountId: open[0].id }));
        }
      });
    });
  }

  /** The categories offered depend on the type, so changing it asks for the category again. */
  protected chooseType(type: TransactionType): void {
    if (type !== this.model().type) {
      this.model.update((model) => ({ ...model, type, categoryId: '' }));
    }
  }

  /** Proposes the tags the category suggests, unless the person already wrote their own. */
  protected suggestTags(): void {
    const { categoryId, tags } = this.model();
    const category = this.categories().find(
      (candidate) => candidate.id === categoryId || candidate.subcategories.some((subcategory) => subcategory.id === categoryId),
    );
    if (category && tags.trim() === '') {
      this.model.update((model) => ({ ...model, tags: category.tags.join(', ') }));
    }
  }

  protected save(): void {
    void submit(this.transactionForm, async () => {
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
    const value = this.model();
    const body = {
      type: value.type,
      accountId: value.accountId,
      amount: parseAmount(value.amount) ?? 0,
      categoryId: value.categoryId,
      occurredOn: value.date,
      description: value.description.trim(),
      merchant: value.merchant.trim() || null,
      note: value.note.trim() || null,
      tags: parseTags(value.tags),
    };
    if (target.mode === 'edit') {
      await this.api.edit(target.transaction.id, body);
      return `«${body.description}» guardado.`;
    }

    const posted = await this.api.post(body, value.pending, this.idempotencyKey);
    return `${value.type === 'income' ? 'Ingreso' : 'Gasto'} de ${formatMoney(posted.amount, posted.currency)} registrado.`;
  }

  private initialModel(): TransactionFormModel {
    const target = this.target();
    if (target.mode === 'edit') {
      const transaction = target.transaction;
      return {
        type: transaction.kind === 'income' ? 'income' : 'expense',
        amount: Number(transaction.amount).toFixed(2),
        description: transaction.description,
        categoryId: transaction.category?.id ?? '',
        accountId: transaction.accountId,
        date: transaction.occurredOn,
        tags: transaction.tags.join(', '),
        pending: transaction.status === 'pending',
        merchant: transaction.merchant ?? '',
        note: transaction.note ?? '',
      };
    }

    return {
      type: 'expense', amount: '', description: '', categoryId: '', accountId: target.accountId ?? '', date: todayIso(), tags: '', pending: false, merchant: '', note: '',
    };
  }
}
