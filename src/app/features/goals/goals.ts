import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Account, Goal, GoalDetail, GoalList } from '../../core/api/api-types';
import { SessionStore } from '../../core/auth/session-store';
import { errorMessage } from '../../core/errors/error-messages';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { formatShortDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatCard } from '../../shared/ui/stat-card';
import { GoalForm, GoalFormTarget } from './goal-form';
import { GoalMoneyForm, GoalMoneyTarget } from './goal-money-form';
import { GoalsApi, HEALTH_LOOK } from './goals-api';

type Filter = 'active' | 'closed' | 'all';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'active', label: 'Activas' },
  { value: 'closed', label: 'Cerradas' },
  { value: 'all', label: 'Todas' },
];

const MONTH = new Intl.DateTimeFormat('es-PE', { month: 'short' });

/**
 * The goals the person saves for, alone or with other members of the workspace. A shared goal is seen only
 * by its participants; each one contributes from their own accounts and nobody sees the accounts of another.
 */
@Component({
  selector: 'app-goals',
  imports: [EmptyState, ErrorState, GoalForm, GoalMoneyForm, Icon, MoneyPipe, PageHeader, Skeleton, StatCard],
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Goals {
  private readonly api = inject(GoalsApi);
  private readonly center = inject(NotificationCenter);
  private readonly session = inject(SessionStore);

  protected readonly filters = FILTERS;
  protected readonly healthLook = HEALTH_LOOK;
  protected readonly formatShortDate = formatShortDate;

  protected readonly goals = httpResource<GoalList>(() => this.api.goalsUrl());
  private readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());

  protected readonly filter = signal<Filter>('active');
  private readonly chosenId = signal<string | null>(null);
  protected readonly formTarget = signal<GoalFormTarget | null>(null);
  protected readonly moneyTarget = signal<GoalMoneyTarget | null>(null);
  protected readonly confirming = signal<'archive' | 'cancel' | 'leave' | null>(null);
  protected readonly inviting = signal(false);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly all = computed(() => this.goals.value()?.goals ?? []);
  protected readonly rows = computed(() => {
    const filter = this.filter();
    return this.all()
      .filter((goal) => filter === 'all' || (goal.status === 'active') === (filter === 'active'))
      .map((goal) => ({ goal, look: HEALTH_LOOK[goal.health], meter: Math.min(100, Number(goal.percent)) }));
  });

  /** The goal in the side panel: the one the person chose while it is listed, otherwise the first. */
  protected readonly selected = computed(() => (this.rows().find((row) => row.goal.id === this.chosenId()) ?? this.rows()[0])?.goal ?? null);
  protected readonly detail = httpResource<GoalDetail>(() => this.api.detailUrl(this.selected()?.id ?? null));

  /** What went into the selected goal each of the last six months, as bars; a month of withdrawals shows empty. */
  protected readonly monthly = computed(() => {
    const months = this.detail.value()?.monthly ?? [];
    const tallest = Math.max(1, ...months.map((month) => Number(month.amount)));
    return months.map((month) => {
      const [year, number] = month.month.split('-').map(Number);
      return { month: month.month, label: MONTH.format(new Date(year, number - 1, 1)).replace('.', ''), height: (Math.max(0, Number(month.amount)) / tallest) * 100 };
    });
  });

  /** The members of the workspace who are not in the selected goal yet. */
  protected readonly candidates = computed(() => {
    const inGoal = new Set((this.selected()?.participants ?? []).map((participant) => participant.userId));
    return (this.goals.value()?.members ?? []).filter((member) => !inGoal.has(member.userId));
  });

  /** Saved in the open goals, per currency: amounts in different currencies are not added up. */
  protected readonly stats = computed(() => {
    const open = this.all().filter((goal) => goal.status === 'active');
    const byCurrency = new Map<string, number>();
    for (const goal of open) {
      byCurrency.set(goal.currency, (byCurrency.get(goal.currency) ?? 0) + Number(goal.saved));
    }

    return [
      ...Array.from(byCurrency, ([currency, saved]) => ({ label: `Ahorrado en ${currency}`, value: formatMoney(saved, currency), icon: 'savings', color: 'green' as const })),
      { label: 'Metas en camino', value: `${open.filter((goal) => goal.health === 'onTrack' || goal.health === 'completed').length} de ${open.length}`, icon: 'flag', color: 'blue' as const },
    ];
  });

  constructor() {
    // Another participant contributed, joined or left: the pages of everyone in the goal catch up by themselves.
    effect(() => {
      if (this.center.resourceChanged()?.resource === 'goal') {
        this.reload();
      }
    });
  }

  protected select(goal: Goal): void {
    this.chosenId.set(goal.id);
    this.confirming.set(null);
    this.inviting.set(false);
  }

  protected openCreate(): void {
    const data = this.goals.value();
    const me = this.session.user()?.id;
    this.formTarget.set({
      mode: 'create',
      currency: data?.baseCurrency ?? 'PEN',
      others: (data?.members ?? []).filter((member) => member.userId !== me),
    });
  }

  protected openEdit(goal: Goal): void {
    this.formTarget.set({ mode: 'edit', goal });
  }

  protected openMoney(goal: Goal, kind: 'contribute' | 'withdraw'): void {
    this.moneyTarget.set({ goal, kind, accounts: this.accounts.value() ?? [] });
  }

  protected onSaved(message: string): void {
    this.formTarget.set(null);
    this.moneyTarget.set(null);
    this.failure.set(null);
    this.notice.set(message);
    this.reload();
  }

  protected addParticipant(goal: Goal, userId: string, name: string): Promise<void> {
    this.inviting.set(false);
    return this.run(`${name} ya participa en «${goal.name}».`, () => this.api.addParticipant(goal.id, userId));
  }

  protected removeParticipant(goal: Goal, userId: string, name: string): Promise<void> {
    return this.run(`${name} ya no participa en «${goal.name}».`, () => this.api.removeParticipant(goal.id, userId));
  }

  protected confirm(goal: Goal): Promise<void> {
    const what = this.confirming();
    this.confirming.set(null);
    if (what === 'leave') {
      const me = goal.participants.find((participant) => participant.isMe)!;
      return this.run(`Saliste de «${goal.name}».`, () => this.api.removeParticipant(goal.id, me.userId));
    }

    return this.run(
      what === 'cancel' ? `«${goal.name}» cancelada. Cada quien puede retirar lo suyo.` : `«${goal.name}» archivada.`,
      () => this.api.close(goal.id, what === 'cancel' ? 'cancel' : 'archive'),
    );
  }

  protected reload(): void {
    this.goals.reload();
    this.detail.reload();
    this.accounts.reload();
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
