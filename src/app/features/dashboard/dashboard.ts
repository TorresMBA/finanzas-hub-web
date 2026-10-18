import { DOCUMENT } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dashboard as DashboardData, DashboardAccount, DashboardMovement } from '../../core/api/api-types';
import { SessionStore } from '../../core/auth/session-store';
import { PeriodStore, TODAY } from '../../core/period/period-store';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { formatShortDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { IconTile, TileColor } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
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

const QUOTES = ['“Pequeñas decisiones, grandes resultados.”', '“Cada sol cuenta.”', '“Hoy ahorras, mañana eliges.”', '“Lo que se mide, mejora.”'];

/** The stars of the banner: always the same sky, so it does not jump between visits. */
const STARS = (() => {
  let seed = 7;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: 46 }, () => ({
    left: next() * 100,
    top: next() * 100,
    size: next() < 0.15 ? 2.5 : 1.5,
    delay: (next() * 4).toFixed(2),
    duration: (2.5 + next() * 3).toFixed(2),
  }));
})();

type KpiId = 'netWorth' | 'income' | 'expense' | 'savings' | 'budget' | 'daily';
type Tone = 'good' | 'bad' | 'warn' | 'neutral';

interface Kpi {
  id: KpiId;
  label: string;
  icon: string;
  color: TileColor;
  value: string;
  valueTone: Tone;
  note: string;
  noteTone: Tone;
  /** Share of the budget used, for the bar under the figure. */
  bar?: number;
}

const KPI_IDS: readonly KpiId[] = ['netWorth', 'income', 'expense', 'savings', 'budget', 'daily'];
const DEFAULT_KPIS: readonly KpiId[] = ['netWorth', 'income', 'expense', 'savings', 'budget'];
const KPI_NAMES: Readonly<Record<KpiId, { label: string; icon: string }>> = {
  netWorth: { label: 'Patrimonio', icon: 'account_balance' },
  income: { label: 'Ingresos', icon: 'south_west' },
  expense: { label: 'Gastos', icon: 'north_east' },
  savings: { label: 'Tasa de ahorro', icon: 'savings' },
  budget: { label: 'Presupuesto', icon: 'donut_large' },
  daily: { label: 'Gasto diario', icon: 'today' },
};
const KPI_STORAGE_KEY = 'ph.home.kpis';

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

/** "1 día", "3 días". */
function dayCount(days: number): string {
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Days gone by in a month: all of a past one, none of one to come. */
function elapsedDays(selected: number, current: number, total: number, dayOfMonth: number): number {
  if (selected < current) {
    return total;
  }
  return selected === current ? dayOfMonth : 0;
}

function greetingAt(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return 'Buenos días';
  }
  return hour >= 5 && hour < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** Up is good, down is bad. */
function trendTone(change: number): Tone {
  if (change < 0) {
    return 'bad';
  }
  return change > 0 ? 'good' : 'neutral';
}

/** Over the limit is bad; from 80% on, a warning. */
function budgetTone(spent: number, limit: number, used: number): Tone {
  if (spent > limit) {
    return 'bad';
  }
  return used >= 80 ? 'warn' : 'good';
}

function savingsNote(rate: number | null, target: number | string | null | undefined): string {
  if (rate === null) {
    return 'Sin ingresos este mes';
  }
  return target ? `Meta: ${target}%` : 'De lo que ingresó, lo que quedó';
}

/**
 * The home page: the month selected in the top bar, in the base currency of the workspace. It adds nothing
 * up: every figure comes from the API, and it is only about the signed-in person's own money.
 *
 * Which figures show, and in what order, is a choice of the person on this device.
 */
@Component({
  selector: 'app-dashboard',
  imports: [EmptyState, ErrorState, Icon, IconTile, MoneyPipe, RouterLink, Skeleton],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly workspaces = inject(WorkspaceStore);
  private readonly session = inject(SessionStore);
  private readonly period = inject(PeriodStore);
  private readonly today = inject(TODAY);
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage;

  protected readonly stars = STARS;
  protected readonly shortDate = formatShortDate;
  protected readonly accountLook = (account: DashboardAccount) => ACCOUNT_LOOK[account.type];

  // A string, so the request is repeated only when the workspace or the month changes.
  private readonly url = computed(() => {
    const workspace = this.workspaces.current();
    return workspace ? `/api/v1/workspaces/${workspace.id}/dashboard?month=${this.period.isoMonth()}` : undefined;
  });
  protected readonly dashboard = httpResource<DashboardData>(() => this.url());

  /** The month as loaded. Reading the value of a resource that failed throws, and the banner shows in every state. */
  private readonly data = computed(() => (this.dashboard.hasValue() ? this.dashboard.value() : undefined));

  /** Days of the selected month, and how many of them have gone by. A month to come has none behind it. */
  private readonly days = computed(() => {
    const { year, month } = this.period.month();
    const total = new Date(year, month, 0).getDate();
    const today = this.today();
    const selected = year * 12 + month;
    const current = today.getFullYear() * 12 + today.getMonth() + 1;
    return { total, elapsed: elapsedDays(selected, current, total, today.getDate()), isCurrent: selected === current };
  });

  protected readonly eyebrow = computed(() => {
    const { total, elapsed, isCurrent } = this.days();
    return isCurrent ? `${this.period.label()} · Día ${elapsed} de ${total}` : this.period.label();
  });

  protected readonly greeting = computed(() => {
    const hello = greetingAt(this.today().getHours());
    const name = this.session.user()?.displayName.trim().split(/\s+/)[0];
    return name ? `${hello}, ${name}` : hello;
  });

  protected readonly daytime = computed(() => {
    const hour = this.today().getHours();
    return hour >= 6 && hour < 19;
  });

  protected readonly quote = computed(() => QUOTES[this.today().getDate() % QUOTES.length]);

  /** Short readings of the month for the banner. */
  protected readonly insights = computed(() => {
    const data = this.data();
    if (!data?.baseCurrency || data.accounts.length === 0) {
      return [];
    }

    const insights: { text: string; tone: Tone }[] = [];
    const rate = data.savingsRate === null ? null : Number(data.savingsRate);
    if (rate !== null) {
      insights.push(rate < 0 ? { text: 'Gastaste más de lo que ingresaste', tone: 'bad' } : { text: `Ahorraste el ${rate.toFixed(0)}% de tus ingresos`, tone: 'good' });
    } else if (Number(data.expense) > 0) {
      insights.push({ text: 'Gastos sin ingresos este mes', tone: 'bad' });
    }
    if (data.budget) {
      const used = Math.round(Number(data.budget.usedPercent));
      insights.push({ text: `Presupuesto al ${used}%`, tone: budgetTone(Number(data.budget.spent), Number(data.budget.limit), used) });
    }
    const { total, elapsed, isCurrent } = this.days();
    if (isCurrent) {
      const left = total - elapsed;
      insights.push({ text: left === 0 ? 'Hoy cierra el mes' : `${dayCount(left)} para cerrar el mes`, tone: 'warn' });
    }
    return insights;
  });

  protected readonly editing = signal(false);
  private readonly order = signal<readonly KpiId[]>(this.readOrder());

  /** Every figure the month can give. The budget only exists for someone who has set one. */
  private readonly allKpis = computed((): Partial<Record<KpiId, Kpi>> => {
    const data = this.data();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return {};
    }

    const target = this.session.user()?.preferences.savingsRateTarget;
    const rate = data.savingsRate === null ? null : Number(data.savingsRate);
    const negativeRate = rate !== null && rate < 0;
    const { elapsed } = this.days();
    const kpis: Partial<Record<KpiId, Kpi>> = {
      netWorth: {
        ...this.named('netWorth', 'blue'),
        value: formatMoney(data.netWorth.amount, currency),
        valueTone: Number(data.netWorth.amount) < 0 ? 'bad' : 'neutral',
        note: against(Number(data.netWorth.amount), Number(data.netWorth.previousAmount), currency),
        noteTone: trendTone(Number(data.netWorth.change)),
      },
      income: {
        ...this.named('income', 'green'),
        value: formatMoney(data.income, currency),
        valueTone: 'neutral',
        note: against(Number(data.income), Number(data.previousIncome), currency),
        noteTone: 'good',
      },
      expense: {
        ...this.named('expense', 'red'),
        value: formatMoney(data.expense, currency),
        valueTone: 'neutral',
        note: against(Number(data.expense), Number(data.previousExpense), currency),
        noteTone: 'neutral',
      },
      savings: {
        ...this.named('savings', negativeRate ? 'red' : 'green'),
        value: rate === null ? '—' : `${rate.toFixed(1)}%`,
        valueTone: negativeRate ? 'bad' : 'neutral',
        note: savingsNote(rate, target),
        noteTone: negativeRate ? 'bad' : 'neutral',
      },
      daily: {
        ...this.named('daily', 'violet'),
        value: elapsed === 0 ? '—' : formatMoney(Number(data.expense) / elapsed, currency),
        valueTone: 'neutral',
        note: elapsed === 0 ? 'El mes aún no empieza' : `Promedio en ${dayCount(elapsed)}`,
        noteTone: 'neutral',
      },
    };
    if (data.budget) {
      kpis.budget = this.budgetKpi(data.budget, currency);
    }
    return kpis;
  });

  /** The figures the person chose, in their order. Empty while the workspace has no base currency. */
  protected readonly kpis = computed(() => {
    const all = this.allKpis();
    return this.order().flatMap((id) => all[id] ?? []);
  });

  /** The figures the person can still add. */
  protected readonly hiddenKpis = computed(() => {
    const all = this.allKpis();
    return KPI_IDS.filter((id) => all[id] && !this.order().includes(id)).map((id) => ({ id, ...KPI_NAMES[id] }));
  });

  /** Six months of income and expenses as bars, each as a share of the tallest one. */
  protected readonly cashflow = computed(() => {
    const data = this.data();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return [];
    }

    const tallest = Math.max(1, ...data.cashflow.flatMap((month) => [Number(month.income), Number(month.expense)]));
    return data.cashflow.map((month) => ({
      month: month.month,
      label: monthLabel(month.month),
      isSelected: month.month === data.month,
      income: (Number(month.income) / tallest) * 100,
      expense: (Number(month.expense) / tallest) * 100,
      summary: `${monthLabel(month.month)}: ingresos ${formatMoney(month.income, currency)}, gastos ${formatMoney(month.expense, currency)}`,
    }));
  });

  protected readonly hasCashflow = computed(() => this.cashflow().some((month) => month.income > 0 || month.expense > 0));

  /** One line under the chart: what was left of the month, or how much more went out than came in. */
  protected readonly balanceNote = computed(() => {
    const data = this.data();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return null;
    }

    const left = Number(data.income) - Number(data.expense);
    const when = this.days().isCurrent ? 'Este mes' : `En ${this.period.label().split(' ')[0].toLowerCase()}`;
    if (left < 0) {
      return { tone: 'bad', icon: 'trending_down', text: `${when} gastaste ${formatMoney(-left, currency)} más de lo que ingresaste.` };
    }
    return left > 0 ? { tone: 'good', icon: 'trending_up', text: `${when} te quedaron ${formatMoney(left, currency)} de lo que ingresaste.` } : null;
  });

  protected move(id: KpiId, step: -1 | 1): void {
    const order = [...this.order()];
    const from = order.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= order.length) {
      return;
    }
    [order[from], order[to]] = [order[to], order[from]];
    this.saveOrder(order);
  }

  protected remove(id: KpiId): void {
    this.saveOrder(this.order().filter((each) => each !== id));
  }

  protected add(id: KpiId): void {
    this.saveOrder([...this.order(), id]);
  }

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

  private named(id: KpiId, color: TileColor): Pick<Kpi, 'id' | 'label' | 'icon' | 'color'> {
    return { id, color, ...KPI_NAMES[id] };
  }

  private budgetKpi(budget: NonNullable<DashboardData['budget']>, currency: string): Kpi {
    const tone: Tone = Number(budget.spent) > Number(budget.limit) ? 'bad' : 'neutral';
    return {
      ...this.named('budget', 'amber'),
      value: `${Math.round(Number(budget.usedPercent))}% usado`,
      valueTone: tone,
      note: `${formatMoney(budget.spent, currency)} de ${formatMoney(budget.limit, currency)}`,
      noteTone: tone,
      bar: Math.min(100, Number(budget.usedPercent)),
    };
  }

  private readOrder(): readonly KpiId[] {
    try {
      const stored: unknown = JSON.parse(this.storage?.getItem(KPI_STORAGE_KEY) ?? 'null');
      return Array.isArray(stored) ? stored.filter((id): id is KpiId => KPI_IDS.includes(id)) : DEFAULT_KPIS;
    } catch {
      return DEFAULT_KPIS;
    }
  }

  private saveOrder(order: readonly KpiId[]): void {
    this.order.set(order);
    try {
      this.storage?.setItem(KPI_STORAGE_KEY, JSON.stringify(order));
    } catch {
      // Without storage the choice lasts until the page is closed.
    }
  }
}
