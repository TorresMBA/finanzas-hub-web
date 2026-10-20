import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { onMovementSaved } from '../../core/movements/movements-feed';
import { Account, CalendarItem, CalendarPeriod, Category, RecurringRule } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { PeriodStore } from '../../core/period/period-store';
import { formatDay, formatShortDate, monthRange, toIsoDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatCard } from '../../shared/ui/stat-card';
import { CalendarApi, FREQUENCY_LABELS, KIND_LOOK, RULE_STATUS_LABELS } from './calendar-api';
import { ScheduleForm, ScheduleFormTarget } from './schedule-form';
import { isManagedAccount } from '../../core/api/managed-accounts';

type Filter = 'all' | 'income' | 'expense' | 'recurring' | 'cards';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'recurring', label: 'Recurrentes' },
  { value: 'cards', label: 'Tarjetas' },
];

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const PILLS_PER_DAY = 2;

function matches(item: CalendarItem, filter: Filter): boolean {
  if (filter === 'cards') {
    return item.kind === 'cardDue' || item.kind === 'cardClosing';
  }

  return filter === 'all' || (filter === 'recurring' ? item.isRecurring : item.kind === filter);
}

/**
 * The month of the top bar day by day: what the person already registered, what they scheduled and what
 * their credit cards owe. Nothing is stored for this page; it is read from the ledger and worked out from
 * the rules every time. Private like the rest of their money.
 */
@Component({
  selector: 'app-calendar',
  imports: [EmptyState, ErrorState, Icon, MoneyPipe, PageHeader, ScheduleForm, Skeleton, StatCard],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Calendar {
  private readonly api = inject(CalendarApi);
  protected readonly period = inject(PeriodStore);

  protected readonly filters = FILTERS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly kindLook = KIND_LOOK;
  protected readonly frequencyLabels = FREQUENCY_LABELS;
  protected readonly ruleStatusLabels = RULE_STATUS_LABELS;
  protected readonly formatDay = formatDay;
  protected readonly formatShortDate = formatShortDate;

  private readonly range = computed(() => {
    const { year, month } = this.period.month();
    return monthRange(year, month);
  });
  protected readonly calendar = httpResource<CalendarPeriod>(() => this.api.calendarUrl(this.range()));
  protected readonly rules = httpResource<RecurringRule[]>(() => this.api.rulesUrl());
  protected readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());
  private readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());

  protected readonly filter = signal<Filter>('all');
  private readonly chosenDay = signal<string | null>(null);
  protected readonly formTarget = signal<ScheduleFormTarget | null>(null);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly currency = computed(() => this.calendar.value()?.baseCurrency ?? '');
  protected readonly today = computed(() => this.calendar.value()?.today ?? '');

  private readonly items = computed(() => (this.calendar.value()?.items ?? []).filter((item) => matches(item, this.filter())));
  private readonly byDay = computed(() => {
    const days = new Map<string, CalendarItem[]>();
    for (const item of this.items()) {
      days.set(item.date, [...(days.get(item.date) ?? []), item]);
    }

    return days;
  });

  /** The day in the side panel: the one the person chose while it is in the month shown, otherwise today or the first. */
  protected readonly selectedDay = computed(() => {
    const { from, to } = this.range();
    const chosen = this.chosenDay();
    if (chosen && chosen >= from && chosen <= to) {
      return chosen;
    }

    const today = this.today();
    return today >= from && today <= to ? today : from;
  });

  /** The month as weeks from Monday to Sunday; the days of other months are empty cells. */
  protected readonly weeks = computed(() => {
    const { year, month } = this.period.month();
    const days = new Date(year, month, 0).getDate();
    const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const cells: ({ date: string; day: number; pills: CalendarItem[]; more: number } | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= days; day++) {
      const date = toIsoDate(new Date(year, month - 1, day));
      const items = this.byDay().get(date) ?? [];
      cells.push({ date, day, pills: items.slice(0, PILLS_PER_DAY), more: Math.max(0, items.length - PILLS_PER_DAY) });
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
  });

  protected readonly dayItems = computed(() => this.byDay().get(this.selectedDay()) ?? []);

  /** What the selected day adds or takes, per currency: income minus expenses. Transfers and card payments move money, they do not change it. */
  protected readonly dayNet = computed(() => {
    const totals = new Map<string, number>();
    for (const item of this.dayItems()) {
      const sign = item.kind === 'income' ? 1 : item.kind === 'expense' ? -1 : 0;
      totals.set(item.currency, (totals.get(item.currency) ?? 0) + sign * Number(item.amount));
    }

    return Array.from(totals, ([currency, amount]) => formatMoney(amount, currency, { signed: true })).join(' · ');
  });

  /** What is still to be paid or received from today on, the soonest first. */
  protected readonly upcoming = computed(() =>
    (this.calendar.value()?.items ?? []).filter((item) => item.status !== 'confirmed' && item.date >= this.today()).slice(0, 6),
  );

  protected readonly stats = computed(() => {
    const data = this.calendar.value();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return [];
    }

    return [
      { label: 'Ingresos del mes', value: formatMoney(data.incomeReceived, currency), icon: 'south_west', color: 'green' as const },
      { label: 'Pagos pendientes', value: formatMoney(data.pendingExpenses, currency), icon: 'event_upcoming', color: 'amber' as const },
      {
        label: 'Saldo proyectado',
        value: data.projectedBalance === null ? '—' : formatMoney(data.projectedBalance, currency),
        icon: 'trending_up',
        color: 'blue' as const,
      },
    ];
  });

  /** The rules that still mean something: the ended ones are history. */
  protected readonly liveRules = computed(() => (this.rules.value() ?? []).filter((rule) => rule.status !== 'ended'));

  /** A day of the cycle of a card: a date to keep in mind, neither registered nor to be confirmed. */
  protected readonly isCardDate = (item: CalendarItem) => item.kind === 'cardDue' || item.kind === 'cardClosing';

  protected selectDay(date: string): void {
    this.chosenDay.set(date);
  }

  protected openForm(): void {
    if (!(this.accounts.value() ?? []).some((account) => !isManagedAccount(account.type))) {
      this.notice.set(null);
      this.failure.set('Crea primero una cuenta: un movimiento programado necesita saber de dónde sale o a dónde llega el dinero.');
      return;
    }

    this.formTarget.set({ categories: this.categories.value() ?? [], date: this.selectedDay() });
    // The balances may have changed since the page loaded: the dialog shows them as they are now.
    this.accounts.reload();
  }

  protected onSaved(message: string): void {
    this.formTarget.set(null);
    this.failure.set(null);
    this.notice.set(message);
    this.reload();
  }

  protected confirm(item: CalendarItem): Promise<void> {
    return this.run(`«${item.description}» registrado.`, () => this.api.confirm(item.ruleId!, item.date));
  }

  protected skip(item: CalendarItem): Promise<void> {
    return this.run(`«${item.description}» omitido esta vez.`, () => this.api.skip(item.ruleId!, item.date));
  }

  protected changeStatus(rule: RecurringRule, change: 'pause' | 'resume' | 'end'): Promise<void> {
    const done = { pause: 'en pausa', resume: 'reanudada', end: 'terminada: ya no espera más fechas' }[change];
    return this.run(`«${rule.description}» ${done}.`, () => this.api.changeStatus(rule.id, change));
  }

  constructor() {
    // A movement registered from the quick button shows on its day.
    onMovementSaved(() => this.reload());
  }

  protected reload(): void {
    this.calendar.reload();
    this.rules.reload();
  }

  private async run(success: string, action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      await action();
      this.notice.set(success);
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
      this.reload();
    }
  }
}
