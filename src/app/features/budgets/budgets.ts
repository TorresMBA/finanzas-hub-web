import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Budget, BudgetMonth, Category, CategoryTotals } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { PeriodStore } from '../../core/period/period-store';
import { monthRange } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { IconTile, TileColor } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { BudgetDetail } from './budget-detail';
import { BudgetForm, BudgetFormTarget } from './budget-form';
import { BudgetsApi, STATUS_LOOK } from './budgets-api';
import { monthView, paceOf, rowOf } from './pace';

type Filter = 'all' | 'exceeded' | 'atRisk' | 'onTrack' | 'fixed';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'exceeded', label: 'Excedidos' },
  { value: 'atRisk', label: 'En riesgo' },
  { value: 'onTrack', label: 'En ritmo' },
  { value: 'fixed', label: 'Fijos' },
];

/** The filter a budget falls under: a fixed one is listed as such whether it is paid or not. */
function filterOf(budget: Budget): Filter {
  return budget.status === 'paid' ? 'fixed' : budget.status;
}

/**
 * The monthly limits the person set for their expense categories and how the month of the top bar is going
 * against them. Private like the rest of their money: another member of the workspace has their own.
 */
@Component({
  selector: 'app-budgets',
  imports: [BudgetDetail, BudgetForm, EmptyState, ErrorState, Icon, IconTile, MoneyPipe, PageHeader, RouterLink, Skeleton],
  templateUrl: './budgets.html',
  styleUrl: './budgets.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Budgets {
  private readonly api = inject(BudgetsApi);
  protected readonly period = inject(PeriodStore);

  protected readonly filters = FILTERS;

  protected readonly budgets = httpResource<BudgetMonth>(() => this.api.listUrl(this.period.isoMonth()));
  private readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());
  private readonly totals = httpResource<CategoryTotals>(() => {
    const { year, month } = this.period.month();
    return this.api.totalsUrl(monthRange(year, month));
  });

  /** The budgets whose subcategories are open, by category. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly filter = signal<Filter>('all');
  // By category, not by id: adjusting a limit in a later month gives the budget a new id.
  private readonly chosenCategoryId = signal<string | null>(null);
  protected readonly formTarget = signal<BudgetFormTarget | null>(null);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** A new budget needs the categories that are still free, so it waits for both lists. */
  protected readonly canCreate = computed(() => this.budgets.hasValue() && this.categories.hasValue());
  protected readonly all = computed(() => this.budgets.value()?.budgets ?? []);
  protected readonly currency = computed(() => this.budgets.value()?.baseCurrency ?? '');

  protected readonly pace = computed(() => {
    const month = this.budgets.value();
    return month ? paceOf(month) : null;
  });
  protected readonly summary = computed(() => {
    const month = this.budgets.value();
    return month ? monthView(month) : null;
  });

  protected readonly filterCounts = computed(() => {
    const all = this.all();
    return new Map(FILTERS.map(({ value }) => [value, value === 'all' ? all.length : all.filter((budget) => filterOf(budget) === value).length]));
  });

  protected readonly rows = computed(() => {
    const filter = this.filter();
    const pace = this.pace();
    if (!pace) {
      return [];
    }

    return this.all()
      .filter((budget) => filter === 'all' || filterOf(budget) === filter)
      .map((budget) => ({ budget, look: STATUS_LOOK[budget.status], view: rowOf(budget, pace), breakdown: this.breakdownOf(budget) }));
  });

  /** The budget in the side panel: the one the person chose while it is still listed, otherwise the first. */
  protected readonly selected = computed(() => {
    const rows = this.rows();
    return rows.find((row) => row.budget.categoryId === this.chosenCategoryId()) ?? rows[0] ?? null;
  });

  /**
   * What each subcategory of a budget spent this month, the one that spent most first, and what went on the category
   * itself apart. Null for a category without subcategories: there is nothing to break down.
   */
  private breakdownOf(budget: Budget): { id: string; name: string; amount: number; share: number; note: string }[] | null {
    const category = (this.categories.value() ?? []).find((candidate) => candidate.id === budget.categoryId);
    if (!category || category.subcategories.length === 0) {
      return null;
    }

    const amounts = new Map((this.totals.value()?.categories ?? []).map((total) => [total.categoryId, Number(total.amount)]));
    const spent = Number(budget.spent);
    const parts = category.subcategories
      .filter((child) => !child.isArchived || (amounts.get(child.id) ?? 0) !== 0)
      .map((child) => ({ id: child.id, name: child.name, amount: amounts.get(child.id) ?? 0 }));
    const direct = amounts.get(category.id) ?? 0;
    if (direct !== 0) {
      parts.push({ id: category.id, name: 'Sin subcategoría', amount: direct });
    }

    parts.sort((a, b) => b.amount - a.amount);
    return parts.map((part) => {
      const share = spent > 0 ? Math.max(0, Math.min(100, (part.amount / spent) * 100)) : 0;
      return { ...part, share, note: spent > 0 ? `${Math.round(share)}% de la categoría` : '' };
    });
  }

  protected toggle(categoryId: string): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      if (!next.delete(categoryId)) {
        next.add(categoryId);
      }

      return next;
    });
  }

  protected select(budget: Budget): void {
    this.chosenCategoryId.set(budget.categoryId);
  }

  protected tile(color: string): TileColor {
    return color as TileColor;
  }

  protected openCreate(): void {
    const taken = new Set(this.all().map((budget) => budget.categoryId));
    const categories = (this.categories.value() ?? []).filter((category) => !category.isArchived && !taken.has(category.id));
    if (categories.length === 0) {
      this.notice.set(null);
      this.failure.set('Todas tus categorías de gasto ya tienen presupuesto. Crea otra categoría o ajusta un límite.');
      return;
    }

    this.formTarget.set({ mode: 'create', categories, currency: this.currency() });
  }

  protected openAdjust(budget: Budget): void {
    this.formTarget.set({ mode: 'adjust', budget });
  }

  protected onSaved(message: string): void {
    this.formTarget.set(null);
    this.failure.set(null);
    this.notice.set(message);
    this.budgets.reload();
  }

  /** Raises the limit to what the panel suggests, keeping the rest of the budget as it is. */
  protected raise(budget: Budget, amount: number): Promise<void> {
    return this.run(async () => {
      await this.api.adjust(budget.id, { amount, alertThresholdPercent: Number(budget.alertThresholdPercent), isFixed: budget.isFixed });
      return `«${budget.categoryName}» ahora tiene un límite de ${formatMoney(amount, budget.currency)} al mes.`;
    });
  }

  protected end(budget: Budget): Promise<void> {
    return this.run(async () => {
      await this.api.end(budget.id);
      return `«${budget.categoryName}» ya no tiene presupuesto desde este mes. Los meses anteriores lo conservan.`;
    });
  }

  private async run(action: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      this.notice.set(await action());
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
      this.budgets.reload();
    }
  }
}
