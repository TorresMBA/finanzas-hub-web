import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Account, Category, SharedGroupDetail, SplitType } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { todayIso } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { SPLIT_TYPES, SharedApi, previewSplit } from './shared-api';

/** What the dialog needs: the group, and the accounts and categories of the person in case they paid. */
export interface ExpenseFormTarget {
  readonly detail: SharedGroupDetail;
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
}

const REQUIRED = { kind: 'required', message: 'Este dato es necesario.' };

/**
 * Registers what one member paid for several and how it is divided. When the person paid it themselves they
 * can put the whole expense in one of their accounts at the same time; nobody does that for someone else.
 */
@Component({
  selector: 'app-expense-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog title="Nuevo gasto compartido" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <app-field label="Descripción" [state]="expenseForm.description()">
          <input class="input" type="text" placeholder="ej. Cena" [formField]="expenseForm.description" />
        </app-field>
        <div class="form-pair">
          <app-field [label]="'Monto total (' + currency() + ')'" [state]="expenseForm.total()">
            <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="expenseForm.total" />
          </app-field>
          <app-field label="Fecha" [state]="expenseForm.date()">
            <input class="input" type="date" [formField]="expenseForm.date" />
          </app-field>
        </div>
        <app-field label="Quién pagó">
          <select class="input" [formField]="expenseForm.paidBy">
            @for (member of members(); track member.userId) {
              <option [value]="member.userId">{{ member.displayName }}{{ member.isMe ? ' (tú)' : '' }}</option>
            }
          </select>
        </app-field>

        <div class="segmented segmented--block" role="group" aria-label="Cómo dividir">
          @for (option of splitTypes; track option.value) {
            <button type="button" [attr.aria-pressed]="splitType() === option.value" (click)="splitType.set(option.value)">{{ option.label }}</button>
          }
        </div>
        <ul class="parts" aria-label="Quiénes participan">
          @for (row of rows(); track row.userId) {
            <li>
              <label class="form-check">
                <input type="checkbox" [checked]="row.included" (change)="toggle(row.userId)" />
                <span>{{ row.displayName }}</span>
              </label>
              @if (row.included && splitType() !== 'equal') {
                <input
                  class="input value"
                  type="text"
                  inputmode="decimal"
                  [attr.aria-label]="unit() + ' de ' + row.displayName"
                  [value]="row.value"
                  (input)="setValue(row.userId, $any($event.target).value)"
                />
              }
              <strong class="tabular">{{ row.part }}</strong>
            </li>
          }
        </ul>
        @if (splitProblem(); as text) {
          <p class="form-note is-negative" role="status">{{ text }}</p>
        }

        @if (iPaid() && target().accounts.length > 0) {
          <label class="form-check">
            <input type="checkbox" [formField]="expenseForm.toLedger" />
            <span>Registrar también el gasto completo en una de mis cuentas. Lo que te devuelvan lo irá restando.</span>
          </label>
          @if (model().toLedger) {
            <div class="form-pair">
              <app-field label="Cuenta" [state]="expenseForm.accountId()">
                <select class="input" [formField]="expenseForm.accountId">
                  <option value="">Elige una cuenta</option>
                  @for (account of target().accounts; track account.id) {
                    <option [value]="account.id">{{ account.name }}</option>
                  }
                </select>
              </app-field>
              <app-field label="Categoría" [state]="expenseForm.categoryId()">
                <select class="input" [formField]="expenseForm.categoryId">
                  <option value="">Elige una categoría</option>
                  @for (option of categoryOptions(); track option.id) {
                    <option [value]="option.id">{{ option.label }}</option>
                  }
                </select>
              </app-field>
            </div>
          }
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Registrar gasto' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: `
    .parts {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .parts li {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .parts label {
      flex: 1;
    }
    .value {
      width: 84px;
      height: 34px;
    }
    .is-negative {
      color: var(--rd);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseForm {
  private readonly api = inject(SharedApi);
  private readonly today = inject(TODAY);

  // Created with the form, so sending it twice registers the expense once.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<ExpenseFormTarget>();

  /** Emits the message to show once the expense is registered. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly splitTypes = SPLIT_TYPES;
  protected readonly members = computed(() => this.target().detail.members);
  protected readonly currency = computed(() => this.target().detail.group.currency);

  protected readonly splitType = signal<SplitType>('equal');
  // Who takes part, and what each one typed for the kind of split chosen. Everyone is in to start with.
  private readonly excluded = signal<ReadonlySet<string>>(new Set());
  private readonly values = signal<Readonly<Record<string, string>>>({});

  protected readonly model = linkedSignal(() => ({
    description: '',
    total: '',
    date: todayIso(this.today()),
    paidBy: this.members().find((member) => member.isMe)?.userId ?? this.members()[0]?.userId ?? '',
    toLedger: false,
    accountId: '',
    categoryId: '',
  }));
  protected readonly expenseForm = form(this.model, (path) => {
    validate(path.description, ({ value }) => (value().trim() ? undefined : REQUIRED));
    validate(path.total, ({ value }) => ((parseAmount(value()) ?? 0) > 0 ? undefined : { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' }));
    validate(path.date, ({ value }) => (value() ? undefined : REQUIRED));
    validate(path.accountId, ({ value, valueOf }) => (!valueOf(path.toLedger) || value() ? undefined : REQUIRED));
    validate(path.categoryId, ({ value, valueOf }) => (!valueOf(path.toLedger) || value() ? undefined : REQUIRED));
  });

  protected readonly iPaid = computed(() => this.members().some((member) => member.isMe && member.userId === this.model().paidBy));
  protected readonly unit = computed(() => SPLIT_TYPES.find((type) => type.value === this.splitType())?.label ?? '');

  private readonly participants = computed(() => this.members().filter((member) => !this.excluded().has(member.userId)));
  private readonly preview = computed(() =>
    previewSplit(
      parseAmount(this.model().total) ?? 0,
      this.splitType(),
      this.participants().map((member) => Number((this.values()[member.userId] ?? '').replace(',', '.')) || 0),
    ),
  );

  /** One row per member of the group: whether they take part, what they typed and what they would pay. */
  protected readonly rows = computed(() => {
    const preview = this.preview();
    const participants = this.participants();
    return this.members().map((member) => {
      const index = participants.findIndex((participant) => participant.userId === member.userId);
      return {
        userId: member.userId,
        displayName: member.displayName + (member.isMe ? ' (tú)' : ''),
        included: index >= 0,
        value: this.values()[member.userId] ?? '',
        part: index >= 0 && preview ? formatMoney(preview[index], this.currency()) : '—',
      };
    });
  });

  protected readonly splitProblem = computed(() => {
    if (this.participants().length === 0) {
      return 'Elige al menos a una persona.';
    }

    if (this.preview() !== null || !((parseAmount(this.model().total) ?? 0) > 0)) {
      return null;
    }

    return { equal: null, percentage: 'Los porcentajes deben sumar 100.', fixedAmount: 'Los montos deben sumar el total.', shares: 'Cada quien necesita al menos una parte.' }[
      this.splitType()
    ];
  });

  protected readonly categoryOptions = computed(() =>
    this.target()
      .categories.filter((category) => !category.isArchived)
      .flatMap((category) => [
        { id: category.id, label: category.name },
        ...category.subcategories.filter((subcategory) => !subcategory.isArchived).map((subcategory) => ({ id: subcategory.id, label: `${category.name} / ${subcategory.name}` })),
      ]),
  );

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected toggle(userId: string): void {
    this.excluded.update((excluded) => {
      const next = new Set(excluded);
      return next.delete(userId) ? next : next.add(userId);
    });
  }

  protected setValue(userId: string, value: string): void {
    this.values.update((values) => ({ ...values, [userId]: value }));
  }

  protected save(): void {
    void submit(this.expenseForm, async () => {
      if (this.preview() === null) {
        this.failure.set(this.splitProblem() ?? 'Revisa cómo se divide el gasto.');
        return;
      }

      this.busy.set(true);
      this.failure.set(null);
      try {
        const model = this.model();
        const type = this.splitType();
        const toLedger = this.iPaid() && model.toLedger;
        const total = parseAmount(model.total) ?? 0;
        await this.api.createExpense(
          this.target().detail.group.id,
          {
            description: model.description.trim(),
            totalAmount: total,
            paidByUserId: model.paidBy,
            occurredOn: model.date,
            splitType: type,
            participants: this.participants().map((member) => ({
              userId: member.userId,
              value: type === 'equal' ? null : Number((this.values()[member.userId] ?? '').replace(',', '.')) || 0,
            })),
            accountId: toLedger ? model.accountId : null,
            categoryId: toLedger ? model.categoryId : null,
          },
          this.idempotencyKey,
        );
        this.saved.emit(`«${model.description.trim()}» de ${formatMoney(total, this.currency())} registrado y dividido.`);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
