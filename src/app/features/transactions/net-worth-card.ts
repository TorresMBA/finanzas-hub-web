import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AccountSummary } from '../../core/api/api-types';
import { formatMoney } from '../../shared/ui/money';

// The bars cycle through these, so any number of currencies gets a colour; the base one is always the first.
const PALETTE = ['var(--ac)', 'var(--bl)', 'var(--vi)', 'var(--am)', 'var(--rd)'];

/**
 * Net worth by currency, each brought to the base one at today's rate. A balance in another currency is valued again
 * every day: that changes net worth, but it is neither an income nor an expense.
 */
@Component({
  selector: 'app-net-worth-card',
  template: `
    @let data = summary();
    <section class="card worth" aria-labelledby="net-worth-title">
      <div>
        <h2 id="net-worth-title">Patrimonio en {{ data.baseCurrency }} · al tipo de cambio de hoy</h2>
        <strong class="total">{{ total() }}</strong>
      </div>
      <ul>
        @for (row of rows(); track row.currency) {
          <li>
            <span class="line">
              <span><span class="code">{{ row.currency }}</span> <span class="muted">{{ row.native }}</span></span>
              <strong>{{ row.inBase }}</strong>
            </span>
            <span class="bar" aria-hidden="true"><span [style.width.%]="row.width" [style.background]="row.color"></span></span>
          </li>
        }
      </ul>
      @if (data.missingRates.length > 0) {
        <p class="note">Sin contar {{ data.missingRates.join(', ') }}: falta su tipo de cambio.</p>
      }
      <p class="note">Tus saldos en otras monedas se revalúan con el tipo de cambio. Esa variación cambia tu patrimonio, pero no cuenta como ingreso ni gasto.</p>
    </section>
  `,
  styles: `
    .worth {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    h2 {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--mu);
    }
    .total {
      display: block;
      margin-top: 2px;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    li {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .code {
      padding: 1px 6px;
      border-radius: 6px;
      background: var(--sf3);
      font-size: 10.5px;
      font-weight: 800;
      color: var(--tx2);
    }
    .muted {
      color: var(--mu);
    }
    .bar {
      height: 6px;
      border-radius: 99px;
      background: var(--sf3);

      span {
        display: block;
        height: 6px;
        border-radius: 99px;
      }
    }
    .note {
      font-size: 11.5px;
      color: var(--mu);
      text-wrap: pretty;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetWorthCard {
  readonly summary = input.required<AccountSummary>();

  protected readonly total = computed(() => formatMoney(this.summary().netWorth, this.summary().baseCurrency ?? ''));

  protected readonly rows = computed(() => {
    const { baseCurrency, currencies } = this.summary();
    const valued = currencies.map((position) => ({
      currency: position.currency,
      net: Number(position.net),
      inBase: position.currency === baseCurrency ? Number(position.net) : position.rate === null ? null : Number(position.net) * Number(position.rate),
    }));
    const largest = Math.max(1, ...valued.map((position) => Math.abs(position.inBase ?? 0)));
    return valued
      .sort((a, b) => (a.currency === baseCurrency ? -1 : b.currency === baseCurrency ? 1 : (b.inBase ?? 0) - (a.inBase ?? 0)))
      .map((position, index) => ({
        currency: position.currency,
        native: position.currency === baseCurrency ? 'Moneda base' : formatMoney(position.net, position.currency),
        inBase: position.inBase === null ? 'Sin tipo de cambio' : formatMoney(position.inBase, baseCurrency ?? ''),
        width: Math.max(2, (Math.abs(position.inBase ?? 0) / largest) * 100),
        color: PALETTE[index % PALETTE.length],
      }));
  });
}
