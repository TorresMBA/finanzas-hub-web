import { Budget, BudgetDetail, BudgetMonth } from '../../core/api/api-types';
import { formatShortDate } from '../../shared/ui/dates';
import { formatMoney } from '../../shared/ui/money';

/** The colours a state, a figure or a note of the page takes. */
export type Tone = 'ok' | 'warn' | 'over' | 'info';

/** How far ahead of the pace of the month the spending may run before it is at risk, in points, as the backend counts it. */
const RISK_MARGIN = 10;

/** Where the month stands on the day it is looked at. */
export interface MonthPace {
  readonly day: number;
  readonly daysInMonth: number;
  /** Today included. */
  readonly daysLeft: number;
  /** The share of the month gone, from 0 to 100. */
  readonly pace: number;
  readonly closed: boolean;
  readonly running: boolean;
}

/** A bar of spending: each part as a share of the bar, from 0 to 100, and the marks on it. */
export interface Bar {
  readonly spent: number;
  readonly over: number;
  readonly pending: number;
  readonly paceMark: number | null;
  readonly limitMark: number;
  readonly level: 'warn' | 'over' | null;
}

export interface Note {
  readonly tone: Tone;
  readonly icon: string;
  readonly title: string;
  readonly text: string;
}

export interface Figure {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly tone: Tone | null;
}

export function paceOf(month: BudgetMonth): MonthPace {
  const day = +month.day;
  const daysLeft = +month.daysLeft;
  return { day, daysInMonth: +month.daysInMonth, daysLeft, pace: Number(month.pacePercent), closed: daysLeft === 0, running: day > 0 && daysLeft > 0 };
}

/** What a fixed budget still has to pay this month. Nothing in a month gone: it is no longer going to be paid. */
export function pendingOf(budget: Budget, pace: MonthPace): number {
  return budget.isFixed && !pace.closed ? Math.max(0, Number(budget.remaining)) : 0;
}

/** What would be spent by today at an even pace. A fixed budget has no pace: what it already paid is what was expected. */
export function idealOf(budget: Budget, pace: MonthPace): number {
  return budget.isFixed ? Math.min(Number(budget.spent), Number(budget.limit)) : (Number(budget.limit) * pace.pace) / 100;
}

const share = (part: number, whole: number) => Math.max(0, Math.min(100, (part / whole) * 100));
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const days = (count: number) => (count === 1 ? '1 día' : `${count} días`);

/** The summary of the month: what is left, the bar, the note that says how it is going and the four figures under it. */
export function monthView(month: BudgetMonth) {
  const currency = month.baseCurrency ?? '';
  const money = (amount: number) => formatMoney(amount, currency);
  const pace = paceOf(month);
  const limit = Number(month.limit);
  const spent = Number(month.spent);
  const pendings = month.budgets.map((budget) => pendingOf(budget, pace));
  const pending = sum(pendings);
  const ideal = sum(month.budgets.map((budget) => idealOf(budget, pace)));
  const variable = sum(month.budgets.filter((budget) => !budget.isFixed).map((budget) => Number(budget.limit)));
  const left = limit - spent;
  // What will be left once the fixed payments still to come are paid.
  const close = left - pending;
  const behind = spent - ideal;
  const perDay = close > 0 && pace.daysLeft > 0 ? close / pace.daysLeft : 0;
  const scale = Math.max(limit, spent + pending) || 1;

  const bar: Bar = {
    spent: share(Math.min(spent, scale), scale),
    over: 0,
    pending: share(pending, scale),
    paceMark: pace.running ? share(ideal, scale) : null,
    limitMark: share(limit, scale),
    level: spent > limit ? 'over' : pace.running && behind > (variable * RISK_MARGIN) / 100 ? 'warn' : null,
  };

  let note: Note | null = null;
  if (pace.closed) {
    note =
      left < 0
        ? { tone: 'over', icon: 'error', title: `Cerraste el mes ${money(-left)} por encima del presupuesto`, text: 'Revisa qué categorías se pasaron para ajustar sus límites.' }
        : { tone: 'ok', icon: 'check_circle', title: 'Cerraste el mes dentro del presupuesto', text: `Te sobraron ${money(left)}.` };
  } else if (pace.running) {
    const ahead = behind > 0 ? ` (hoy vas ${money(behind)} sobre el ritmo ideal)` : '';
    if (left < 0) {
      note = { tone: 'over', icon: 'error', title: 'Pasaste el presupuesto del mes', text: `Gastaste ${money(-left)} más de lo presupuestado y aún quedan ${days(pace.daysLeft)}.` };
    } else if (close < 0) {
      note = {
        tone: 'over',
        icon: 'error',
        title: 'Tus fijos pendientes no entran en lo que te queda',
        text: `Te quedan ${money(left)} y aún debes pagar ${money(pending)} en fijos. Si no ajustas, cerrarás el mes ${money(-close)} por encima del presupuesto${ahead}.`,
      };
    } else if (behind > 0) {
      note = {
        tone: 'warn',
        icon: 'speed',
        title: `Vas ${money(behind)} por encima del ritmo ideal`,
        text: `Para terminar dentro del límite, gasta como máximo ${money(perDay)} por día hasta fin de mes.`,
      };
    } else {
      note = { tone: 'ok', icon: 'check_circle', title: 'Vas dentro del ritmo', text: `Puedes gastar hasta ${money(perDay)} por día y cerrar el mes en tu límite.` };
    }
  }

  const fixed = month.budgets.filter((budget) => budget.isFixed).length;
  const unpaid = pendings.filter((amount) => amount > 0).length;
  const count = month.budgets.length;
  const figures: Figure[] = [
    { label: 'Presupuestado', value: money(limit), note: count === 1 ? '1 categoría' : `${count} categorías`, tone: null },
    {
      label: 'Fijos por pagar',
      value: money(pending),
      note: pace.closed ? 'Mes cerrado' : unpaid > 0 ? (unpaid === 1 ? '1 pago fijo pendiente' : `${unpaid} pagos fijos pendientes`) : fixed > 0 ? 'Todo pagado' : 'Sin pagos fijos',
      tone: pending > 0 ? 'warn' : null,
    },
    {
      label: pace.closed ? 'Cierre del mes' : 'Cierre estimado',
      value: money(close),
      note: close < 0 ? (pace.closed ? 'Sobre el límite' : 'Sobre el límite tras pagar fijos') : pace.closed ? 'Sin gastar' : 'Libre tras pagar fijos',
      tone: close < 0 ? 'over' : 'ok',
    },
    {
      label: 'Disponible por día',
      value: money(perDay),
      note: pace.closed ? 'Mes cerrado' : perDay > 0 ? (pace.running ? `Durante los próximos ${days(pace.daysLeft)}, hoy incluido` : `Durante los ${days(pace.daysLeft)} del mes`) : 'Ya no hay margen este mes',
      tone: null,
    },
  ];

  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  return {
    left: money(left),
    caption: `de ${money(limit)} · gastaste ${money(spent)} (${pct}%)`,
    when: pace.closed ? 'Mes cerrado' : pace.day === 0 ? 'Aún no empieza' : `Día ${pace.day} de ${pace.daysInMonth} · ${pace.daysLeft === 1 ? 'último día' : `quedan ${days(pace.daysLeft)}`}`,
    bar,
    legend: { spent: money(spent), pending: money(pending), ideal: money(ideal), limit: money(limit) },
    note,
    figures,
  };
}

/** A budget as a row of the list: its bar and the two sentences under it. */
export function rowOf(budget: Budget, pace: MonthPace) {
  const money = (amount: number) => formatMoney(amount, budget.currency);
  const limit = Number(budget.limit);
  const spent = Number(budget.spent);
  const pending = pendingOf(budget, pace);
  const ideal = idealOf(budget, pace);
  const isOver = spent > limit;
  const scale = Math.max(limit, spent + pending) || 1;
  const used = Math.round(Number(budget.usedPercent));

  let message: string;
  let tone: Tone | null;
  let aside: string;
  if (isOver) {
    message = `${used}% usado · ${money(spent - limit)} sobre el límite`;
    tone = 'over';
    aside = pace.running && !budget.isFixed ? `Ritmo ideal hoy: ${money(ideal)}` : budget.isFixed ? 'Pago fijo' : '';
  } else if (budget.isFixed) {
    // Nothing pending and not paid in full only happens in a month gone.
    message = pending > 0 ? `Por pagar ${money(pending)}` : spent >= limit ? 'Todo pagado este mes' : `Quedaron ${money(limit - spent)} sin pagar`;
    tone = pending > 0 ? 'warn' : spent >= limit ? 'ok' : null;
    aside = 'Pago fijo';
  } else {
    message = `Te quedan ${money(limit - spent)}`;
    tone = budget.status === 'atRisk' ? 'warn' : null;
    aside = pace.running ? `${used}% usado · ideal hoy ${Math.round(pace.pace)}%` : `${used}% usado`;
  }

  const bar: Bar = {
    spent: share(Math.min(spent, limit), scale),
    over: isOver ? share(spent - limit, scale) : 0,
    pending: share(pending, scale),
    paceMark: pace.running && !budget.isFixed && !isOver ? share(ideal, scale) : null,
    limitMark: share(limit, scale),
    level: isOver ? 'over' : budget.status === 'atRisk' ? 'warn' : null,
  };
  return { bar, isOver, message, tone, aside };
}

/** The figures of the side panel and the note under them. */
export function detailOf(budget: Budget, pace: MonthPace, daily: BudgetDetail['daily'] | undefined) {
  const money = (amount: number) => formatMoney(amount, budget.currency);
  const limit = Number(budget.limit);
  const spent = Number(budget.spent);
  const remaining = Number(budget.remaining);
  const pending = pendingOf(budget, pace);
  const isOver = spent > limit;

  const figures: Figure[] = [
    { label: 'Gastado', value: money(spent), note: '', tone: isOver ? 'over' : null },
    { label: 'Límite', value: money(limit), note: '', tone: null },
    budget.isFixed && !isOver
      ? { label: 'Por pagar', value: money(pending), note: '', tone: pending > 0 ? 'warn' : null }
      : isOver
        ? { label: 'Excedido', value: money(-remaining), note: '', tone: 'over' }
        : { label: 'Te queda', value: money(remaining), note: '', tone: 'ok' },
  ];

  let note: Omit<Note, 'title'>;
  if (isOver) {
    note = { tone: 'over', icon: 'error', text: overText(budget, pace, daily) };
  } else if (budget.isFixed) {
    note = {
      tone: 'info',
      icon: 'event_repeat',
      text: pending > 0
        ? `Presupuesto de pagos fijos. Quedan ${money(pending)} por pagar este mes; ya están reservados en tu cierre estimado.`
        : spent >= limit ? 'Todos los pagos fijos del mes están registrados.' : 'Presupuesto de pagos fijos.',
    };
  } else if (pace.closed) {
    note = { tone: 'ok', icon: 'check_circle', text: `Cerraste el mes con ${money(remaining)} sin gastar.` };
  } else {
    const left = budget.dailyAllowance === null ? money(remaining) : `${money(Number(budget.dailyAllowance))} por día`;
    note = budget.status === 'atRisk'
      ? { tone: 'warn', icon: 'speed', text: `Gastaste más rápido de lo previsto. Te quedan ${left}.` }
      : { tone: 'ok', icon: 'check_circle', text: `Vas en ritmo. Te quedan ${left}.` };
  }

  // Up to the next ten above what was spent, so the limit covers the month.
  const raiseTo = isOver ? Math.ceil(spent / 10) * 10 : null;
  return { figures, note, raiseTo };
}

/** The day the limit was passed and the biggest day of spending, when the days of the month are there to tell. */
function overText(budget: Budget, pace: MonthPace, daily: BudgetDetail['daily'] | undefined): string {
  const money = (amount: number) => formatMoney(amount, budget.currency);
  const fallback = `Excediste el límite por ${money(-Number(budget.remaining))}.`;
  if (!daily || daily.length === 0) {
    return fallback;
  }

  let total = 0;
  const passed = daily.find((day) => (total += Number(day.amount)) > Number(budget.limit));
  const peak = daily.reduce((best, day) => (Number(day.amount) > Number(best.amount) ? day : best));
  if (!passed) {
    return fallback;
  }

  const ahead = pace.running && pace.daysLeft > 1 ? `, con ${days(pace.daysLeft - 1)} aún por delante` : '';
  return `Superaste el límite el ${formatShortDate(passed.day)}${ahead}. El mayor gasto fue el ${formatShortDate(peak.day)} (${money(Number(peak.amount))}).`;
}

export type ChartMode = 'cumulative' | 'daily';

/** The bars of the month, either what was spent each day or what had been spent by then, as a share of the tallest. */
export function chartOf(budget: Budget, daily: BudgetDetail['daily'], pace: MonthPace, mode: ChartMode) {
  const limit = Number(budget.limit);
  let running = 0;
  const points = daily.map((day, index) => {
    running += Number(day.amount);
    return { day: day.day, amount: Number(day.amount), total: running, future: pace.running && index + 1 > pace.day };
  });
  const values = points.map((point) => (mode === 'cumulative' ? point.total : point.amount));
  const top = Math.max(mode === 'cumulative' ? limit : 0, ...values) * 1.12 || 1;
  return {
    bars: points.map((point, index) => ({
      day: point.day,
      height: point.future ? 0 : share(values[index], top),
      isOver: point.total > limit,
      isEmpty: point.amount === 0,
      future: point.future,
    })),
    limitAt: mode === 'cumulative' ? share(limit, top) : null,
    todayAt: pace.running ? share(pace.day - 0.5, daily.length) : null,
    first: daily.length > 0 ? formatShortDate(daily[0].day) : '',
    last: daily.length > 0 ? formatShortDate(daily[daily.length - 1].day) : '',
  };
}
