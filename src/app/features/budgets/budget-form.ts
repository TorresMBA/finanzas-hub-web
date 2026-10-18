import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Budget, BudgetSuggestion, Category } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { TODAY } from '../../core/period/period-store';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { ALERT_THRESHOLDS, BudgetsApi } from './budgets-api';

/** A new budget on one of the categories that still has none, or a change to an existing one. */
export type BudgetFormTarget =
  | { readonly mode: 'create'; readonly categories: readonly Category[]; readonly currency: string }
  | { readonly mode: 'adjust'; readonly budget: Budget };

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** How many months before and after the current one a change can start. */
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

/** "2026-10". The month may be out of range: 0 is December of the year before. */
function isoMonth(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** "octubre 2026" */
function monthName(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Sets or changes the monthly limit of a category. A new one applies from the current month; a change, from the
 * month the person chooses. Either way the months before keep the limit they had.
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
        @if (suggested(); as hint) {
          <p class="form-note">
            {{ hint.text }}
            <button type="button" class="link" (click)="useSuggestion(hint.amount)">Usar {{ hint.label }}</button>
          </p>
        }
        <label class="form-check">
          <input type="checkbox" [formField]="budgetForm.isFixed" />
          <span>Es un pago fijo, como el alquiler. Se muestra como pagado o por pagar, sin medir el ritmo.</span>
        </label>
        @if (target().mode === 'adjust') {
          <app-field label="Desde" hint="Los meses anteriores conservan el límite que tenían.">
            <select class="input" [formField]="budgetForm.fromMonth">
              @for (option of fromMonths(); track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </app-field>
        } @else {
          <p class="form-note">Vale desde este mes. Los meses anteriores no tienen límite.</p>
        }
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
  private readonly today = inject(TODAY);

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

  private readonly currentMonth = computed(() => {
    const today = this.today();
    return isoMonth(today.getFullYear(), today.getMonth() + 1);
  });

  /** The months a change can start in, never before the budget started. As text, "2026-10" sorts after "2026-09". */
  protected readonly fromMonths = computed(() => {
    const target = this.target();
    const today = this.today();
    const start = target.mode === 'adjust' ? target.budget.effectiveFrom.slice(0, 7) : this.currentMonth();
    return Array.from({ length: MONTHS_BACK + MONTHS_AHEAD + 1 }, (_, index) => isoMonth(today.getFullYear(), today.getMonth() + 1 - MONTHS_BACK + index))
      .filter((month) => month >= start)
      .map((month) => ({ value: month, label: month === this.currentMonth() ? `Este mes (${monthName(month)})` : monthName(month) }));
  });

  protected readonly model = linkedSignal(() => {
    const target = this.target();
    return target.mode === 'create'
      ? { categoryId: target.categories[0]?.id ?? '', amount: '', threshold: '90', isFixed: false, fromMonth: this.currentMonth() }
      : {
          categoryId: target.budget.categoryId,
          amount: Number(target.budget.limit).toFixed(2),
          threshold: String(target.budget.alertThresholdPercent),
          isFixed: target.budget.isFixed,
          fromMonth: this.currentMonth(),
        };
  });
  protected readonly budgetForm = form(this.model, (path) => {
    validate(path.categoryId, ({ value }) => (value() ? undefined : { kind: 'category', message: 'Elige una categoría.' }));
    validate(path.amount, ({ value }) =>
      (parseAmount(value()) ?? 0) > 0 ? undefined : { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' },
    );
  });

  // What the category spent in the three months before this one. Only a help: the form works the same without it.
  private readonly suggestion = httpResource<BudgetSuggestion>(() => this.api.suggestionUrl(this.model().categoryId));
  protected readonly suggested = computed(() => {
    const suggestion = this.suggestion.hasValue() ? this.suggestion.value() : undefined;
    if (!suggestion || suggestion.categoryId !== this.model().categoryId || Number(suggestion.suggestedLimit) <= 0) {
      return null;
    }

    const months = suggestion.months.map((month) => MONTH_NAMES[Number(month.month.slice(5)) - 1]);
    const label = formatMoney(suggestion.suggestedLimit, suggestion.currency ?? this.currency());
    return {
      amount: Number(suggestion.suggestedLimit).toFixed(2),
      label,
      text: `De ${months[0]} a ${months.at(-1)} gastaste en promedio ${label} al mes.`,
    };
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected useSuggestion(amount: string): void {
    this.model.update((model) => ({ ...model, amount }));
  }

  protected save(): void {
    void submit(this.budgetForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const target = this.target();
        const { categoryId, isFixed, fromMonth } = this.model();
        const request = { amount: parseAmount(this.model().amount) ?? 0, alertThresholdPercent: Number(this.model().threshold), isFixed };
        const budget =
          target.mode === 'create' ? await this.api.create({ categoryId, ...request }) : await this.api.adjust(target.budget.id, { ...request, fromMonth });
        const limit = formatMoney(budget.limit, budget.currency);
        const fromNow = fromMonth === this.currentMonth();
        this.saved.emit(
          target.mode === 'create'
            ? `Presupuesto de ${limit} al mes para «${budget.categoryName}» creado.`
            : fromNow
              ? `«${budget.categoryName}» ahora tiene un límite de ${limit} al mes.`
              : `«${budget.categoryName}» tendrá un límite de ${limit} al mes desde ${monthName(fromMonth)}.`,
        );
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
