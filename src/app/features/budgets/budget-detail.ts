import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Budget, BudgetDetail as Detail } from '../../core/api/api-types';
import { PeriodStore } from '../../core/period/period-store';
import { formatShortDate } from '../../shared/ui/dates';
import { Icon } from '../../shared/ui/icon';
import { IconTile, TileColor } from '../../shared/ui/icon-tile';
import { MoneyPipe } from '../../shared/ui/money';
import { Skeleton } from '../../shared/ui/skeleton';
import { BudgetsApi, STATUS_LOOK } from './budgets-api';
import { ChartMode, MonthPace, chartOf, detailOf } from './pace';

const CHART_MODES: readonly { value: ChartMode; label: string }[] = [
  { value: 'cumulative', label: 'Acumulado' },
  { value: 'daily', label: 'Diario' },
];

/** The side panel of the budget the person chose: how it is doing, its month day by day and its latest movements. */
@Component({
  selector: 'app-budget-detail',
  imports: [Icon, IconTile, MoneyPipe, RouterLink, Skeleton],
  templateUrl: './budget-detail.html',
  styleUrl: './budget-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetDetail {
  private readonly api = inject(BudgetsApi);
  protected readonly period = inject(PeriodStore);

  readonly budget = input.required<Budget>();
  readonly pace = input.required<MonthPace>();
  /** Whether its category has subcategories, so a movement on the category itself says so. */
  readonly hasSubcategories = input(false);
  /** A change of limit applies from the current month on, so it is offered only while looking at it. */
  readonly canChange = input(false);
  readonly busy = input(false);

  readonly edit = output<void>();
  readonly end = output<void>();
  readonly raise = output<number>();

  protected readonly chartModes = CHART_MODES;
  protected readonly formatShortDate = formatShortDate;

  protected readonly detail = httpResource<Detail>(() => this.api.detailUrl(this.budget().id, this.period.isoMonth()));

  protected readonly chartMode = signal<ChartMode>('cumulative');
  protected readonly confirmingEnd = linkedSignal({ source: () => this.budget().categoryId, computation: () => false });

  protected readonly look = computed(() => STATUS_LOOK[this.budget().status]);
  protected readonly view = computed(() => detailOf(this.budget(), this.pace(), this.detail.value()?.daily));
  protected readonly chart = computed(() => {
    const daily = this.detail.value()?.daily;
    return daily ? chartOf(this.budget(), daily, this.pace(), this.chartMode()) : null;
  });
  protected readonly latest = computed(() => (this.detail.value()?.movements ?? []).slice(0, 5));

  protected tile(color: string): TileColor {
    return color as TileColor;
  }

  /** "Cursos · AMEX Black": the subcategory, when the category has any, and the account. */
  protected whereOf(movement: Detail['movements'][number]): string {
    const subcategory = movement.subcategoryName ?? (this.hasSubcategories() ? 'Sin subcategoría' : null);
    return subcategory ? `${subcategory} · ${movement.accountName}` : movement.accountName;
  }

  /** "13" and "OCT" of a date, to stack them. */
  protected dayOf(iso: string): { day: string; month: string } {
    const [day, month] = formatShortDate(iso).split(' ');
    return { day, month: month.toUpperCase() };
  }
}
