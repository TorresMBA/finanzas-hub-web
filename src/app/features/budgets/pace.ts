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

type Money = (amount: number) => string;

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
const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/** The figures of a month that the summary is written from. */
interface MonthTotals {
  readonly pace: MonthPace;
  readonly limit: number;
  readonly spent: number;
  readonly pending: number;
  readonly ideal: number;
  readonly left: number;
  /** What will be left once the fixed payments still to come are paid. */
  readonly close: number;
  readonly behind: number;
  readonly perDay: number;
}

function totalsOf(month: BudgetMonth): MonthTotals {
  const pace = paceOf(month);
  const limit = Number(month.limit);
  const spent = Number(month.spent);
  const pending = sum(month.budgets.map((budget) => pendingOf(budget, pace)));
  const ideal = sum(month.budgets.map((budget) => idealOf(budget, pace)));
  const left = limit - spent;
  const close = left - pending;
  const perDay = close > 0 && pace.daysLeft > 0 ? close / pace.daysLeft : 0;
  return { pace, limit, spent, pending, ideal, left, close, behind: spent - ideal, perDay };
}

function monthBar(month: BudgetMonth, totals: MonthTotals): Bar {
  const { pace, limit, spent, pending, ideal, behind } = totals;
  const variable = sum(month.budgets.filter((budget) => !budget.isFixed).map((budget) => Number(budget.limit)));
  const scale = Math.max(limit, spent + pending) || 1;
  let level: Bar['level'] = null;
  if (spent > limit) {
    level = 'over';
  } else if (pace.running && behind > (variable * RISK_MARGIN) / 100) {
    level = 'warn';
  }

  return {
    spent: share(Math.min(spent, scale), scale),
    over: 0,
    pending: share(pending, scale),
    paceMark: pace.running ? share(ideal, scale) : null,
    limitMark: share(limit, scale),
    level,
  };
}

function closedNote(totals: MonthTotals, money: Money): Note {
  return totals.left < 0
    ? { tone: 'over', icon: 'error', title: `Cerraste el mes ${money(-totals.left)} por encima del presupuesto`, text: 'Revisa qué categorías se pasaron para ajustar sus límites.' }
    : { tone: 'ok', icon: 'check_circle', title: 'Cerraste el mes dentro del presupuesto', text: `Te sobraron ${money(totals.left)}.` };
}

function runningNote(totals: MonthTotals, money: Money): Note {
  const { pace, left, close, behind, pending, perDay } = totals;
  if (left < 0) {
    return { tone: 'over', icon: 'error', title: 'Pasaste el presupuesto del mes', text: `Gastaste ${money(-left)} más de lo presupuestado y aún quedan ${days(pace.daysLeft)}.` };
  }

  if (close < 0) {
    const ahead = behind > 0 ? ` (hoy vas ${money(behind)} sobre el ritmo ideal)` : '';
    return {
      tone: 'over',
      icon: 'error',
      title: 'Tus fijos pendientes no entran en lo que te queda',
      text: `Te quedan ${money(left)} y aún debes pagar ${money(pending)} en fijos. Si no ajustas, cerrarás el mes ${money(-close)} por encima del presupuesto${ahead}.`,
    };
  }

  if (behind > 0) {
    return {
      tone: 'warn',
      icon: 'speed',
      title: `Vas ${money(behind)} por encima del ritmo ideal`,
      text: `Para terminar dentro del límite, gasta como máximo ${money(perDay)} por día hasta fin de mes.`,
    };
  }

  return { tone: 'ok', icon: 'check_circle', title: 'Vas dentro del ritmo', text: `Puedes gastar hasta ${money(perDay)} por día y cerrar el mes en tu límite.` };
}

/** How the month is going, in one sentence. Nothing for a month still to come. */
function monthNote(totals: MonthTotals, money: Money): Note | null {
  if (totals.pace.closed) {
    return closedNote(totals, money);
  }

  return totals.pace.running ? runningNote(totals, money) : null;
}

function pendingNote(month: BudgetMonth, pace: MonthPace): string {
  if (pace.closed) {
    return 'Mes cerrado';
  }

  const unpaid = month.budgets.filter((budget) => pendingOf(budget, pace) > 0).length;
  if (unpaid > 0) {
    return plural(unpaid, 'pago fijo pendiente', 'pagos fijos pendientes');
  }

  return month.budgets.some((budget) => budget.isFixed) ? 'Todo pagado' : 'Sin pagos fijos';
}

function closeNote(totals: MonthTotals): string {
  if (totals.close < 0) {
    return totals.pace.closed ? 'Sobre el límite' : 'Sobre el límite tras pagar fijos';
  }

  return totals.pace.closed ? 'Sin gastar' : 'Libre tras pagar fijos';
}

function perDayNote(totals: MonthTotals): string {
  const { pace, perDay } = totals;
  if (pace.closed) {
    return 'Mes cerrado';
  }

  if (perDay <= 0) {
    return 'Ya no hay margen este mes';
  }

  return pace.running ? `Durante los próximos ${days(pace.daysLeft)}, hoy incluido` : `Durante los ${days(pace.daysLeft)} del mes`;
}

function monthFigures(month: BudgetMonth, totals: MonthTotals, money: Money): Figure[] {
  const { pace, limit, pending, close, perDay } = totals;
  return [
    { label: 'Presupuestado', value: money(limit), note: plural(month.budgets.length, 'categoría', 'categorías'), tone: null },
    { label: 'Fijos por pagar', value: money(pending), note: pendingNote(month, pace), tone: pending > 0 ? 'warn' : null },
    { label: pace.closed ? 'Cierre del mes' : 'Cierre estimado', value: money(close), note: closeNote(totals), tone: close < 0 ? 'over' : 'ok' },
    { label: 'Disponible por día', value: money(perDay), note: perDayNote(totals), tone: null },
  ];
}

function whenOf(pace: MonthPace): string {
  if (pace.closed) {
    return 'Mes cerrado';
  }

  if (pace.day === 0) {
    return 'Aún no empieza';
  }

  const left = pace.daysLeft === 1 ? 'último día' : `quedan ${days(pace.daysLeft)}`;
  return `Día ${pace.day} de ${pace.daysInMonth} · ${left}`;
}

/** The summary of the month: what is left, the bar, the note that says how it is going and the four figures under it. */
export function monthView(month: BudgetMonth) {
  const currency = month.baseCurrency ?? '';
  const money: Money = (amount) => formatMoney(amount, currency);
  const totals = totalsOf(month);
  const { limit, spent } = totals;
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  return {
    left: money(totals.left),
    caption: `de ${money(limit)} · gastaste ${money(spent)} (${pct}%)`,
    when: whenOf(totals.pace),
    bar: monthBar(month, totals),
    legend: { spent: money(spent), pending: money(totals.pending), ideal: money(totals.ideal), limit: money(limit) },
    note: monthNote(totals, money),
    figures: monthFigures(month, totals, money),
  };
}

interface RowText {
  readonly message: string;
  readonly tone: Tone | null;
  readonly aside: string;
}

function overRowText(budget: Budget, pace: MonthPace, used: number, money: Money): RowText {
  const limit = Number(budget.limit);
  let aside = '';
  if (budget.isFixed) {
    aside = 'Pago fijo';
  } else if (pace.running) {
    aside = `Ritmo ideal hoy: ${money(idealOf(budget, pace))}`;
  }

  return { message: `${used}% usado · ${money(Number(budget.spent) - limit)} sobre el límite`, tone: 'over', aside };
}

function fixedRowText(budget: Budget, pace: MonthPace, money: Money): RowText {
  const pending = pendingOf(budget, pace);
  if (pending > 0) {
    return { message: `Por pagar ${money(pending)}`, tone: 'warn', aside: 'Pago fijo' };
  }

  const limit = Number(budget.limit);
  const spent = Number(budget.spent);
  // Nothing pending and not paid in full only happens in a month gone.
  return spent >= limit
    ? { message: 'Todo pagado este mes', tone: 'ok', aside: 'Pago fijo' }
    : { message: `Quedaron ${money(limit - spent)} sin pagar`, tone: null, aside: 'Pago fijo' };
}

function variableRowText(budget: Budget, pace: MonthPace, used: number, money: Money): RowText {
  return {
    message: `Te quedan ${money(Number(budget.limit) - Number(budget.spent))}`,
    tone: budget.status === 'atRisk' ? 'warn' : null,
    aside: pace.running ? `${used}% usado · ideal hoy ${Math.round(pace.pace)}%` : `${used}% usado`,
  };
}

/** A budget as a row of the list: its bar and the two sentences under it. */
export function rowOf(budget: Budget, pace: MonthPace) {
  const money: Money = (amount) => formatMoney(amount, budget.currency);
  const limit = Number(budget.limit);
  const spent = Number(budget.spent);
  const pending = pendingOf(budget, pace);
  const isOver = spent > limit;
  const scale = Math.max(limit, spent + pending) || 1;
  const used = Math.round(Number(budget.usedPercent));

  let text: RowText;
  if (isOver) {
    text = overRowText(budget, pace, used, money);
  } else if (budget.isFixed) {
    text = fixedRowText(budget, pace, money);
  } else {
    text = variableRowText(budget, pace, used, money);
  }

  let level: Bar['level'] = null;
  if (isOver) {
    level = 'over';
  } else if (budget.status === 'atRisk') {
    level = 'warn';
  }

  const bar: Bar = {
    spent: share(Math.min(spent, limit), scale),
    over: isOver ? share(spent - limit, scale) : 0,
    pending: share(pending, scale),
    paceMark: pace.running && !budget.isFixed && !isOver ? share(idealOf(budget, pace), scale) : null,
    limitMark: share(limit, scale),
    level,
  };
  return { bar, isOver, ...text };
}

function thirdFigure(budget: Budget, pace: MonthPace, money: Money): Figure {
  const remaining = Number(budget.remaining);
  if (Number(budget.spent) > Number(budget.limit)) {
    return { label: 'Excedido', value: money(-remaining), note: '', tone: 'over' };
  }

  if (budget.isFixed) {
    const pending = pendingOf(budget, pace);
    return { label: 'Por pagar', value: money(pending), note: '', tone: pending > 0 ? 'warn' : null };
  }

  return { label: 'Te queda', value: money(remaining), note: '', tone: 'ok' };
}

function fixedDetailText(budget: Budget, pace: MonthPace, money: Money): string {
  const pending = pendingOf(budget, pace);
  if (pending > 0) {
    return `Presupuesto de pagos fijos. Quedan ${money(pending)} por pagar este mes; ya están reservados en tu cierre estimado.`;
  }

  return Number(budget.spent) >= Number(budget.limit) ? 'Todos los pagos fijos del mes están registrados.' : 'Presupuesto de pagos fijos.';
}

function detailNote(budget: Budget, pace: MonthPace, daily: BudgetDetail['daily'] | undefined, money: Money): Omit<Note, 'title'> {
  const remaining = Number(budget.remaining);
  if (Number(budget.spent) > Number(budget.limit)) {
    return { tone: 'over', icon: 'error', text: overText(budget, pace, daily) };
  }

  if (budget.isFixed) {
    return { tone: 'info', icon: 'event_repeat', text: fixedDetailText(budget, pace, money) };
  }

  if (pace.closed) {
    return { tone: 'ok', icon: 'check_circle', text: `Cerraste el mes con ${money(remaining)} sin gastar.` };
  }

  const left = budget.dailyAllowance === null ? money(remaining) : `${money(Number(budget.dailyAllowance))} por día`;
  return budget.status === 'atRisk'
    ? { tone: 'warn', icon: 'speed', text: `Gastaste más rápido de lo previsto. Te quedan ${left}.` }
    : { tone: 'ok', icon: 'check_circle', text: `Vas en ritmo. Te quedan ${left}.` };
}

/** The figures of the side panel and the note under them. */
export function detailOf(budget: Budget, pace: MonthPace, daily: BudgetDetail['daily'] | undefined) {
  const money: Money = (amount) => formatMoney(amount, budget.currency);
  const spent = Number(budget.spent);
  const isOver = spent > Number(budget.limit);
  const figures: Figure[] = [
    { label: 'Gastado', value: money(spent), note: '', tone: isOver ? 'over' : null },
    { label: 'Límite', value: money(Number(budget.limit)), note: '', tone: null },
    thirdFigure(budget, pace, money),
  ];

  // Up to the next ten above what was spent, so the limit covers the month.
  const raiseTo = isOver ? Math.ceil(spent / 10) * 10 : null;
  return { figures, note: detailNote(budget, pace, daily, money), raiseTo };
}

/** The day the limit was passed and the biggest day of spending, when the days of the month are there to tell. */
function overText(budget: Budget, pace: MonthPace, daily: BudgetDetail['daily'] | undefined): string {
  const money: Money = (amount) => formatMoney(amount, budget.currency);
  const fallback = `Excediste el límite por ${money(-Number(budget.remaining))}.`;
  if (!daily || daily.length === 0) {
    return fallback;
  }

  let total = 0;
  const passed = daily.find((day) => (total += Number(day.amount)) > Number(budget.limit));
  if (!passed) {
    return fallback;
  }

  const peak = daily.reduce((best, day) => (Number(day.amount) > Number(best.amount) ? day : best), daily[0]);
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
  const first = daily.at(0);
  const last = daily.at(-1);
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
    first: first ? formatShortDate(first.day) : '',
    last: last ? formatShortDate(last.day) : '',
  };
}
