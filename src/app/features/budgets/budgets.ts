import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Budget, BudgetDetail, BudgetMonth, Category } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { PeriodStore } from '../../core/period/period-store';
import { formatShortDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { IconTile, TileColor } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { BudgetForm, BudgetFormTarget } from './budget-form';
import { BudgetsApi, STATUS_LOOK } from './budgets-api';

type Filter = 'all' | 'atRisk' | 'exceeded' | 'onTrack' | 'fixed';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'atRisk', label: 'En riesgo' },
  { value: 'exceeded', label: 'Excedidos' },
  { value: 'onTrack', label: 'En ritmo' },
  { value: 'fixed', label: 'Fijos' },
];

/** The filter a budget falls under: a fixed one is listed as such whether it is paid or not. */
function filterOf(budget: Budget): Filter {
  return budget.status === 'paid' ? 'fixed' : budget.status;
}

/** What a meter shows for a budget: how full, and whether it warns. */
function meterOf(budget: Budget): { value: number; level: 'warn' | 'over' | null } {
  const tone = STATUS_LOOK[budget.status].tone;
  return { value: Math.min(100, Number(budget.usedPercent)), level: tone === 'warn' || tone === 'over' ? tone : null };
}

/**
 * The monthly limits the person set for their expense categories and how the month of the top bar is going
 * against them. Private like the rest of their money: another member of the workspace has their own.
 */
@Component({
  selector: 'app-budgets',
  imports: [BudgetForm, EmptyState, ErrorState, Icon, IconTile, MoneyPipe, PageHeader, RouterLink, Skeleton],
  templateUrl: './budgets.html',
  styleUrl: './budgets.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Budgets {
  private readonly api = inject(BudgetsApi);
  protected readonly period = inject(PeriodStore);

  protected readonly filters = FILTERS;
  protected readonly statusLook = STATUS_LOOK;
  protected readonly formatShortDate = formatShortDate;

  protected readonly budgets = httpResource<BudgetMonth>(() => this.api.listUrl(this.period.isoMonth()));
  private readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());

  protected readonly filter = signal<Filter>('all');
  // By category, not by id: adjusting a limit in a later month gives the budget a new id.
  private readonly chosenCategoryId = signal<string | null>(null);
  protected readonly formTarget = signal<BudgetFormTarget | null>(null);
  protected readonly confirmingEnd = signal(false);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly all = computed(() => this.budgets.value()?.budgets ?? []);
  protected readonly currency = computed(() => this.budgets.value()?.baseCurrency ?? '');

  protected readonly filterCounts = computed(() => {
    const all = this.all();
    return new Map(FILTERS.map(({ value }) => [value, value === 'all' ? all.length : all.filter((budget) => filterOf(budget) === value).length]));
  });

  protected readonly rows = computed(() => {
    const filter = this.filter();
    return this.all()
      .filter((budget) => filter === 'all' || filterOf(budget) === filter)
      .map((budget) => ({ budget, look: STATUS_LOOK[budget.status], meter: meterOf(budget), margin: this.marginOf(budget) }));
  });

  /** The budget in the side panel: the one the person chose while it is still listed, otherwise the first. */
  protected readonly selected = computed(() => {
    const rows = this.rows();
    return (rows.find((row) => row.budget.categoryId === this.chosenCategoryId()) ?? rows[0])?.budget ?? null;
  });
  protected readonly selectedMeter = computed(() => {
    const budget = this.selected();
    return budget ? meterOf(budget) : null;
  });

  protected readonly detail = httpResource<BudgetDetail>(() => this.api.detailUrl(this.selected()?.id ?? null, this.period.isoMonth()));

  /** What was spent each day as bars, each as a share of the tallest one. */
  protected readonly daily = computed(() => {
    const days = this.detail.value()?.daily ?? [];
    const tallest = Math.max(1, ...days.map((day) => Number(day.amount)));
    return days.map((day) => ({ day: day.day, height: (Number(day.amount) / tallest) * 100, spent: Number(day.amount) > 0 }));
  });

  protected readonly summary = computed(() => {
    const month = this.budgets.value();
    if (!month) {
      return null;
    }

    const currency = month.baseCurrency ?? '';
    const remaining = Number(month.remaining);
    const used = Number(month.limit) > 0 ? (Number(month.spent) / Number(month.limit)) * 100 : 0;
    const alerts = month.budgets.filter((budget) => budget.status === 'atRisk' || budget.status === 'exceeded').length;
    return {
      headline: remaining < 0 ? `Excedido por ${formatMoney(-remaining, currency)}` : formatMoney(remaining, currency),
      caption: remaining < 0 ? `sobre ${formatMoney(month.limit, currency)} presupuestados` : `disponibles de ${formatMoney(month.limit, currency)} presupuestados`,
      isOver: remaining < 0,
      when: +month.daysLeft === 0 ? 'Mes cerrado' : +month.day === 0 ? 'Aún no empieza' : `Día ${month.day} de ${month.daysInMonth}`,
      // The marker of the ideal pace only means something while the month is running.
      pace: +month.daysLeft > 0 && +month.day > 0 ? Number(month.pacePercent) : null,
      meter: Math.min(100, used),
      level: remaining < 0 ? 'over' : null,
      spent: `Gastado ${formatMoney(month.spent, currency)} · ${Math.round(used)}%`,
      perDay: month.dailyAllowance === null ? '—' : formatMoney(month.dailyAllowance, currency),
      alerts,
    };
  });

  protected select(budget: Budget): void {
    this.chosenCategoryId.set(budget.categoryId);
    this.confirmingEnd.set(false);
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

  protected async end(budget: Budget): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      await this.api.end(budget.id);
      this.notice.set(`«${budget.categoryName}» ya no tiene presupuesto desde este mes. Los meses anteriores lo conservan.`);
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
      this.confirmingEnd.set(false);
      this.budgets.reload();
    }
  }

  /** The sentence under the figure of the side panel. */
  protected leftLine(budget: Budget): string {
    const remaining = Number(budget.remaining);
    if (remaining < 0) {
      return `Excediste el límite por ${formatMoney(-remaining, budget.currency)}`;
    }

    if (budget.isFixed) {
      return remaining === 0 ? 'Pagado completo' : `Restan ${formatMoney(remaining, budget.currency)} por pagar`;
    }

    const perDay = budget.dailyAllowance === null ? '' : ` · ${formatMoney(budget.dailyAllowance, budget.currency)} por día`;
    return `Te quedan ${formatMoney(remaining, budget.currency)}${perDay}`;
  }

  private marginOf(budget: Budget): string {
    if (budget.isFixed) {
      return 'Pago fijo';
    }

    return budget.dailyAllowance === null ? (Number(budget.remaining) <= 0 ? 'Sin margen' : '') : `${formatMoney(budget.dailyAllowance, budget.currency)}/día`;
  }
}
