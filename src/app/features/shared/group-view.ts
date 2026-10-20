import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { SharedDebt, SharedDebtItem, SharedExpense, SharedGroupDetail, SharedSettlement } from '../../core/api/api-types';
import { TODAY } from '../../core/period/period-store';
import { formatShortDate, toIsoDate } from '../../shared/ui/dates';
import { Icon } from '../../shared/ui/icon';
import { MoneyPipe, formatMoney, sumAmounts } from '../../shared/ui/money';
import { Sign, chipOf, figuresOf, initials, live, signOf, signed, toneOf } from './balances';
import { GROUP_ICONS, STATUS_LOOK } from './shared-api';

type Tab = 'balances' | 'activity' | 'members';
type ActivityFilter = 'all' | 'expenses' | 'payments' | 'unlinked';

/** A debt to pay or collect: all of it, or one of the expenses it is made of. */
export interface SettleRequest {
  readonly debt: SharedDebt;
  readonly item: SharedDebtItem | null;
}

/** What the balance of the person asking means, under its figure. */
const BALANCE_NOTES: Readonly<Record<Sign, string>> = { pos: 'Te deben', neg: 'Debes', even: 'A mano' };

const ACTIVITY_FILTERS: readonly { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'expenses', label: 'Gastos' },
  { value: 'payments', label: 'Pagos' },
];

/** What an expense did to the balance of the person asking, as its row says it. */
function effectOf(expense: SharedExpense, me: string, currency: string): { text: string; sign: Sign } {
  if (expense.status === 'cancelled' || expense.status === 'settled') {
    return { text: STATUS_LOOK[expense.status].label, sign: 'even' };
  }

  const share = Number(expense.myShare);
  if (expense.paidByUserId === me) {
    return { text: `Prestaste ${formatMoney(Number(expense.totalAmount) - share, currency)}`, sign: 'pos' };
  }

  const pending = Number(expense.myPending);
  if (pending > 0) {
    return { text: `Debes ${formatMoney(pending, currency)}`, sign: 'neg' };
  }

  return { text: share > 0 ? 'Pagaste tu parte' : 'No te afecta', sign: 'even' };
}

/** What an expense meant for the person asking, and who has repaid their part of it. */
function expenseItem(expense: SharedExpense, me: string, currency: string) {
  const payer = expense.paidByUserId === me ? 'Pagaste tú' : `Pagó ${expense.paidByName}`;
  return {
    expense,
    cancelled: expense.status === 'cancelled',
    note: `${payer} · tu parte ${formatMoney(Number(expense.myShare), currency)}${expense.canLinkAccount ? ' · Sin registrar en tu cuenta' : ''}`,
    effect: effectOf(expense, me, currency),
    shares: expense.shares.map((part) => {
      const isPayer = part.userId === expense.paidByUserId;
      const owes = isPayer ? 0 : Number(part.amount) - Number(part.paidAmount);
      return {
        ...part,
        initials: initials(part.displayName),
        tone: toneOf(part.userId, me),
        isMe: part.userId === me,
        isPayer,
        owes,
        meter: isPayer || Number(part.amount) === 0 ? 100 : (Number(part.paidAmount) / Number(part.amount)) * 100,
      };
    }),
  };
}

function paymentItem(settlement: SharedSettlement, me: string, currency: string) {
  const iPaid = settlement.fromUserId === me;
  const effect: { text: string; sign: Sign } = settlement.isVoided
    ? { text: 'Sin efecto', sign: 'even' }
    : { text: `${iPaid ? 'Saldaste' : 'Recibiste'} ${formatMoney(settlement.amount, currency)}`, sign: 'pos' };
  return {
    settlement,
    title: `${iPaid ? 'Tú' : settlement.fromName} → ${settlement.toUserId === me ? 'ti' : settlement.toName}`,
    note: settlement.isVoided ? 'Pago anulado' : 'Pago registrado',
    effect,
  };
}

/**
 * One group as the person sees it: where they stand in it, what they have to pay or collect and with whom, who
 * put how much, the activity by day and its members. With each of the others, only what is between the two.
 */
@Component({
  selector: 'app-group-view',
  imports: [Icon, MoneyPipe, NgTemplateOutlet],
  templateUrl: './group-view.html',
  styleUrl: './group-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupView {
  private readonly today = inject(TODAY);

  readonly detail = input.required<SharedGroupDetail>();
  readonly me = input.required<string>();
  readonly busy = input(false);
  /** The members of the workspace, to add to the group. */
  readonly workspaceMembers = input<readonly { userId: string; displayName: string }[]>([]);

  readonly settle = output<SettleRequest>();
  readonly remind = output<SharedDebt>();
  readonly cancelExpense = output<SharedExpense>();
  /** Asks to put an expense the person paid in one of their accounts. */
  readonly linkExpense = output<SharedExpense>();
  readonly voidSettlement = output<SharedSettlement>();
  readonly linkAccount = output<SharedSettlement>();
  readonly addMember = output<{ userId: string; name: string }>();
  readonly removeMember = output<{ userId: string; name: string }>();
  readonly archive = output<void>();
  /** The glyph chosen for the group. Only who created it sees the choice. */
  readonly changeIcon = output<string>();

  /** The filters of the activity; "Sin registrar" only while some expense of the person is not in their accounts. */
  protected readonly activityFilters = computed(() => {
    const unlinked = this.detail().expenses.filter((expense) => expense.canLinkAccount).length;
    return unlinked > 0 ? [...ACTIVITY_FILTERS, { value: 'unlinked' as const, label: `Sin registrar · ${unlinked}` }] : ACTIVITY_FILTERS;
  });

  /** The filter in use: once the last expense is registered, "Sin registrar" goes and everything shows again. */
  protected readonly shownFilter = computed<ActivityFilter>(() => {
    const filter = this.activityFilter();
    return this.activityFilters().some((option) => option.value === filter) ? filter : 'all';
  });
  protected readonly groupIcons = GROUP_ICONS;
  protected readonly initials = initials;

  private readonly groupId = computed(() => this.detail().group.id);
  /** Another group starts again from its balances. */
  protected readonly tab = linkedSignal<string, Tab>({ source: this.groupId, computation: () => 'balances' });
  protected readonly activityFilter = linkedSignal<string, ActivityFilter>({ source: this.groupId, computation: () => 'all' });
  protected readonly inviting = linkedSignal<string, boolean>({ source: this.groupId, computation: () => false });
  protected readonly showVoided = signal(false);

  protected readonly currency = computed(() => this.detail().group.currency);
  protected readonly open = computed(() => this.detail().group.status === 'active');

  protected readonly head = computed(() => {
    const detail = this.detail();
    const currency = this.currency();
    const figures = figuresOf(detail, this.me());
    const chip = chipOf(figures.balance, currency);
    const even: Sign = 'even';
    return {
      chip,
      memberNames: detail.members.map((member) => (member.isMe ? `${member.displayName} (tú)` : member.displayName)).join(', '),
      metrics: [
        { label: 'Total gastado', value: formatMoney(figures.total, currency), note: figures.count === 1 ? '1 gasto en que participas' : `${figures.count} gastos en que participas`, sign: even },
        { label: 'Tu parte', value: formatMoney(figures.share, currency), note: 'Lo que te toca de esos gastos', sign: even },
        { label: 'Pagaste', value: formatMoney(figures.paid, currency), note: 'De tu bolsillo', sign: even },
        { label: 'Tu balance', value: signed(figures.balance, currency), note: BALANCE_NOTES[chip.sign], sign: chip.sign },
      ],
    };
  });

  /** What the person asking has to pay or collect in the group, with each person. */
  protected readonly debts = computed(() => {
    const me = this.me();
    const currency = this.currency();
    return this.detail().debts.map((debt) => {
      const iPay = debt.fromUserId === me;
      const items = debt.items;
      const several = items.length > 1;
      // One expense needs no breakdown: paying all of it is paying that one.
      let note = iPay ? 'Pendiente de tu parte' : 'Pendiente de cobro';
      if (items.length === 1) {
        note = `Por «${items[0].description}»`;
      } else if (several) {
        note = `${items.length} gastos pendientes`;
      }

      let all = several ? 'Cobrar todo' : 'Marcar recibido';
      if (iPay) {
        all = several ? 'Pagar todo' : 'Registrar pago';
      }

      return {
        debt,
        iPay,
        from: { initials: initials(debt.fromName), tone: toneOf(debt.fromUserId, me) },
        to: { initials: initials(debt.toName), tone: toneOf(debt.toUserId, me) },
        text: iPay ? `Tú le pagas a ${debt.toName}` : `${debt.fromName} te paga`,
        note,
        all,
        breakdown: several
          ? items.map((item) => {
              const partial = Number(item.pending) < Number(item.amount);
              return {
                item,
                day: formatShortDate(item.occurredOn),
                // "S/ 30.00 de S/ 50.00" once part of it was repaid.
                amount: partial ? `${formatMoney(item.pending, currency)} de ${formatMoney(item.amount, currency)}` : formatMoney(item.pending, currency),
                partial,
                meter: (1 - Number(item.pending) / Number(item.amount)) * 100,
                action: iPay ? 'Pagar este' : 'Cobrar este',
              };
            })
          : [],
      };
    });
  });

  /**
   * How much each member paid of the expenses the person asking takes part in, against the part they had to
   * put. With each of the others, the balance is only what is between the two.
   */
  protected readonly members = computed(() => {
    const detail = this.detail();
    const me = this.me();
    const currency = this.currency();
    const expenses = detail.expenses.filter(live);
    const rows = detail.members.map((member) => ({
      member,
      paid: sumAmounts(expenses.filter((expense) => expense.paidByUserId === member.userId).map((expense) => expense.totalAmount)),
      share: sumAmounts(expenses.flatMap((expense) => expense.shares.filter((share) => share.userId === member.userId).map((share) => share.amount))),
    }));
    const max = Math.max(...rows.map((row) => Math.max(row.paid, row.share)), 0) || 1;
    return rows.map(({ member, paid, share }) => {
      const sign = signOf(Number(member.balance));
      const amount = formatMoney(Math.abs(Number(member.balance)), currency);
      const statuses: Record<Sign, string> = member.isMe
        ? { pos: `Te deben ${amount}`, neg: `Debes ${amount}`, even: 'A mano' }
        : { pos: `Te debe ${amount}`, neg: `Le debes ${amount}`, even: 'A mano contigo' };
      const status = statuses[sign];
      return {
        member,
        name: member.isMe ? `${member.displayName} (tú)` : member.displayName,
        initials: initials(member.displayName),
        tone: toneOf(member.userId, me),
        paid: formatMoney(paid, currency),
        width: (paid / max) * 100,
        mark: (share / max) * 100,
        sign,
        status,
      };
    });
  });

  protected readonly hasExpenses = computed(() => this.detail().expenses.some(live));

  /** Expenses and payments of the person asking, by day, newest first. */
  protected readonly days = computed(() => {
    const detail = this.detail();
    const me = this.me();
    const currency = this.currency();
    const filter = this.shownFilter();
    const today = toIsoDate(this.today());
    const items: { key: string; day: string; at: string; expense?: ReturnType<typeof expenseItem>; payment?: ReturnType<typeof paymentItem> }[] = [];
    if (filter !== 'payments') {
      for (const expense of detail.expenses.filter((candidate) => filter !== 'unlinked' || candidate.canLinkAccount)) {
        items.push({ key: `e-${expense.id}`, day: expense.occurredOn, at: expense.createdAt, expense: expenseItem(expense, me, currency) });
      }
    }
    if (filter === 'all' || filter === 'payments') {
      for (const settlement of detail.settlements.filter((settlement) => this.showVoided() || !settlement.isVoided)) {
        items.push({ key: `p-${settlement.id}`, day: settlement.occurredOn, at: settlement.createdAt, payment: paymentItem(settlement, me, currency) });
      }
    }
    // Newest first: by day, and within a day by when each was registered, expenses and payments mixed.
    const newestFirst = [...items].sort((a, b) => b.day.localeCompare(a.day) || Date.parse(b.at) - Date.parse(a.at));
    const byDay = new Map<string, typeof items>();
    for (const item of newestFirst) {
      byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
    }
    return [...byDay.entries()].map(([day, dayItems]) => ({
      day,
      label: `${day === today ? 'HOY · ' : ''}${formatShortDate(day).toUpperCase()}`,
      items: dayItems,
    }));
  });

  protected readonly voidedCount = computed(() => this.detail().settlements.filter((settlement) => settlement.isVoided).length);

  /** The members of the workspace who are not in the group yet. */
  protected readonly candidates = computed(() => {
    const inGroup = new Set(this.detail().members.map((member) => member.userId));
    return this.workspaceMembers().filter((member) => !inGroup.has(member.userId));
  });

  protected add(userId: string, name: string): void {
    this.inviting.set(false);
    this.addMember.emit({ userId, name });
  }
}
