import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BaseTotals, CurrencyTotals } from '../../core/api/api-types';
import { Icon } from '../../shared/ui/icon';
import { AMOUNTS_HIDDEN, Amount, formatMoney } from '../../shared/ui/money';
import { RateBook } from './transactions-api';

interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly tone: 'income' | 'negative' | '';
}

function toneOf(net: Amount, income = false): Kpi['tone'] {
  if (income || Number(net) > 0) {
    return 'income';
  }

  return Number(net) < 0 ? 'negative' : '';
}

/**
 * Income, expenses and net of what the list shows. With several currencies: everything brought to the base one, each
 * amount at its own day's rate, and a row per currency that filters the list by it. With one currency: its own
 * amounts, and what they are worth in the base one today.
 */
@Component({
  selector: 'app-transactions-summary',
  imports: [Icon, RouterLink],
  template: `
    <section class="card summary" [attr.aria-label]="title()">
      <header>
        <h2>{{ title() }}</h2>
        <span class="badge">{{ badge() }}</span>
      </header>
      <dl class="kpis">
        @for (kpi of kpis(); track kpi.label) {
          <div>
            <dt>{{ kpi.label }}</dt>
            <dd [attr.data-tone]="kpi.tone || null">{{ kpi.value }}</dd>
            <dd class="note">{{ kpi.note }}</dd>
          </div>
        }
      </dl>
      @if (rows().length > 0) {
        <table>
          <thead>
            <tr>
              <th scope="col">Moneda</th>
              <th scope="col">Ingresos</th>
              <th scope="col">Gastos</th>
              <th scope="col">Neto</th>
              <th scope="col">En {{ baseTotals()?.currency }}</th>
              <th scope="col"><span class="visually-hidden">Ver</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.currency) {
              <tr>
                <th scope="row"><span class="code">{{ row.currency }}</span></th>
                <td data-tone="income">{{ row.income }}</td>
                <td>{{ row.expense }}</td>
                <td [attr.data-tone]="row.tone || null">{{ row.net }}</td>
                <td class="muted">{{ row.inBase }}</td>
                <td>
                  <button type="button" class="icon-button" [attr.aria-label]="'Ver solo ' + row.currency" (click)="pick.emit(row.currency)">
                    <app-icon name="chevron_right" [size]="18" />
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
      @if (missing(); as currencies) {
        <p class="hint">Sin contar lo que está en {{ currencies }}: falta su tipo de cambio. Defínelo en <a class="link" routerLink="/accounts">Cuentas</a>.</p>
      }
    </section>
  `,
  styles: `
    @use 'mixins' as m;

    .summary {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;

      @include m.mobile {
        padding: 14px;
      }
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
    }
    h2 {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--mu);
    }
    .badge {
      background: var(--sf2);
      font-weight: 800;
    }
    .kpis {
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;

      div {
        min-width: 0;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--sf2);
      }
      dt {
        font-size: 11.5px;
        font-weight: 700;
        color: var(--mu);
      }
      dd {
        margin: 2px 0 0;
        font-size: 20px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        @include m.truncate;
      }
      .note {
        font-size: 11px;
        font-weight: 500;
        color: var(--mu);
      }
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border-top: 1px solid var(--bd);
      font-size: 12.5px;
      font-variant-numeric: tabular-nums;
    }
    th,
    td {
      padding: 8px 6px;
      text-align: right;
      white-space: nowrap;
    }
    thead th {
      font-size: 11px;
      font-weight: 700;
      color: var(--mu);
    }
    th:first-child {
      text-align: left;
    }
    tbody tr:hover {
      background: var(--sf2);
    }
    tbody td,
    tbody th {
      font-weight: 700;
    }
    .code {
      padding: 2px 6px;
      border-radius: 6px;
      background: var(--sf3);
      font-size: 10.5px;
      font-weight: 800;
      color: var(--tx2);
    }
    .muted {
      color: var(--mu);
    }
    [data-tone='income'] {
      color: var(--ac);
    }
    [data-tone='negative'] {
      color: var(--rd);
    }
    .hint {
      font-size: 12.5px;
      color: var(--mu);
    }
    // The table keeps its columns on a phone: what does not fit scrolls inside the card, not the page.
    @include m.mobile {
      table {
        display: block;
        overflow-x: auto;
      }
      thead th:nth-child(2),
      tbody td:nth-child(2),
      thead th:nth-child(3),
      tbody td:nth-child(3) {
        display: none;
      }
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsSummary {
  private readonly amountsHidden = inject(AMOUNTS_HIDDEN);
  readonly totals = input.required<readonly CurrencyTotals[]>();
  readonly baseTotals = input.required<BaseTotals | null>();
  readonly rates = input.required<RateBook>();
  /** The currency the list is filtered by; empty for all of them. */
  readonly currency = input.required<string>();
  /** "Octubre 2026", "Todas las fechas". */
  readonly scope = input.required<string>();

  /** Emits a currency to show only its movements. */
  readonly pick = output<string>();

  /** Several currencies, or one that is not the base: everything is also brought to the base one. */
  private readonly converted = computed(() => {
    const base = this.baseTotals();
    const totals = this.totals();
    return this.currency() === '' && base && (totals.length > 1 || (totals.length === 1 && totals[0].currency !== base.currency)) ? base : null;
  });

  /** The one currency shown in its own amounts, when the list is not converted. */
  private readonly single = computed(() => (this.converted() ? null : (this.totals()[0] ?? null)));

  protected readonly title = computed(() => {
    if (this.converted()) {
      return `${this.scope()} · todas las monedas`;
    }

    const single = this.single();
    return this.currency() !== '' && single ? `${this.scope()} · solo movimientos en ${single.currency}` : this.scope();
  });

  protected readonly badge = computed(() => (this.converted() ? `Convertido a ${this.converted()!.currency}` : 'Monto original'));

  protected readonly kpis = computed<readonly Kpi[]>(() => {
    const base = this.converted();
    if (base) {
      const daily = 'Al tipo de cambio de cada día';
      return [
        { label: 'Ingresos', value: formatMoney(base.income, base.currency, { hidden: this.amountsHidden() }), note: daily, tone: 'income' },
        { label: 'Gastos', value: formatMoney(base.expense, base.currency, { hidden: this.amountsHidden() }), note: daily, tone: '' },
        { label: 'Neto', value: formatMoney(base.net, base.currency, { signed: true, hidden: this.amountsHidden() }), note: 'Transferencias excluidas', tone: toneOf(base.net) },
      ];
    }

    const single = this.single();
    const currency = single?.currency ?? this.baseTotals()?.currency ?? '';
    const today = (amount: Amount) => this.inBaseToday(amount, currency);
    return [
      { label: 'Ingresos', value: formatMoney(single?.income ?? 0, currency, { hidden: this.amountsHidden() }), note: today(single?.income ?? 0), tone: 'income' },
      { label: 'Gastos', value: formatMoney(single?.expense ?? 0, currency, { hidden: this.amountsHidden() }), note: today(single?.expense ?? 0), tone: '' },
      { label: 'Neto', value: formatMoney(single?.net ?? 0, currency, { signed: true, hidden: this.amountsHidden() }), note: today(single?.net ?? 0), tone: toneOf(single?.net ?? 0) },
    ];
  });

  protected readonly rows = computed(() => {
    const base = this.converted();
    if (!base) {
      return [];
    }

    return this.totals().map((total) => ({
      currency: total.currency,
      income: formatMoney(total.income, total.currency, { hidden: this.amountsHidden() }),
      expense: formatMoney(total.expense, total.currency, { hidden: this.amountsHidden() }),
      net: formatMoney(total.net, total.currency, { signed: true, hidden: this.amountsHidden() }),
      tone: toneOf(total.net),
      inBase: this.baseNet(total, base.currency),
    }));
  });

  protected readonly missing = computed(() => {
    const currencies = this.converted()?.missingRates ?? [];
    return currencies.length > 0 ? currencies.join(', ') : null;
  });

  private baseNet(total: CurrencyTotals, baseCurrency: string): string {
    if (total.currency === baseCurrency) {
      return '—';
    }

    return total.baseNet === null || total.baseNet === undefined ? 'Sin tipo de cambio' : `≈ ${formatMoney(total.baseNet, baseCurrency, { signed: true, hidden: this.amountsHidden() })}`;
  }

  /** "≈ S/ 561.00 hoy", or what the currency is when it needs no conversion. */
  private inBaseToday(amount: Amount, currency: string): string {
    const rates = this.rates();
    if (!rates.baseCurrency || currency === rates.baseCurrency) {
      return 'Moneda base';
    }

    const rate = rates.inBase(currency);
    return rate === null ? 'Sin tipo de cambio' : `≈ ${formatMoney(Number(amount) * rate, rates.baseCurrency, { hidden: this.amountsHidden() })} hoy`;
  }
}
