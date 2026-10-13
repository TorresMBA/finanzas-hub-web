import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Budget, Category } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { ALERT_THRESHOLDS, BudgetsApi } from './budgets-api';

/** A new budget on one of the categories that still has none, or a change to an existing one. */
export type BudgetFormTarget =
  | { readonly mode: 'create'; readonly categories: readonly Category[]; readonly currency: string }
  | { readonly mode: 'adjust'; readonly budget: Budget };

/**
 * Sets or changes the monthly limit of a category. Either way it applies from the current month on: the
 * months already gone keep the limit they had.
 */
@Component({
  selector: 'app-budget-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog [title]="title()" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (target().mode === 'create') {
          <app-field label="Categoría" hint="Sus subcategorías cuentan dentro del mismo límite." [state]="budgetForm.categoryId()">
            <select class="input" [formField]="budgetForm.categoryId">
              @for (category of categories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </app-field>
        }
        <div class="form-pair">
          <app-field [label]="'Límite mensual (' + currency() + ')'" [state]="budgetForm.amount()">
            <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="budgetForm.amount" />
          </app-field>
          <app-field label="Avisarme al">
            <select class="input" [formField]="budgetForm.threshold">
              @for (threshold of thresholds; track threshold) {
                <option [value]="threshold">{{ threshold }} %</option>
              }
            </select>
          </app-field>
        </div>
        <label class="form-check">
          <input type="checkbox" [formField]="budgetForm.isFixed" />
          <span>Es un pago fijo, como el alquiler. Se muestra como pagado o por pagar, sin medir el ritmo.</span>
        </label>
        <p class="form-note">Vale desde este mes. Los meses anteriores conservan el límite que tenían.</p>
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : action() }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetForm {
  private readonly api = inject(BudgetsApi);

  readonly target = input.required<BudgetFormTarget>();

  /** Emits the message to show once the budget is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly thresholds = ALERT_THRESHOLDS;

  protected readonly categories = computed(() => {
    const target = this.target();
    return target.mode === 'create' ? target.categories : [];
  });
  protected readonly currency = computed(() => {
    const target = this.target();
    return target.mode === 'create' ? target.currency : target.budget.currency;
  });
  protected readonly title = computed(() => {
    const target = this.target();
    return target.mode === 'create' ? 'Nuevo presupuesto' : `Ajustar «${target.budget.categoryName}»`;
  });
  protected readonly action = computed(() => (this.target().mode === 'create' ? 'Crear presupuesto' : 'Guardar'));

  protected readonly model = linkedSignal(() => {
    const target = this.target();
    return target.mode === 'create'
      ? { categoryId: target.categories[0]?.id ?? '', amount: '', threshold: '90', isFixed: false }
      : {
          categoryId: target.budget.categoryId,
          amount: Number(target.budget.limit).toFixed(2),
          threshold: String(target.budget.alertThresholdPercent),
          isFixed: target.budget.isFixed,
        };
  });
  protected readonly budgetForm = form(this.model, (path) => {
    validate(path.categoryId, ({ value }) => (value() ? undefined : { kind: 'category', message: 'Elige una categoría.' }));
    validate(path.amount, ({ value }) =>
      (parseAmount(value()) ?? 0) > 0 ? undefined : { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' },
    );
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected save(): void {
    void submit(this.budgetForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const target = this.target();
        const { categoryId, isFixed } = this.model();
        const request = { amount: parseAmount(this.model().amount) ?? 0, alertThresholdPercent: Number(this.model().threshold), isFixed };
        const budget = target.mode === 'create' ? await this.api.create({ categoryId, ...request }) : await this.api.adjust(target.budget.id, request);
        const limit = formatMoney(budget.limit, budget.currency);
        this.saved.emit(
          target.mode === 'create'
            ? `Presupuesto de ${limit} al mes para «${budget.categoryName}» creado.`
            : `«${budget.categoryName}» ahora tiene un límite de ${limit} al mes.`,
        );
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
