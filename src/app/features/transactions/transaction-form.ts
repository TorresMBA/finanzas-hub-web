import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Account, Category, Transaction, TransactionType } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { sameDayNextMonth, todayIso } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { isValidTag, parseTags } from '../../shared/ui/tags';
import { TransactionsApi } from './transactions-api';

/** What the form is for: a new movement, optionally on a given account, or an income or expense being edited. */
export type TransactionFormTarget =
  | { readonly mode: 'post'; readonly accountId?: string }
  | { readonly mode: 'edit'; readonly transaction: Transaction };

/** A transfer is registered from the same form, as one more type; it is not a transaction with a category. */
type FormType = TransactionType | 'transfer';

interface TransactionFormModel {
  type: FormType;
  amount: string;
  description: string;
  categoryId: string;
  /** The account of the income or expense; the origin of a transfer. */
  accountId: string;
  toAccountId: string;
  /** What arrives, when the destination of a transfer has another currency. */
  destinationAmount: string;
  date: string;
  tags: string;
  pending: boolean;
  /** Also schedule it for the same day of every month from the next one on. */
  repeat: boolean;
  merchant: string;
  note: string;
}

const TYPES: readonly { value: FormType; label: string }[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'transfer', label: 'Transferencia' },
];

const AMOUNT_ERROR = { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' };

/** The dialog that registers an income, an expense or a transfer, or edits one of the first two. It saves by itself and reports what it did. */
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
          @for (type of types(); track type.value) {
            <button type="button" [attr.aria-pressed]="model().type === type.value" (click)="chooseType(type.value)">{{ type.label }}</button>
          }
        </div>
        <div class="form-pair">
          <app-field [label]="'Monto' + (currency() ? ' (' + currency() + ')' : '')" [state]="transactionForm.amount()">
            <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="transactionForm.amount" />
          </app-field>
          <app-field label="Fecha" [state]="transactionForm.date()">
            <input class="input" type="date" [formField]="transactionForm.date" />
          </app-field>
        </div>
        @if (isTransfer()) {
          <p class="form-note">Mueve dinero entre dos cuentas tuyas. No es un ingreso ni un gasto, y tu patrimonio no cambia.</p>
          <div class="form-pair">
            <app-field label="Desde" [state]="transactionForm.accountId()">
              <select class="input" [formField]="transactionForm.accountId">
                <option value="">Elige una cuenta</option>
                @for (account of accountOptions(); track account.id) {
                  <option [value]="account.id">{{ account.name }} · {{ account.currency }}</option>
                }
              </select>
            </app-field>
            <app-field label="Hacia" [state]="transactionForm.toAccountId()">
              <select class="input" [formField]="transactionForm.toAccountId">
                <option value="">Elige una cuenta</option>
                @for (account of accountOptions(); track account.id) {
                  <option [value]="account.id">{{ account.name }} · {{ account.currency }}</option>
                }
              </select>
            </app-field>
          </div>
          @if (destinationCurrency(); as arriving) {
            <app-field
              [label]="'Llega a la cuenta (' + arriving + ')'"
              hint="Las cuentas tienen monedas distintas: escribe cuánto llegó, como figura en tu banco."
              [state]="transactionForm.destinationAmount()"
            >
              <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="transactionForm.destinationAmount" />
            </app-field>
          }
          <app-field label="Descripción (opcional)" [state]="transactionForm.description()">
            <input class="input" type="text" placeholder="Transferencia" [formField]="transactionForm.description" />
          </app-field>
        } @else {
          <app-field label="Descripción" [state]="transactionForm.description()">
            <input class="input" type="text" placeholder="ej. Compra de la semana" [formField]="transactionForm.description" />
          </app-field>
          <div class="form-pair">
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
        }
        <app-field label="Nota (opcional)" [state]="transactionForm.note()">
          <input class="input" type="text" [formField]="transactionForm.note" />
        </app-field>
        @if (target().mode === 'post' && !isTransfer()) {
          <label class="form-check">
            <input type="checkbox" [formField]="transactionForm.pending" />
            <span>Marcar como pendiente de revisar. Cuenta en el saldo igual.</span>
          </label>
          <label class="form-check">
            <input type="checkbox" [formField]="transactionForm.repeat" />
            <span>Repetir cada mes. Se registrará solo ese mismo día, desde el mes que viene; lo ves y lo detienes en el Calendario.</span>
          </label>
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : target().mode === 'post' ? 'Registrar' : 'Guardar' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionForm {
  private readonly api = inject(TransactionsApi);
  private readonly today = inject(TODAY);

  // One key for the life of this dialog: a second click or a retry repeats the request instead of the effect.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<TransactionFormTarget>();
  readonly accounts = input.required<readonly Account[]>();
  readonly categories = input.required<readonly Category[]>();

  /** Emits the message to show once the movement is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  /** A transfer cannot be edited, so an income or expense being edited cannot become one either. */
  protected readonly types = computed(() => (this.target().mode === 'post' ? TYPES : TYPES.filter((type) => type.value !== 'transfer')));

  protected readonly model = linkedSignal<TransactionFormModel>(() => this.initialModel());
  protected readonly isTransfer = computed(() => this.model().type === 'transfer');

  protected readonly transactionForm = form(this.model, (path) => {
    validate(path.amount, ({ value }) => {
      if (value().trim() === '') {
        return { kind: 'required', message: 'Escribe el monto.' };
      }

      return (parseAmount(value()) ?? 0) > 0 ? undefined : AMOUNT_ERROR;
    });
    required(path.date, { message: 'Elige una fecha.' });
    validate(path.description, ({ value }) => (!this.isTransfer() && value().trim() === '' ? { kind: 'required', message: 'Escribe una descripción.' } : undefined));
    maxLength(path.description, 120, { message: 'Máximo 120 caracteres.' });
    validate(path.categoryId, ({ value }) => (!this.isTransfer() && value() === '' ? { kind: 'required', message: 'Elige una categoría.' } : undefined));
    required(path.accountId, { message: 'Elige una cuenta.' });
    validate(path.toAccountId, ({ value }) => {
      if (!this.isTransfer()) {
        return undefined;
      }

      if (value() === '') {
        return { kind: 'required', message: 'Elige la cuenta que recibe.' };
      }

      return value() === this.model().accountId ? { kind: 'sameAccount', message: 'Elige una cuenta distinta de la de origen.' } : undefined;
    });
    validate(path.destinationAmount, ({ value }) => (this.destinationCurrency() && !((parseAmount(value()) ?? 0) > 0) ? AMOUNT_ERROR : undefined));
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
    // The fund of a goal only moves from the goal.
    return this.accounts().filter((account) => account.type !== 'goalFund' && (!account.isArchived || account.id === current));
  });

  protected readonly currency = computed(() => this.currencyOf(this.model().accountId));

  /** The currency of the receiving account when it is not the one that leaves: then both amounts are asked. */
  protected readonly destinationCurrency = computed(() => {
    const arriving = this.isTransfer() ? this.currencyOf(this.model().toAccountId) : '';
    return arriving !== '' && this.currency() !== '' && arriving !== this.currency() ? arriving : null;
  });

  constructor() {
    // With a single account there is nothing to choose. The accounts may arrive after the dialog opened, so
    // this fills the one field without touching what the person already typed in the others.
    effect(() => {
      const open = this.accounts().filter((account) => !account.isArchived && account.type !== 'goalFund');
      untracked(() => {
        if (this.target().mode === 'post' && this.model().accountId === '' && open.length === 1) {
          this.model.update((model) => ({ ...model, accountId: open[0].id }));
        }
      });
    });
  }

  /** The categories offered depend on the type, so changing it asks for the category again. */
  protected chooseType(type: FormType): void {
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
    const amount = parseAmount(value.amount) ?? 0;
    const note = value.note.trim() || null;
    if (value.type === 'transfer') {
      const transfer = await this.api.transfer(
        {
          fromAccountId: value.accountId,
          toAccountId: value.toAccountId,
          amount,
          destinationAmount: this.destinationCurrency() ? parseAmount(value.destinationAmount) : null,
          occurredOn: value.date,
          description: value.description.trim() || null,
          note,
        },
        this.idempotencyKey,
      );
      return `Transferencia de ${formatMoney(transfer.amount, transfer.currency)} registrada.`;
    }

    const body = {
      type: value.type,
      accountId: value.accountId,
      amount,
      categoryId: value.categoryId,
      occurredOn: value.date,
      description: value.description.trim(),
      merchant: value.merchant.trim() || null,
      note,
      tags: parseTags(value.tags),
    };
    if (target.mode === 'edit') {
      await this.api.edit(target.transaction.id, body);
      return `«${body.description}» guardado.`;
    }

    const posted = await this.api.post(body, value.pending, this.idempotencyKey);
    const done = `${value.type === 'income' ? 'Ingreso' : 'Gasto'} de ${formatMoney(posted.amount, posted.currency)} registrado`;
    if (!value.repeat) {
      return `${done}.`;
    }

    // The movement is already in the ledger: failing to schedule the next ones must not look like it was lost.
    try {
      await this.api.repeatMonthly(body, sameDayNextMonth(value.date));
      return `${done}. Se repetirá cada mes.`;
    } catch {
      return `${done}, pero no se pudo programar su repetición. Prográmalo desde el Calendario.`;
    }
  }

  private currencyOf(accountId: string): string {
    return this.accounts().find((account) => account.id === accountId)?.currency ?? '';
  }

  private initialModel(): TransactionFormModel {
    const target = this.target();
    const blank = { toAccountId: '', destinationAmount: '' };
    if (target.mode === 'edit') {
      const transaction = target.transaction;
      return {
        ...blank,
        type: transaction.kind === 'income' ? 'income' : 'expense',
        amount: Number(transaction.amount).toFixed(2),
        description: transaction.description,
        categoryId: transaction.category?.id ?? '',
        accountId: transaction.accountId,
        date: transaction.occurredOn,
        tags: transaction.tags.join(', '),
        pending: transaction.status === 'pending',
        repeat: false,
        merchant: transaction.merchant ?? '',
        note: transaction.note ?? '',
      };
    }

    return {
      ...blank, type: 'expense', amount: '', description: '', categoryId: '', accountId: target.accountId ?? '', date: todayIso(this.today()), tags: '', pending: false, repeat: false, merchant: '', note: '',
    };
  }
}
