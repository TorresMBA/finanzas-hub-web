import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Account, HoldingDetail, HoldingSummary, InvestmentSummary, InvestmentType } from '../../core/api/api-types';
import { TODAY } from '../../core/period/period-store';
import { formatShortDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { IconTile } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { HoldingForm, HoldingFormTarget } from './holding-form';
import { InvestmentsApi, TYPE_LOOK } from './investments-api';

type Filter = 'all' | 'mutualFund' | 'termDeposit' | 'shares' | 'crypto';

const FILTERS: readonly { value: Filter; label: string; types: readonly InvestmentType[] | null }[] = [
  { value: 'all', label: 'Todas', types: null },
  { value: 'mutualFund', label: 'Fondos mutuos', types: ['mutualFund'] },
  { value: 'termDeposit', label: 'Depósitos a plazo', types: ['termDeposit'] },
  { value: 'shares', label: 'Acciones y ETFs', types: ['stock', 'etf'] },
  { value: 'crypto', label: 'Cripto', types: ['crypto'] },
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
  const parts = [years > 0 ? `${years} ${years === 1 ? 'año' : 'años'}` : '', rest > 0 ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : ''].filter(Boolean);
  return parts.join(' y ');
}

/**
 * The portfolio of the signed-in person: what it is worth, how it is spread and each investment with its last
 * twelve months. Money moves between their accounts and their investments as transfers, never as expenses.
 */
@Component({
  selector: 'app-investments',
  imports: [EmptyState, ErrorState, HoldingForm, IconTile, MoneyPipe, PageHeader, Skeleton],
  templateUrl: './investments.html',
  styleUrl: './investments.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Investments {
  private readonly api = inject(InvestmentsApi);
  private readonly today = inject(TODAY);

  protected readonly filters = FILTERS;
  protected readonly typeLook = TYPE_LOOK;
  protected readonly shortDate = formatShortDate;

  protected readonly summary = httpResource<InvestmentSummary>(() => this.api.summaryUrl(null));
  private readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());

  protected readonly filter = signal<Filter>('all');
  private readonly chosenId = signal<string | null>(null);
  protected readonly formTarget = signal<HoldingFormTarget | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const types = FILTERS.find((option) => option.value === this.filter())?.types;
    return (this.summary.value()?.holdings ?? []).filter((holding) => !types || types.includes(holding.type));
  });

  /** The investment in the detail panel: the chosen one while it is on screen, otherwise the first. */
  protected readonly selected = computed(() => this.visible().find((holding) => holding.id === this.chosenId()) ?? this.visible()[0] ?? null);
  protected readonly detail = httpResource<HoldingDetail>(() => this.api.detailUrl(this.selected()?.id ?? null));

  protected readonly kpis = computed(() => {
    const data = this.summary.value();
    const currency = data?.baseCurrency;
    if (!data || !currency) {
      return [];
    }

    const gain = Number(data.gain);
    const percent = data.gainPercent === null ? null : Number(data.gainPercent);
    return [
      { label: 'Valor del portafolio', value: formatMoney(data.value, currency), note: `${data.holdings.length} ${data.holdings.length === 1 ? 'inversión' : 'inversiones'}`, tone: '' },
      {
        label: 'Ganancia no realizada',
        value: formatMoney(gain, currency, { signed: true }),
        note: percent === null ? 'Sin capital invertido' : `${percent > 0 ? '+' : ''}${percent.toLocaleString('es-PE')} % sobre lo invertido`,
        tone: gain > 0 ? 'good' : gain < 0 ? 'bad' : '',
      },
      { label: 'Invertido', value: formatMoney(data.invested, currency), note: 'Capital que pusiste y sigue dentro', tone: '' },
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

    const money = (amount: number | string | null) => (amount === null ? '—' : formatMoney(amount, holding.currency));
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
    const accounts = this.accounts.value() ?? [];
    const holding = this.selected();
    this.notice.set(null);
    this.formTarget.set(mode === 'open' || !holding ? { mode: 'open', accounts } : { mode, holding, accounts });
  }

  protected onSaved(message: string): void {
    this.formTarget.set(null);
    this.notice.set(message);
    this.summary.reload();
    this.detail.reload();
    this.accounts.reload();
  }
}
