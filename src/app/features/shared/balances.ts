import { SharedExpense, SharedGroupDetail } from '../../core/api/api-types';
import { formatMoney, sumAmounts } from '../../shared/ui/money';

/** Which way a balance goes for the person: they are owed, they owe, or they are even. */
export type Sign = 'pos' | 'neg' | 'even';

/** The colour of a person's avatar: the person asking is always violet, the others keep theirs on every screen. */
export type Tone = 'vi' | 'bl' | 'am' | 'ac' | 'rd';

const OTHER_TONES: readonly Tone[] = ['bl', 'am', 'ac', 'rd'];

/** Less than half a cent is nothing owed. */
const EVEN = 0.005;

/** "Brian Torres" → "BT". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

export function toneOf(userId: string, me: string): Tone {
  if (userId === me) {
    return 'vi';
  }
  let hash = 0;
  for (const char of userId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return OTHER_TONES[hash % OTHER_TONES.length];
}

export function signOf(amount: number): Sign {
  return amount > EVEN ? 'pos' : amount < -EVEN ? 'neg' : 'even';
}

/** "+S/ 30.00", "−S/ 10.00", "S/ 0.00". */
export function signed(amount: number, currency: string): string {
  return formatMoney(signOf(amount) === 'even' ? 0 : amount, currency, { signed: true });
}

/** What a balance of the person asking means, as the chip of a group says it. */
export function chipOf(amount: number, currency: string): { sign: Sign; text: string } {
  const sign = signOf(amount);
  const text = sign === 'pos' ? `Te deben ${formatMoney(amount, currency)}` : sign === 'neg' ? `Debes ${formatMoney(-amount, currency)}` : 'A mano';
  return { sign, text };
}

export const live = (expense: SharedExpense) => expense.status !== 'cancelled';

/** What the person asking sees of a group added up: only the expenses they take part in reach them. */
export function figuresOf(detail: SharedGroupDetail, me: string) {
  const expenses = detail.expenses.filter(live);
  return {
    count: expenses.length,
    total: sumAmounts(expenses.map((expense) => expense.totalAmount)),
    share: sumAmounts(expenses.map((expense) => expense.myShare)),
    paid: sumAmounts(expenses.filter((expense) => expense.paidByUserId === me).map((expense) => expense.totalAmount)),
    balance: Number(detail.group.myBalance),
  };
}
