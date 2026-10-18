import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReportFormat, ReportPeriodKind, ReportSummary } from '../../core/api/api-types';
import { SessionStore } from '../../core/auth/session-store';
import { PeriodStore } from '../../core/period/period-store';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SHORT_MONTH = new Intl.DateTimeFormat('es-PE', { month: 'short' });

/** The slices of the donut: five categories and the rest. Fixed colours, so two categories never share one. */
const SLICE_COLORS = ['var(--ac)', 'var(--bl)', 'var(--vi)', 'var(--am)', 'var(--rd)', 'var(--mu)'];
const SLICES = 5;
const CHANGES = 6;

const PERIODS: readonly { value: ReportPeriodKind; label: string }[] = [
  { value: 'month', label: 'Mes' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Año' },
];

/** "octubre 2026", "4.º trimestre 2026" or "2026". */
function periodName(kind: ReportPeriodKind, from: string): string {
  const [year, month] = from.split('-').map(Number);
  if (kind === 'year') {
    return `${year}`;
  }

  return kind === 'quarter' ? `${Math.floor((month - 1) / 3) + 1}.º trimestre ${year}` : `${MONTHS[month - 1]} ${year}`;
}

/** "+4.2 %" or "−3.1 %" of a figure against the period before; null without a figure to compare with. */
function change(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function percent(value: number): string {
  return `${sign(value)}${Math.abs(value).toLocaleString('es-PE', { maximumFractionDigits: 1 })} %`;
}

function sign(value: number): string {
  if (value > 0) {
    return '+';
  }

  return value < 0 ? '−' : '';
}

/** How a change reads: good when it goes the way that helps, bad otherwise, neutral without a change to compare. */
function changeTone(value: number | null, goodWhenUp: boolean): 'good' | 'bad' | '' {
  if (value === null) {
    return '';
  }

  const good = goodWhenUp ? value >= 0 : value <= 0;
  return good ? 'good' : 'bad';
}

/**
 * The change of the expenses, and how much of them came out of what was saved for goals: a month with the trip is
 * not a month out of control.
 */
function expenseNote(change: number | null, fromGoals: number, currency: string): string {
  const base = change === null ? 'Sin gastos antes' : `${percent(change)} vs. anterior`;
  return fromGoals > 0 ? `${base} · ${formatMoney(fromGoals, currency)} pagados con tus metas` : base;
}

/** A category's change against the period before; under 5 % either way counts as flat. */
function trend(value: number | null): { tone: 'good' | 'bad' | ''; icon: string } {
  if (value === null || Math.abs(value) < 5) {
    return { tone: '', icon: 'trending_flat' };
  }

  return value > 0 ? { tone: 'bad', icon: 'trending_up' } : { tone: 'good', icon: 'trending_down' };
}

/**
 * Where the money went and how saving goes, for the month of the top bar, its quarter or its year, against
 * the period before. Every figure comes from the API and is about the signed-in person's own money.
 */
@Component({
  selector: 'app-reports',
  imports: [EmptyState, ErrorState, Icon, MoneyPipe, PageHeader, RouterLink, Skeleton],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reports {
  private readonly workspaces = inject(WorkspaceStore);
  private readonly period = inject(PeriodStore);
  private readonly session = inject(SessionStore);

  /** The share of income the person aims to save, from their preferences; null without one. */
  protected readonly target = computed(() => {
    const target = this.session.user()?.preferences.savingsRateTarget;
    return target ? Number(target) : null;
  });

  /** How many of the months with income reached the target. */
  protected readonly targetMet = computed(() => {
    const target = this.target();
    const rates = (this.report.value()?.months ?? []).filter((month) => month.savingsRate !== null).map((month) => Number(month.savingsRate));
    return target === null ? null : { met: rates.filter((rate) => rate >= target).length, of: rates.length };
  });

  protected readonly periods = PERIODS;
  protected readonly kind = signal<ReportPeriodKind>('month');

  private readonly base = computed(() => {
    const workspace = this.workspaces.current();
    return workspace ? `/api/v1/workspaces/${workspace.id}/reports` : undefined;
  });
  private readonly query = computed(() => `period=${this.kind()}&anchor=${this.period.isoMonth()}`);
  protected readonly report = httpResource<ReportSummary>(() => (this.base() ? `${this.base()}/summary?${this.query()}` : undefined));

  protected exportUrl(format: ReportFormat): string {
    return `${this.base()}/export?${this.query()}&format=${format}`;
  }

  protected readonly title = computed(() => {
    const data = this.report.value();
    return data ? `${periodName(data.period, data.from)} frente a ${periodName(data.period, data.previousFrom)}` : '';
  });

  protected readonly isEmpty = computed(() => {
    const data = this.report.value();
    return !!data && [data.current.income, data.current.expense, data.previous.income, data.previous.expense].every((value) => Number(value) === 0);
  });

  protected readonly kpis = computed(() => {
    const data = this.report.value();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return [];
    }

    const { current, previous } = data;
    const income = change(Number(current.income), Number(previous.income));
    const expense = change(Number(current.expense), Number(previous.expense));
    const rate = current.savingsRate === null ? null : Number(current.savingsRate);
    return [
      { label: 'Ingresos', value: formatMoney(current.income, currency), note: income === null ? 'Sin ingresos antes' : `${percent(income)} vs. anterior`, tone: changeTone(income, true) },
      { label: 'Gastos', value: formatMoney(current.expense, currency), note: expenseNote(expense, Number(current.goalFundedExpense), currency), tone: changeTone(expense, false) },
      { label: 'Ahorro', value: formatMoney(current.savings, currency), note: rate === null ? 'Sin ingresos en el periodo' : `${rate.toLocaleString('es-PE')} % de tus ingresos`, tone: Number(current.savings) < 0 ? 'bad' : '' },
      { label: 'Gasto promedio diario', value: formatMoney(current.dailyExpense, currency), note: `En ${current.days} ${Number(current.days) === 1 ? 'día' : 'días'}`, tone: '' },
    ];
  });

  /** Five categories and the rest, with the conic gradient that draws them. */
  protected readonly donut = computed(() => {
    const data = this.report.value();
    const spent = (data?.categories ?? []).filter((category) => Number(category.amount) > 0);
    const total = Number(data?.current.expense ?? 0);
    if (!data || total <= 0) {
      return { slices: [], gradient: 'var(--sf3)' };
    }

    const top = spent.slice(0, SLICES).map((category) => ({ name: category.name, amount: Number(category.amount) }));
    const rest = spent.slice(SLICES).reduce((sum, category) => sum + Number(category.amount), 0);
    const slices = (rest > 0 ? [...top, { name: 'Otros', amount: rest }] : top).map((slice, index) => ({
      ...slice,
      share: Math.round((slice.amount / total) * 1000) / 10,
      color: SLICE_COLORS[slice.name === 'Otros' ? SLICE_COLORS.length - 1 : index],
    }));
    let start = 0;
    const stops = slices.map((slice) => {
      const end = start + (slice.amount / total) * 100;
      const stop = `${slice.color} ${start}% ${end}%`;
      start = end;
      return stop;
    });
    return { slices, gradient: `conic-gradient(${stops.join(', ')})` };
  });

  /** The categories that weigh most, with how much they moved. More spending is bad news. */
  protected readonly changes = computed(() =>
    (this.report.value()?.categories ?? []).slice(0, CHANGES).map((category) => {
      const value = category.change === null ? null : Number(category.change);
      return {
        ...category,
        label: value === null ? 'Nuevo' : percent(value),
        ...trend(value),
      };
    }),
  );

  protected readonly hasRates = computed(() => (this.report.value()?.months ?? []).some((month) => month.savingsRate !== null));

  /** The savings rate of each month, as bars over and under a line at zero. */
  protected readonly trend = computed(() => {
    const months = this.report.value()?.months ?? [];
    const target = this.target();
    const top = Math.max(25, target ?? 0, ...months.map((month) => Math.abs(Number(month.savingsRate ?? 0))));
    return months.map((month) => {
      const [year, number] = month.month.split('-').map(Number);
      const rate = month.savingsRate === null ? null : Number(month.savingsRate);
      return {
        month: month.month,
        label: SHORT_MONTH.format(new Date(year, number - 1, 1)).replace('.', ''),
        text: rate === null ? '—' : `${rate.toLocaleString('es-PE', { maximumFractionDigits: 0 })}%`,
        height: rate === null ? 0 : Math.max(2, (Math.abs(rate) / top) * 100),
        negative: rate !== null && rate < 0,
        targetHeight: target === null ? null : (target / top) * 100,
        met: rate !== null && target !== null && rate >= target,
      };
    });
  });
}
