import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { Account, Category, SharedDebt, SharedExpense, SharedGroupDetail, SharedSettlement } from '../../core/api/api-types';
import { isManagedAccount } from '../../core/api/managed-accounts';
import { SessionStore } from '../../core/auth/session-store';
import { errorMessage } from '../../core/errors/error-messages';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { TODAY } from '../../core/period/period-store';
import { toIsoDate } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { formatMoney, sumAmounts } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { Sign, chipOf, figuresOf, initials, live, signOf, signed, toneOf } from './balances';
import { ExpenseForm, ExpenseFormTarget } from './expense-form';
import { GroupForm, GroupFormTarget } from './group-form';
import { GroupView } from './group-view';
import { SettlementForm, SettlementFormTarget } from './settlement-form';
import { SharedApi } from './shared-api';

const MONTH = new Intl.DateTimeFormat('es-PE', { month: 'short' });

/**
 * The groups the person splits expenses in. The summary says where they stand with each person and each group
 * over all of them; a group then shows what there is to pay or collect, who put how much, the activity and its
 * members. A group is seen only by its members, and each member only the expenses and payments they take part
 * in: what two others owe each other is theirs alone. Nobody sees from which account anyone else paid.
 */
@Component({
  selector: 'app-shared',
  imports: [Dialog, EmptyState, ErrorState, ExpenseForm, GroupForm, GroupView, Icon, NgTemplateOutlet, PageHeader, SettlementForm, Skeleton],
  templateUrl: './shared.html',
  styleUrl: './shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shared {
  private readonly api = inject(SharedApi);
  private readonly center = inject(NotificationCenter);
  private readonly session = inject(SessionStore);
  private readonly today = inject(TODAY);

  /** The list and every group behind it, in one go: a reload keeps what is on screen until the new data arrives. */
  protected readonly board = resource({
    params: () => this.api.groupsUrl(),
    loader: ({ params }) => this.api.board(params),
  });
  private readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());
  private readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());

  /** The group on screen; null is the summary of all of them. */
  private readonly chosenId = signal<string | null>(null);

  protected readonly groupForm = signal<GroupFormTarget | null>(null);
  protected readonly expenseForm = signal<ExpenseFormTarget | null>(null);
  protected readonly settlementForm = signal<SettlementFormTarget | null>(null);
  protected readonly choosingGroup = signal(false);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly me = computed(() => this.session.user()?.id ?? '');
  protected readonly list = computed(() => (this.board.hasValue() ? this.board.value().list : null));
  private readonly details = computed(() => (this.board.hasValue() ? [...this.board.value().details.values()] : []));
  protected readonly all = computed(() => this.list()?.groups ?? []);
  protected readonly active = computed(() => this.details().filter((detail) => detail.group.status === 'active'));
  private readonly archived = computed(() => this.details().filter((detail) => detail.group.status !== 'active'));

  /** The group chosen while it is still there: after leaving it, the page goes back to the summary. */
  protected readonly selected = computed(() => {
    const id = this.chosenId();
    return id === null || !this.board.hasValue() ? null : (this.board.value().details.get(id) ?? null);
  });

  /** A group was just created or chosen and is still on its way: nothing else should take its place meanwhile. */
  protected readonly waiting = computed(() => this.chosenId() !== null && this.selected() === null && this.board.isLoading());

  /** Where the person stands, per currency: soles are not added to dollars. */
  protected readonly kpis = computed(() => {
    const totals = this.list()?.totals ?? [];
    const me = this.me();
    const now = this.today();
    const month = toIsoDate(now).slice(0, 7);
    const monthName = MONTH.format(now).replace('.', '').toLowerCase();
    const plain: Sign = 'even';
    return totals.flatMap((total) => {
      const currency = total.currency;
      const suffix = totals.length > 1 ? ` (${currency})` : '';
      const groups = this.details().filter((detail) => detail.group.currency === currency);
      const debts = groups.flatMap((detail) => detail.debts);
      const creditors = new Set(debts.filter((debt) => debt.toUserId === me).map((debt) => debt.fromUserId));
      const owedTo = [...new Map(debts.filter((debt) => debt.fromUserId === me).map((debt) => [debt.toUserId, debt.toName])).values()];
      const ofMonth = groups.map((detail) => detail.expenses.filter((expense) => live(expense) && expense.occurredOn.startsWith(month)));
      const net = sumAmounts([total.owedToMe]) - sumAmounts([total.iOwe]);
      const groupCount = ofMonth.filter((expenses) => expenses.length > 0).length;
      return [
        {
          label: `Balance neto${suffix}`,
          icon: 'account_balance_wallet',
          tone: 'neutral',
          value: signed(net, currency),
          sign: signOf(net),
          note: signOf(net) === 'neg' ? 'Si todos saldan hoy, pagarías esto en total.' : 'Si todos saldan hoy, recibirías esto en total.',
        },
        {
          label: `Te deben${suffix}`,
          icon: 'south_west',
          tone: 'ac',
          value: formatMoney(total.owedToMe, currency),
          sign: plain,
          note: creditors.size === 0 ? 'Nadie te debe' : creditors.size === 1 ? '1 persona te debe' : `${creditors.size} personas te deben`,
        },
        {
          label: `Debes${suffix}`,
          icon: 'north_east',
          tone: 'rd',
          value: formatMoney(total.iOwe, currency),
          sign: plain,
          note: owedTo.length === 0 ? 'No le debes a nadie' : `A ${owedTo.join(', ')}`,
        },
        {
          label: `Tu parte del gasto · ${monthName}${suffix}`,
          icon: 'pie_chart',
          tone: 'vi',
          value: formatMoney(sumAmounts(ofMonth.flat().map((expense) => expense.myShare)), currency),
          sign: plain,
          note: `De ${formatMoney(sumAmounts(ofMonth.flat().map((expense) => expense.totalAmount)), currency)} gastados en ${groupCount} ${groupCount === 1 ? 'grupo' : 'grupos'}`,
        },
      ];
    });
  });

  /** The cards of the side list: the active groups, with more to settle on top. */
  protected readonly groupCards = computed(() => this.cardsOf(this.active()));
  protected readonly archivedCards = computed(() => this.cardsOf(this.archived()));

  /** Each person the person asking owes or is owed by, adding up every group of one currency. */
  protected readonly people = computed(() => {
    const me = this.me();
    const byPerson = new Map<string, { userId: string; name: string; currency: string; parts: { group: string; amount: number }[] }>();
    for (const detail of this.details()) {
      const currency = detail.group.currency;
      for (const debt of detail.debts) {
        const iPay = debt.fromUserId === me;
        const userId = iPay ? debt.toUserId : debt.fromUserId;
        const key = `${userId}|${currency}`;
        const person = byPerson.get(key) ?? { userId, name: iPay ? debt.toName : debt.fromName, currency, parts: [] };
        person.parts.push({ group: detail.group.name, amount: iPay ? -Number(debt.amount) : Number(debt.amount) });
        byPerson.set(key, person);
      }
    }
    return [...byPerson.entries()]
      .map(([key, person]) => {
        const amount = sumAmounts(person.parts.map((part) => part.amount));
        const sign = signOf(amount);
        return {
          key,
          name: person.name,
          initials: initials(person.name),
          tone: toneOf(person.userId, me),
          sign,
          label: sign === 'pos' ? 'Te debe' : sign === 'neg' ? 'Le debes' : 'A mano',
          amount: formatMoney(Math.abs(amount), person.currency),
          magnitude: Math.abs(amount),
          parts: person.parts.map((part) => `${part.group}: ${part.amount > 0 ? 'te debe' : 'le debes'} ${formatMoney(Math.abs(part.amount), person.currency)}`),
        };
      })
      .sort((a, b) => b.magnitude - a.magnitude || a.name.localeCompare(b.name));
  });

  /** One row per active group, and one total per currency. */
  protected readonly groupRows = computed(() =>
    this.active().map((detail) => {
      const figures = figuresOf(detail, this.me());
      const currency = detail.group.currency;
      return {
        id: detail.group.id,
        name: detail.group.name,
        currency,
        figures,
        total: formatMoney(figures.total, currency),
        share: formatMoney(figures.share, currency),
        paid: formatMoney(figures.paid, currency),
        balance: signed(figures.balance, currency),
        sign: signOf(figures.balance),
      };
    }),
  );

  protected readonly groupTotals = computed(() => {
    const rows = this.groupRows();
    const currencies = [...new Set(rows.map((row) => row.currency))];
    return currencies.map((currency) => {
      const ofCurrency = rows.filter((row) => row.currency === currency);
      const add = (pick: (row: (typeof rows)[number]) => number) => sumAmounts(ofCurrency.map(pick));
      const balance = add((row) => row.figures.balance);
      return {
        label: currencies.length > 1 ? `Total (${currency})` : 'Total',
        total: formatMoney(add((row) => row.figures.total), currency),
        share: formatMoney(add((row) => row.figures.share), currency),
        paid: formatMoney(add((row) => row.figures.paid), currency),
        balance: signed(balance, currency),
        sign: signOf(balance),
      };
    });
  });

  constructor() {
    // Another member registered an expense or a payment: the pages of everyone in the group catch up by themselves.
    effect(() => {
      if (this.center.resourceChanged()?.resource === 'shared-group') {
        this.reload();
      }
    });
  }

  protected showSummary(): void {
    this.chosenId.set(null);
  }

  protected select(groupId: string): void {
    this.chosenId.set(groupId);
  }

  protected openGroupForm(): void {
    const data = this.list();
    this.groupForm.set({ others: (data?.members ?? []).filter((member) => member.userId !== this.me()), currency: data?.baseCurrency ?? 'PEN' });
  }

  /** In the group on screen; from the summary, in the only active group, or in the one the person picks. */
  protected newExpense(): void {
    const detail = this.selected();
    const active = this.active();
    if (detail && detail.group.status === 'active') {
      this.openExpenseForm(detail);
    } else if (active.length === 1) {
      this.openExpenseForm(active[0]);
    } else {
      this.choosingGroup.set(true);
    }
  }

  protected openExpenseForm(detail: SharedGroupDetail): void {
    this.choosingGroup.set(false);
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
    this.select(saved.groupId);
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
    this.board.reload();
    this.accounts.reload();
  }

  private cardsOf(details: readonly SharedGroupDetail[]) {
    const me = this.me();
    return details
      .map((detail) => {
        const figures = figuresOf(detail, me);
        const members = Number(detail.group.memberCount);
        return {
          id: detail.group.id,
          name: detail.group.name,
          meta: `${members} ${members === 1 ? 'miembro' : 'miembros'} · ${figures.count} ${figures.count === 1 ? 'gasto' : 'gastos'}`,
          total: formatMoney(figures.total, detail.group.currency),
          chip: chipOf(figures.balance, detail.group.currency),
          weight: Number(detail.group.owedToMe) + Number(detail.group.iOwe),
        };
      })
      .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
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
