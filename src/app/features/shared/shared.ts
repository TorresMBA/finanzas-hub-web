import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Account, Category, SharedDebt, SharedExpense, SharedGroupDetail, SharedGroupSummary, SharedGroups, SharedSettlement } from '../../core/api/api-types';
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
import { ExpenseForm, ExpenseFormTarget } from './expense-form';
import { GroupForm, GroupFormTarget } from './group-form';
import { SettlementForm, SettlementFormTarget } from './settlement-form';
import { STATUS_LOOK, SharedApi } from './shared-api';
import { isManagedAccount } from '../../core/api/managed-accounts';

type GroupFilter = 'all' | 'owed' | 'owe' | 'even' | 'archived';
type ExpenseFilter = 'all' | 'open' | 'settled';

const GROUP_FILTERS: readonly { value: GroupFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'owed', label: 'Me deben' },
  { value: 'owe', label: 'Debo' },
  { value: 'even', label: 'A mano' },
  { value: 'archived', label: 'Archivados' },
];

const EXPENSE_FILTERS: readonly { value: ExpenseFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'open', label: 'Por saldar' },
  { value: 'settled', label: 'Liquidados' },
];

/** From this many groups on, a box to find one by name is worth its place. */
const SEARCH_FROM = 6;
const AVATARS = 4;

/** "Brian Torres" → "BT". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

function matchesGroup(group: SharedGroupSummary, filter: GroupFilter): boolean {
  const archived = group.status === 'archived';
  switch (filter) {
    case 'archived':
      return archived;
    case 'owed':
      return !archived && Number(group.owedToMe) > 0;
    case 'owe':
      return !archived && Number(group.iOwe) > 0;
    case 'even':
      return !archived && Number(group.owedToMe) === 0 && Number(group.iOwe) === 0;
    default:
      return !archived;
  }
}

/**
 * The groups the person splits expenses in. The list says, group by group, whether they owe or are owed; the
 * detail starts from what there is to do with each person and then shows each expense with who has repaid
 * their part. A group is seen only by its members, and each member only the expenses and payments they take
 * part in. Nobody sees from which account anyone else paid.
 */
@Component({
  selector: 'app-shared',
  imports: [EmptyState, ErrorState, ExpenseForm, GroupForm, Icon, MoneyPipe, PageHeader, SettlementForm, Skeleton, StatCard],
  templateUrl: './shared.html',
  styleUrl: './shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-detail]': 'detailOpen()' },
})
export class Shared {
  private readonly api = inject(SharedApi);
  private readonly center = inject(NotificationCenter);
  private readonly session = inject(SessionStore);

  protected readonly groupFilters = GROUP_FILTERS;
  protected readonly expenseFilters = EXPENSE_FILTERS;
  protected readonly formatShortDate = formatShortDate;
  protected readonly initials = initials;
  protected readonly abs = (amount: number | string) => Math.abs(Number(amount));

  protected readonly groups = httpResource<SharedGroups>(() => this.api.groupsUrl());
  private readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());
  private readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());

  protected readonly groupFilter = signal<GroupFilter>('all');
  protected readonly expenseFilter = signal<ExpenseFilter>('all');
  protected readonly query = signal('');
  private readonly chosenId = signal<string | null>(null);

  /** On a phone the list and the detail take turns: this says which one is on screen. */
  protected readonly detailOpen = signal(false);

  protected readonly groupForm = signal<GroupFormTarget | null>(null);
  protected readonly expenseForm = signal<ExpenseFormTarget | null>(null);
  protected readonly settlementForm = signal<SettlementFormTarget | null>(null);
  protected readonly inviting = signal(false);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly all = computed(() => this.groups.value()?.groups ?? []);
  protected readonly showSearch = computed(() => this.all().length >= SEARCH_FROM);
  protected readonly filterCounts = computed(() => new Map(GROUP_FILTERS.map(({ value }) => [value, this.all().filter((group) => matchesGroup(group, value)).length])));

  /** The groups of the filter: the ones with more to settle on top. */
  protected readonly groupRows = computed(() => {
    const text = this.query().trim().toLowerCase();
    return this.all()
      .filter((group) => matchesGroup(group, this.groupFilter()))
      .filter((group) => text === '' || group.name.toLowerCase().includes(text))
      .map((group) => ({
        group,
        owed: Number(group.owedToMe),
        owe: Number(group.iOwe),
        avatars: group.memberNames.slice(0, AVATARS).map((name) => ({ name, initials: initials(name) })),
        more: Math.max(0, group.memberNames.length - AVATARS),
      }))
      .sort((a, b) => b.owed + b.owe - (a.owed + a.owe) || a.group.name.localeCompare(b.group.name));
  });

  /** The group on screen: the one the person chose while it exists, otherwise the first of the list. */
  protected readonly selectedId = computed(() => (this.all().find((group) => group.id === this.chosenId()) ?? this.groupRows()[0]?.group)?.id ?? null);
  protected readonly detail = httpResource<SharedGroupDetail>(() => this.api.detailUrl(this.selectedId()));

  protected readonly me = computed(() => this.session.user()?.id ?? '');

  /** What the person is owed and owes over all their groups, per currency: soles are not added to dollars. */
  protected readonly stats = computed(() =>
    (this.groups.value()?.totals ?? []).flatMap((total) => [
      { label: `Te deben (${total.currency})`, value: formatMoney(total.owedToMe, total.currency), icon: 'south_west', color: 'green' as const },
      { label: `Debes (${total.currency})`, value: formatMoney(total.iOwe, total.currency), icon: 'north_east', color: 'red' as const },
    ]),
  );

  /** One row per debt of the person: who it is with, which way it goes and what can be done about it. */
  protected readonly people = computed(() =>
    (this.detail.value()?.debts ?? []).map((debt) => {
      const iPay = debt.fromUserId === this.me();
      const name = iPay ? debt.toName : debt.fromName;
      return { debt, iPay, name, initials: initials(name) };
    }),
  );

  /** The expenses of the filter, each with what it means for the person and who has repaid their part. */
  protected readonly expenseRows = computed(() => {
    const filter = this.expenseFilter();
    const me = this.me();
    return (this.detail.value()?.expenses ?? [])
      .filter((expense) => filter === 'all' || (filter === 'settled' ? expense.status === 'settled' : expense.status === 'pending' || expense.status === 'partiallyPaid'))
      .map((expense) => {
        const iPaid = expense.paidByUserId === me;
        const others = expense.shares.filter((share) => share.userId !== expense.paidByUserId);
        return {
          expense,
          look: STATUS_LOOK[expense.status],
          iPaid,
          owedToMe: iPaid ? others.reduce((sum, share) => sum + Number(share.amount) - Number(share.paidAmount), 0) : 0,
          shares: expense.shares.map((share) => {
            const isPayer = share.userId === expense.paidByUserId;
            const pending = isPayer ? 0 : Number(share.amount) - Number(share.paidAmount);
            return {
              ...share,
              initials: initials(share.displayName),
              isPayer,
              isMe: share.userId === me,
              pending,
              meter: isPayer || Number(share.amount) === 0 ? 100 : (Number(share.paidAmount) / Number(share.amount)) * 100,
            };
          }),
        };
      });
  });

  /** The members of the workspace who are not in the group on screen yet. */
  protected readonly candidates = computed(() => {
    const inGroup = new Set((this.detail.value()?.members ?? []).map((member) => member.userId));
    return (this.groups.value()?.members ?? []).filter((member) => !inGroup.has(member.userId));
  });

  constructor() {
    // Another member registered an expense or a payment: the pages of everyone in the group catch up by themselves.
    effect(() => {
      if (this.center.resourceChanged()?.resource === 'shared-group') {
        this.reload();
      }
    });
  }

  protected select(groupId: string): void {
    this.chosenId.set(groupId);
    this.detailOpen.set(true);
    this.inviting.set(false);
    this.expenseFilter.set('all');
  }

  protected openGroupForm(): void {
    const data = this.groups.value();
    this.groupForm.set({ others: (data?.members ?? []).filter((member) => member.userId !== this.me()), currency: data?.baseCurrency ?? 'PEN' });
  }

  protected openExpenseForm(detail: SharedGroupDetail): void {
    this.expenseForm.set({ detail, accounts: this.usableAccounts(detail.group.currency), categories: this.categories.value() ?? [] });
  }

  /** Pays or collects a debt between the person and another member. */
  protected settle(detail: SharedGroupDetail, debt: SharedDebt): void {
    const iPay = debt.fromUserId === this.me();
    this.settlementForm.set({
      groupId: detail.group.id,
      currency: detail.group.currency,
      fromUserId: debt.fromUserId,
      toUserId: debt.toUserId,
      otherName: iPay ? debt.toName : debt.fromName,
      iPay,
      amount: Number(debt.amount),
      settlementId: null,
      accounts: this.accounts.value() ?? [],
      categories: this.categories.value() ?? [],
    });
  }

  /** Puts a payment that already exists in one of the accounts of the person. */
  protected linkAccount(detail: SharedGroupDetail, settlement: SharedSettlement): void {
    const iPay = settlement.fromUserId === this.me();
    this.settlementForm.set({
      groupId: detail.group.id,
      currency: detail.group.currency,
      fromUserId: settlement.fromUserId,
      toUserId: settlement.toUserId,
      otherName: iPay ? settlement.toName : settlement.fromName,
      iPay,
      amount: Number(settlement.amount),
      settlementId: settlement.id,
      accounts: this.accounts.value() ?? [],
      categories: this.categories.value() ?? [],
    });
  }

  protected onGroupSaved(saved: { groupId: string; message: string }): void {
    this.chosenId.set(saved.groupId);
    this.detailOpen.set(true);
    this.groupFilter.set('all');
    this.onSaved(saved.message);
  }

  protected onSaved(message: string): void {
    this.groupForm.set(null);
    this.expenseForm.set(null);
    this.settlementForm.set(null);
    this.failure.set(null);
    this.notice.set(message);
    this.reload();
  }

  protected remind(detail: SharedGroupDetail, debt: SharedDebt): Promise<void> {
    return this.run(`Le recordamos a ${debt.fromName} lo que te debe.`, () => this.api.remind(detail.group.id, debt.fromUserId));
  }

  protected cancelExpense(detail: SharedGroupDetail, expense: SharedExpense): Promise<void> {
    return this.run(`«${expense.description}» cancelado: ya nadie debe nada por él.`, () => this.api.cancelExpense(detail.group.id, expense.id));
  }

  protected voidSettlement(detail: SharedGroupDetail, settlement: SharedSettlement): Promise<void> {
    return this.run('Pago anulado: lo que cubría se vuelve a deber, y su movimiento en tu cuenta también se anuló.', () =>
      this.api.voidSettlement(detail.group.id, settlement.id),
    );
  }

  protected addMember(detail: SharedGroupDetail, userId: string, name: string): Promise<void> {
    this.inviting.set(false);
    return this.run(`${name} ya está en «${detail.group.name}».`, () => this.api.addMember(detail.group.id, userId));
  }

  protected removeMember(detail: SharedGroupDetail, userId: string, name: string): Promise<void> {
    return this.run(userId === this.me() ? `Saliste de «${detail.group.name}».` : `${name} ya no está en «${detail.group.name}».`, () =>
      this.api.removeMember(detail.group.id, userId),
    );
  }

  protected archive(detail: SharedGroupDetail): Promise<void> {
    return this.run(`«${detail.group.name}» archivado.`, () => this.api.archive(detail.group.id));
  }

  protected reload(): void {
    this.groups.reload();
    this.detail.reload();
    this.accounts.reload();
  }

  /** The accounts an expense of the group can be registered in: in its currency, and not the fund of a goal. */
  private usableAccounts(currency: string): Account[] {
    return (this.accounts.value() ?? []).filter((account) => !account.isArchived && account.currency === currency && !isManagedAccount(account.type));
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
