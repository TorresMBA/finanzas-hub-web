import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dashboard as DashboardData, DashboardAccount, DashboardMovement } from '../../core/api/api-types';
import { SessionStore } from '../../core/auth/session-store';
import { PeriodStore } from '../../core/period/period-store';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { formatShortDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { IconTile, TileColor } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';

const MONTH = new Intl.DateTimeFormat('es-PE', { month: 'short' });

const ACCOUNT_LOOK: Readonly<Record<DashboardAccount['type'], { icon: string; color: TileColor }>> = {
  bank: { icon: 'account_balance', color: 'blue' },
  cash: { icon: 'payments', color: 'green' },
  wallet: { icon: 'account_balance_wallet', color: 'violet' },
  creditCard: { icon: 'credit_card', color: 'amber' },
  goalFund: { icon: 'flag', color: 'violet' },
  investment: { icon: 'trending_up', color: 'green' },
};

/** "may" from "2026-05". */
function monthLabel(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  return MONTH.format(new Date(year, month - 1, 1)).replace('.', '').toLowerCase();
}

/** How a figure moved against the month before, as the line under a KPI. */
function against(current: number, previous: number, currency: string): string {
  const change = current - previous;
  return change === 0 ? 'Igual que el mes anterior' : `${formatMoney(change, currency, { signed: true })} vs. mes anterior`;
}

/**
 * The home page: the month selected in the top bar, in the base currency of the workspace. It adds nothing
 * up: every figure comes from the API, and it is only about the signed-in person's own money.
 */
@Component({
  selector: 'app-dashboard',
  imports: [EmptyState, ErrorState, IconTile, MoneyPipe, PageHeader, RouterLink, Skeleton],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly workspaces = inject(WorkspaceStore);
  private readonly session = inject(SessionStore);
  private readonly period = inject(PeriodStore);

  protected readonly periodLabel = this.period.label;
  protected readonly shortDate = formatShortDate;
  protected readonly accountLook = (account: DashboardAccount) => ACCOUNT_LOOK[account.type];

  // A string, so the request is repeated only when the workspace or the month changes.
  private readonly url = computed(() => {
    const workspace = this.workspaces.current();
    return workspace ? `/api/v1/workspaces/${workspace.id}/dashboard?month=${this.period.isoMonth()}` : undefined;
  });
  protected readonly dashboard = httpResource<DashboardData>(() => this.url());

  protected readonly greeting = computed(() => {
    const name = this.session.user()?.displayName.trim().split(/\s+/)[0];
    return `${name ? `Hola, ${name}. ` : ''}Este es el resumen de tu dinero del mes. Solo tú lo ves.`;
  });

  /** The four figures of the month. Empty while the workspace has no base currency to state them in. */
  protected readonly kpis = computed(() => {
    const data = this.dashboard.value();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return [];
    }

    const target = this.session.user()?.preferences.savingsRateTarget;
    const rate = data.savingsRate === null ? null : Number(data.savingsRate);
    return [
      {
        label: 'Patrimonio',
        value: formatMoney(data.netWorth.amount, currency),
        note: against(Number(data.netWorth.amount), Number(data.netWorth.previousAmount), currency),
        tone: Number(data.netWorth.change) < 0 ? 'bad' : 'good',
      },
      { label: 'Ingresos', value: formatMoney(data.income, currency), note: against(Number(data.income), Number(data.previousIncome), currency), tone: 'good' },
      { label: 'Gastos', value: formatMoney(data.expense, currency), note: against(Number(data.expense), Number(data.previousExpense), currency), tone: 'neutral' },
      {
        label: 'Tasa de ahorro',
        value: rate === null ? '—' : `${rate.toFixed(1)}%`,
        note: rate === null ? 'Sin ingresos este mes' : target ? `Meta: ${target}%` : 'De lo que ingresó, lo que quedó',
        tone: rate !== null && rate < 0 ? 'bad' : 'neutral',
      },
      // Only for someone who has set budgets: without them there is nothing to measure against.
      ...(data.budget
        ? [
            {
              label: 'Presupuesto',
              value: `${Math.round(Number(data.budget.usedPercent))}% usado`,
              note: `${formatMoney(data.budget.spent, currency)} de ${formatMoney(data.budget.limit, currency)}`,
              tone: Number(data.budget.spent) > Number(data.budget.limit) ? 'bad' : 'neutral',
            },
          ]
        : []),
    ];
  });

  /** Six months of income and expenses as bars, each as a share of the tallest one. */
  protected readonly cashflow = computed(() => {
    const data = this.dashboard.value();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return [];
    }

    const tallest = Math.max(1, ...data.cashflow.flatMap((month) => [Number(month.income), Number(month.expense)]));
    return data.cashflow.map((month) => ({
      month: month.month,
      label: monthLabel(month.month),
      income: (Number(month.income) / tallest) * 100,
      expense: (Number(month.expense) / tallest) * 100,
      summary: `${monthLabel(month.month)}: ingresos ${formatMoney(month.income, currency)}, gastos ${formatMoney(month.expense, currency)}`,
    }));
  });

  protected readonly hasCashflow = computed(() => this.cashflow().some((month) => month.income > 0 || month.expense > 0));

  /** What to show under the description of a movement: where it happened, and for a transfer, where it went. */
  protected placeOf(movement: DashboardMovement): string {
    const where = movement.counterAccountName ? `${movement.accountName} → ${movement.counterAccountName}` : movement.accountName;
    return `${formatShortDate(movement.occurredOn)} · ${movement.categoryName ? movement.categoryName + ' · ' : ''}${where}`;
  }

  /** A category colour as the API names it is one of the tile colours. */
  protected tile(color: string | null): TileColor {
    return (color as TileColor | null) ?? 'neutral';
  }

  /** A transfer is shown without a sign: seen from no account in particular, the money neither came nor went. */
  protected magnitude(amount: number | string): number {
    return Math.abs(Number(amount));
  }

  protected lookOf(movement: DashboardMovement): { icon: string; color: TileColor } {
    return movement.kind === 'transfer'
      ? { icon: 'swap_horiz', color: 'blue' }
      : { icon: movement.categoryIcon ?? 'receipt_long', color: this.tile(movement.categoryColor) };
  }
}
