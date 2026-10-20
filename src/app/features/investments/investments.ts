import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Account, HoldingDetail, HoldingSummary, InvestmentSummary, InvestmentType } from '../../core/api/api-types';
import { TODAY } from '../../core/period/period-store';
import { formatShortDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { IconTile } from '../../shared/ui/icon-tile';
import { AMOUNTS_HIDDEN, PrivateMoneyPipe, formatMoney } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { HoldingForm, HoldingFormTarget } from './holding-form';
import { InvestmentsApi, TYPE_LOOK, actionsFor, hasUnits } from './investments-api';

type Filter = 'all' | 'mutualFund' | 'termDeposit' | 'shares' | 'crypto' | 'closed';

const FILTERS: readonly { value: Filter; label: string; types: readonly InvestmentType[] | null }[] = [
  { value: 'all', label: 'Todas', types: null },
  { value: 'mutualFund', label: 'Fondos mutuos', types: ['mutualFund'] },
  { value: 'termDeposit', label: 'Depósitos a plazo', types: ['termDeposit'] },
  { value: 'shares', label: 'Acciones y ETFs', types: ['stock', 'etf'] },
  { value: 'crypto', label: 'Cripto', types: ['crypto'] },
  { value: 'closed', label: 'Cerradas', types: null },
];

const LONG_DATE = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });

/** The colours of the distribution bar, one per type. */
const TYPE_COLORS: Readonly<Record<InvestmentType, string>> = {
  mutualFund: 'var(--bl)',
  termDeposit: 'var(--ac)',
  stock: 'var(--vi)',
  etf: 'var(--vi)',
  crypto: 'var(--am)',
  other: 'var(--mu)',
};

/** "3 meses", "1 año y 2 meses" since a day. */
function age(from: string, today: Date): string {
  const [year, month] = from.split('-').map(Number);
  const months = (today.getFullYear() - year) * 12 + today.getMonth() + 1 - month;
  if (months < 1) {
    return 'Menos de un mes';
  }

  const [years, rest] = [Math.floor(months / 12), months % 12];
  const parts = [count(years, 'año', 'años'), count(rest, 'mes', 'meses')].filter(Boolean);
  return parts.join(' y ');
}

/** "1 año", "3 meses", or nothing for zero. */
function count(value: number, one: string, many: string): string {
  if (value <= 0) {
    return '';
  }

  return `${value} ${value === 1 ? one : many}`;
}

/** A movement in the words of its kind of investment: shares are bought and sold, a fund redeemed, the rest withdrawn. */
function movementLabel(type: InvestmentType, bought: boolean): string {
  if (hasUnits(type)) {
    return bought ? 'Compra' : 'Venta';
  }

  if (bought) {
    return 'Aporte';
  }

  return type === 'mutualFund' ? 'Rescate' : 'Retiro';
}

function gainSign(value: number): string {
  return value > 0 ? '+' : '';
}

function tone(value: number): 'good' | 'bad' | '' {
  if (value > 0) {
    return 'good';
  }

  return value < 0 ? 'bad' : '';
}

/**
 * The portfolio of the signed-in person: what it is worth, how it is spread and each investment with its last
 * twelve months. Money moves between their accounts and their investments as transfers, never as expenses.
 */
@Component({
  selector: 'app-investments',
  imports: [EmptyState, ErrorState, HoldingForm, IconTile, PageHeader, PrivateMoneyPipe, Skeleton],
  templateUrl: './investments.html',
  styleUrl: './investments.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Investments {
  private readonly amountsHidden = inject(AMOUNTS_HIDDEN);
  private readonly api = inject(InvestmentsApi);
  private readonly today = inject(TODAY);

  /** "Cerradas" shows only once something was withdrawn in full. */
  // `closed?.`: an API from before closed holdings does not send the list, and the page must still show
  protected readonly filters = computed(() => FILTERS.filter((option) => option.value !== 'closed' || (this.summary.value()?.closed?.length ?? 0) > 0));
  protected readonly typeLook = TYPE_LOOK;
  protected readonly shortDate = formatShortDate;

  protected readonly summary = httpResource<InvestmentSummary>(() => this.api.summaryUrl(null));
  protected readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());

  protected readonly filter = signal<Filter>('all');
  private readonly chosenId = signal<string | null>(null);
  protected readonly formTarget = signal<HoldingFormTarget | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const types = FILTERS.find((option) => option.value === this.filter())?.types;
    if (this.filter() === 'closed') {
      return this.summary.value()?.closed ?? [];
    }

    return (this.summary.value()?.holdings ?? []).filter((holding) => !types || types.includes(holding.type));
  });

  /** The investment in the detail panel: the chosen one while it is on screen, otherwise the first. */
  protected readonly selected = computed(() => this.visible().find((holding) => holding.id === this.chosenId()) ?? this.visible()[0] ?? null);
  protected readonly detail = httpResource<HoldingDetail>(() => this.api.detailUrl(this.selected()?.id ?? null));

  /** The words of the buttons for the selected investment: buy and sell shares, redeem a fund, withdraw a deposit. */
  protected readonly actions = computed(() => actionsFor(this.selected()?.type ?? 'other'));

  /** Movements and values written down, in one list, newest first, in the words of that kind of investment. */
  protected readonly history = computed(() => {
    const holding = this.selected();
    const detail = this.detail.value();
    if (!holding || !detail) {
      return [];
    }

    const withUnits = hasUnits(holding.type);
    const movements = detail.movements.map((movement) => {
      const quantity = withUnits && movement.quantity !== null ? `${Number(movement.quantity).toLocaleString('es-PE', { maximumFractionDigits: 8 })} u.` : null;
      return {
        id: movement.id,
        date: movement.occurredOn,
        label: movementLabel(holding.type, movement.kind === 'contribution'),
        note: [quantity, movement.accountName].filter(Boolean).join(' · '),
        amount: movement.amount,
        valuation: false,
      };
    });
    const valuations = detail.valuations.map((valuation) => ({
      id: valuation.id,
      date: valuation.onDate,
      label: withUnits ? 'Precio actualizado' : 'Valor actualizado',
      note: '',
      amount: valuation.value,
      valuation: true,
    }));
    // Within a day, by when each was registered: the ids are time ordered (UUID v7), so buys and new values mix as they happened.
    return [...movements, ...valuations].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  });

  protected readonly kpis = computed(() => {
    const data = this.summary.value();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return [];
    }

    const gain = Number(data.gain);
    const percent = data.gainPercent === null ? null : Number(data.gainPercent);
    return [
      { label: 'Valor del portafolio', value: formatMoney(data.value, currency, { hidden: this.amountsHidden() }), note: `${data.holdings.length} ${data.holdings.length === 1 ? 'inversión' : 'inversiones'}`, tone: '' },
      {
        label: 'Ganancia no realizada',
        value: formatMoney(gain, currency, { signed: true, hidden: this.amountsHidden() }),
        note: percent === null ? 'Sin capital invertido' : `${gainSign(percent)}${percent.toLocaleString('es-PE')} % sobre lo invertido`,
        tone: tone(gain),
      },
      { label: 'Invertido', value: formatMoney(data.invested, currency, { hidden: this.amountsHidden() }), note: 'Capital que pusiste y sigue dentro', tone: '' },
    ];
  });

  protected readonly distribution = computed(() =>
    (this.summary.value()?.distribution ?? []).map((share) => ({
      ...share,
      label: TYPE_LOOK[share.type].plural,
      color: TYPE_COLORS[share.type],
      width: Number(share.share),
    })),
  );

  protected readonly facts = computed(() => {
    const holding = this.selected();
    if (!holding) {
      return [];
    }

    const money = (amount: number | string | null) => (amount === null ? '—' : formatMoney(amount, holding.currency, { hidden: this.amountsHidden() }));
    const facts = [
      { label: 'Invertido', value: money(holding.invested) },
      { label: 'Tipo', value: `${TYPE_LOOK[holding.type].label}${holding.institution ? ' · ' + holding.institution : ''}` },
      { label: 'Antigüedad', value: age(holding.openedOn, this.today()) },
    ];
    if (holding.maturesOn) {
      facts.push(
        { label: 'Vence', value: LONG_DATE.format(new Date(`${holding.maturesOn}T00:00:00`)).replace('.', '') },
        { label: 'TEA', value: `${Number(holding.annualRate).toLocaleString('es-PE')} % · ${holding.termDays} días` },
        { label: 'Valor al vencer', value: money(holding.projectedValue) },
      );
    } else {
      facts.push({ label: 'Peso en el portafolio', value: `${Number(holding.weight).toLocaleString('es-PE')} %` });
    }

    if (holding.quantity !== null) {
      facts.push({ label: 'Unidades', value: Number(holding.quantity).toLocaleString('es-PE', { maximumFractionDigits: 8 }) });
      // What a broker shows next to the units: what each one cost on average and what it is worth now.
      const quantity = Number(holding.quantity);
      if (quantity > 0) {
        facts.push(
          { label: 'Precio promedio', value: formatMoney(Number(holding.invested) / quantity, holding.currency, { hidden: this.amountsHidden() }) },
          { label: 'Precio actual', value: formatMoney(Number(holding.value) / quantity, holding.currency, { hidden: this.amountsHidden() }) },
        );
      }
    }

    if (holding.closedOn) {
      facts.push(
        { label: 'Cerrada el', value: formatShortDate(holding.closedOn) },
        { label: 'Ganancia realizada', value: formatMoney(holding.realized, holding.currency, { signed: true, hidden: this.amountsHidden() }) },
      );
    }

    if (holding.lastValuedOn) {
      facts.push({ label: 'Último valor registrado', value: formatShortDate(holding.lastValuedOn) });
    }

    return facts;
  });

  /** The last twelve months as the points of a line in a 100 × 32 box, from the first month it held something. Empty with less than two. */
  protected sparkline(holding: HoldingSummary): string {
    const all = holding.trend.map(Number);
    const values = all.slice(Math.max(0, all.findIndex((value) => value > 0)));
    if (values.length < 2) {
      return '';
    }

    const [min, max] = [Math.min(...values), Math.max(...values)];
    const range = max - min || 1;
    return values.map((value, index) => `${((index / (values.length - 1)) * 100).toFixed(1)},${(30 - ((value - min) / range) * 28).toFixed(1)}`).join(' ');
  }

  protected rising(holding: HoldingSummary): boolean {
    return Number(holding.gain) >= 0;
  }

  protected choose(holding: HoldingSummary): void {
    this.chosenId.set(holding.id);
  }

  protected open(mode: 'open' | 'contribute' | 'withdraw' | 'value'): void {
    const holding = this.selected();
    this.notice.set(null);
    this.formTarget.set(mode === 'open' || !holding ? { mode: 'open' } : { mode, holding });
    // The balances may have changed since the page loaded: the dialog shows them as they are now.
    this.accounts.reload();
  }

  protected onSaved(message: string): void {
    this.formTarget.set(null);
    this.notice.set(message);
    this.summary.reload();
    this.detail.reload();
    this.accounts.reload();
  }
}
