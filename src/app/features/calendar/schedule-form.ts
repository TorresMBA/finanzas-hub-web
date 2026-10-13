import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Account, Category } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { parseAmount } from '../../shared/ui/money';
import { CalendarApi, FREQUENCY_LABELS, REMINDER_OPTIONS } from './calendar-api';

/** What the dialog needs: where the money can come from or go to, how to classify it, and the day it opens on. */
export interface ScheduleFormTarget {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly date: string;
}

const REQUIRED = { kind: 'required', message: 'Este dato es necesario.' };

/**
 * Schedules an income or an expense for a day: once, every month or every year. It becomes a movement on its
 * date, by itself or when the person confirms it.
 */
@Component({
  selector: 'app-schedule-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog title="Programar movimiento" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <div class="segmented segmented--block" role="group" aria-label="Tipo de movimiento">
          <button type="button" [attr.aria-pressed]="model().type === 'expense'" (click)="setType('expense')">Gasto</button>
          <button type="button" [attr.aria-pressed]="model().type === 'income'" (click)="setType('income')">Ingreso</button>
        </div>
        <app-field label="Descripción" [state]="scheduleForm.description()">
          <input class="input" type="text" placeholder="ej. Alquiler" [formField]="scheduleForm.description" />
        </app-field>
        <div class="form-pair">
          <app-field [label]="'Monto' + (currency() ? ' (' + currency() + ')' : '')" [state]="scheduleForm.amount()">
            <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="scheduleForm.amount" />
          </app-field>
          <app-field label="Fecha" [state]="scheduleForm.date()">
            <input class="input" type="date" [formField]="scheduleForm.date" />
          </app-field>
        </div>
        <div class="form-pair">
          <app-field label="Cuenta" [state]="scheduleForm.accountId()">
            <select class="input" [formField]="scheduleForm.accountId">
              <option value="">Elige una cuenta</option>
              @for (account of target().accounts; track account.id) {
                <option [value]="account.id">{{ account.name }}</option>
              }
            </select>
          </app-field>
          <app-field label="Categoría" [state]="scheduleForm.categoryId()">
            <select class="input" [formField]="scheduleForm.categoryId">
              <option value="">Elige una categoría</option>
              @for (option of categoryOptions(); track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
          </app-field>
        </div>
        <div class="form-pair">
          <app-field label="Se repite">
            <select class="input" [formField]="scheduleForm.frequency">
              @for (option of frequencies; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </app-field>
          <app-field label="Recordatorio">
            <select class="input" [formField]="scheduleForm.reminder">
              @for (option of reminders; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </app-field>
        </div>
        <label class="form-check">
          <input type="checkbox" [formField]="scheduleForm.automatic" />
          <span>Registrarlo solo en su fecha. Sin marcar, espera a que lo confirmes, por si el monto cambia.</span>
        </label>
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Programar' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleForm {
  private readonly api = inject(CalendarApi);

  readonly target = input.required<ScheduleFormTarget>();

  /** Emits the message to show once the movement is scheduled. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly reminders = REMINDER_OPTIONS;
  protected readonly frequencies = (['once', 'monthly', 'yearly'] as const).map((value) => ({ value, label: FREQUENCY_LABELS[value] }));

  protected readonly model = linkedSignal(() => ({
    type: 'expense' as 'expense' | 'income',
    description: '',
    amount: '',
    date: this.target().date,
    accountId: this.target().accounts.length === 1 ? this.target().accounts[0].id : '',
    categoryId: '',
    frequency: 'monthly' as 'once' | 'monthly' | 'yearly',
    reminder: '1',
    automatic: true,
  }));
  protected readonly scheduleForm = form(this.model, (path) => {
    validate(path.description, ({ value }) => (value().trim() ? undefined : REQUIRED));
    validate(path.amount, ({ value }) => ((parseAmount(value()) ?? 0) > 0 ? undefined : { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' }));
    validate(path.date, ({ value }) => (value() ? undefined : REQUIRED));
    validate(path.accountId, ({ value }) => (value() ? undefined : REQUIRED));
    validate(path.categoryId, ({ value }) => (value() ? undefined : REQUIRED));
  });

  protected readonly currency = computed(() => this.target().accounts.find((account) => account.id === this.model().accountId)?.currency ?? '');

  /** The categories of the chosen kind, each followed by its subcategories. */
  protected readonly categoryOptions = computed(() =>
    this.target()
      .categories.filter((category) => category.kind === this.model().type && !category.isArchived)
      .flatMap((category) => [
        { id: category.id, label: category.name },
        ...category.subcategories.filter((subcategory) => !subcategory.isArchived).map((subcategory) => ({ id: subcategory.id, label: `${category.name} / ${subcategory.name}` })),
      ]),
  );

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected setType(type: 'expense' | 'income'): void {
    // A category of the other kind no longer applies.
    this.model.update((model) => ({ ...model, type, categoryId: '' }));
  }

  protected save(): void {
    void submit(this.scheduleForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const model = this.model();
        const rule = await this.api.create({
          type: model.type,
          accountId: model.accountId,
          categoryId: model.categoryId,
          amount: parseAmount(model.amount) ?? 0,
          description: model.description.trim(),
          frequency: model.frequency,
          startsOn: model.date,
          postingMode: model.automatic ? 'automatic' : 'confirm',
          reminderDaysBefore: model.reminder === '' ? null : Number(model.reminder),
        });
        this.saved.emit(`«${rule.description}» programado: ${FREQUENCY_LABELS[rule.frequency].toLowerCase()}.`);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
