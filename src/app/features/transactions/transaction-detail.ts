import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { Transaction } from '../../core/api/api-types';
import { formatDay, formatShortDate } from '../../shared/ui/dates';
import { FxBreakdown, FxRow } from '../../shared/ui/fx-breakdown';
import { IconTile } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney, formatRate } from '../../shared/ui/money';
import { KIND_LABELS, RateBook, STATUS_LABELS, lookOf } from './transactions-api';

/** What one currency became in another, and what the difference with the market cost. */
interface FxStory {
  readonly title: string;
  readonly rows: readonly FxRow[];
  readonly note: string;
  /** The rate of the transaction can be stated by hand. */
  readonly adjustable: boolean;
}

/** "−S/ 2.15 (0.7%)": what a bank took over the market, or that it took nothing. */
function surcharge(cost: number, over: number, currency: string): string {
  if (Math.abs(cost) < 0.005) {
    return 'Sin costo';
  }

  const share = over ? ` (${((cost / over) * 100).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%)` : '';
  return `${formatMoney(-cost, currency)}${share}`;
}

/** Everything about one movement, and what can be done with it. It asks; the page does. */
@Component({
  selector: 'app-transaction-detail',
  imports: [FxBreakdown, IconTile, MoneyPipe],
  template: `
    @let item = transaction();
    <div class="head">
      <app-icon-tile [icon]="look().icon" [color]="look().color" [size]="44" />
      <div class="names">
        <strong>{{ item.description }}</strong>
        <span>{{ day() }}</span>
      </div>
    </div>
    <div class="amount" [class.is-income]="+item.signedAmount > 0 && item.status !== 'voided' && !item.transfer" [class.is-voided]="item.status === 'voided'">
      @if (item.transfer; as transfer) {
        {{ transfer.amountOut | money: transfer.currencyOut }}
      } @else {
        {{ item.signedAmount | money: item.currency : { signed: true } }}
      }
    </div>
    @if (subtitle(); as text) {
      <p class="sub">{{ text }}</p>
    }
    <dl>
      @for (row of rows(); track row.label) {
        <div>
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      }
    </dl>
    @if (fx(); as story) {
      <app-fx-breakdown [title]="story.title" [rows]="story.rows" [note]="story.note">
        @if (story.adjustable && item.isEditable) {
          <button type="button" class="adjust" (click)="adjustRate.emit()">Ajustar tipo de cambio</button>
        }
      </app-fx-breakdown>
    }
    @if (item.tags.length > 0) {
      <div class="tags">
        @for (tag of item.tags; track tag) {
          <span class="tag"><span class="hash">#</span>{{ tag }}</span>
        }
      </div>
    }
    @if (item.status !== 'voided') {
      @if (confirmingVoid()) {
        <form class="void" (submit)="$event.preventDefault(); voided.emit(reason().trim() || null)">
          <label>
            <span>Motivo (opcional)</span>
            <input #reasonInput class="input" type="text" maxlength="200" [value]="reason()" (input)="reason.set(reasonInput.value)" />
          </label>
          <p>Dejará de contar en saldos y totales. Queda en «Anuladas».</p>
          <div class="actions">
            <button class="button button--small" type="button" (click)="confirmingVoid.set(false)">Cancelar</button>
            <button class="button button--small button--danger" type="submit" [disabled]="busy()">Sí, anular</button>
          </div>
        </form>
      } @else {
        <div class="actions">
          @if (item.isEditable) {
            <button class="button button--small" type="button" (click)="edit.emit()">Editar</button>
          }
          @if (item.status === 'pending') {
            <button class="button button--small button--primary" type="button" [disabled]="busy()" (click)="confirmed.emit()">Confirmar</button>
          }
          <button class="button button--small" type="button" (click)="confirmingVoid.set(true)">Anular</button>
        </div>
      }
    }
  `,
  styles: `
    @use 'mixins' as m;

    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .names {
      min-width: 0;
      display: flex;
      flex-direction: column;

      strong {
        font-size: 15px;
        font-weight: 800;
      }
      span {
        font-size: 12px;
        color: var(--mu);
      }
    }
    .sub {
      margin-top: -12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--mu);
      font-variant-numeric: tabular-nums;
    }
    .adjust {
      align-self: flex-start;
      font-size: 12px;
      font-weight: 800;
      color: var(--bl);
    }
    .amount {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .is-income {
      color: var(--ac);
    }
    .is-voided {
      color: var(--mu);
      text-decoration: line-through;
    }
    dl {
      margin: 0;
      border-top: 1px solid var(--bd);

      div {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 0;
        border-bottom: 1px solid var(--bd);
        font-size: 13px;
      }
      dt {
        color: var(--mu);
      }
      dd {
        margin: 0;
        font-weight: 700;
        text-align: right;
        overflow-wrap: anywhere;
      }
    }
    .tags,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .void {
      display: flex;
      flex-direction: column;
      gap: 10px;

      label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12.5px;
        font-weight: 700;
        color: var(--tx2);
      }
      p {
        font-size: 12.5px;
        color: var(--mu);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionDetail {
  readonly transaction = input.required<Transaction>();
  readonly busy = input(false);
  /** The person's rates today, for what an amount in another currency is worth now. */
  readonly rates = input.required<RateBook>();

  readonly edit = output<void>();
  readonly confirmed = output<void>();
  /** Asks to edit the transaction with its exchange rate open. */
  readonly adjustRate = output<void>();

  /** Emits the reason the person gave, or null. */
  readonly voided = output<string | null>();

  // Both go back to their start when another movement is shown: the question belonged to the previous one.
  private readonly transactionId = computed(() => this.transaction().id);
  protected readonly confirmingVoid = linkedSignal({ source: this.transactionId, computation: () => false });
  protected readonly reason = linkedSignal({ source: this.transactionId, computation: () => '' });

  protected readonly look = computed(() => lookOf(this.transaction()));
  protected readonly day = computed(() => formatDay(this.transaction().occurredOn));

  /** A line under the amount: what arrived, the original price, or what it was worth in the base currency. */
  protected readonly subtitle = computed(() => {
    const item = this.transaction();
    const transfer = item.transfer;
    if (transfer && transfer.currencyIn !== transfer.currencyOut) {
      return `Recibiste ${formatMoney(transfer.amountIn, transfer.currencyIn)}`;
    }

    if (item.originalPrice) {
      return `Precio original ${formatMoney(item.originalPrice.amount, item.originalPrice.currency)}`;
    }

    return item.conversion ? `≈ ${formatMoney(item.conversion.baseAmount, item.conversion.baseCurrency)} al registrarse` : null;
  });

  /** The conversion behind the amount, when there is one to tell. */
  protected readonly fx = computed<FxStory | null>(() => {
    const item = this.transaction();
    const transfer = item.transfer;
    if (transfer && transfer.currencyIn !== transfer.currencyOut) {
      const [sent, received] = [Number(transfer.amountOut), Number(transfer.amountIn)];
      const market = transfer.marketRate === null || transfer.marketRate === undefined ? null : Number(transfer.marketRate);
      const rows: FxRow[] = [
        { label: 'Enviaste', value: formatMoney(sent, transfer.currencyOut) },
        { label: 'Recibiste', value: formatMoney(received, transfer.currencyIn) },
        { label: 'Tipo aplicado', value: formatRate(sent / received, transfer.currencyIn, transfer.currencyOut) },
      ];
      if (market !== null) {
        const cost = sent - received * market;
        rows.push(
          { label: 'Mercado ese día', value: formatRate(market, transfer.currencyIn, transfer.currencyOut) },
          { label: 'Costo del cambio', value: surcharge(cost, received * market, transfer.currencyOut), tone: cost > 0.005 ? 'bad' : 'good' },
        );
      }

      if (transfer.fee) {
        rows.push({ label: 'Comisión del banco', value: formatMoney(-Number(transfer.fee), transfer.currencyOut), tone: 'bad' });
      }

      return {
        title: 'Conversión',
        rows,
        note: 'Tu patrimonio solo baja por el costo del cambio y la comisión; el resto es el mismo dinero en otra moneda.',
        adjustable: false,
      };
    }

    if (item.originalPrice) {
      const price = item.originalPrice;
      const [charged, original] = [Number(item.amount), Number(price.amount)];
      const market = price.marketRate === null ? null : Number(price.marketRate);
      const rows: FxRow[] = [
        { label: 'Precio', value: formatMoney(original, price.currency) },
        { label: `Cobrado en ${item.accountName}`, value: formatMoney(charged, item.currency) },
        { label: 'Tipo del banco', value: formatRate(charged / original, price.currency, item.currency) },
      ];
      if (market !== null) {
        const cost = charged - original * market;
        rows.push(
          { label: 'Mercado ese día', value: formatRate(market, price.currency, item.currency) },
          { label: 'Recargo por cambio', value: surcharge(cost, original * market, item.currency), tone: cost > 0.005 ? 'bad' : 'good' },
        );
      }

      return {
        title: `Compra en ${price.currency}`,
        rows,
        note: `Cuenta en ${item.currency} por lo que realmente salió de tu cuenta. El precio en ${price.currency} queda como referencia.`,
        adjustable: false,
      };
    }

    const conversion = item.conversion;
    if (conversion && !transfer) {
      const today = this.rates().inBase(item.currency);
      const rows: FxRow[] = [
        { label: 'Tipo de cambio usado', value: formatRate(conversion.rate, item.currency, conversion.baseCurrency) },
        { label: 'Fuente', value: conversion.isManual ? 'Lo escribiste tú' : `Tu tipo de cambio · desde el ${formatShortDate(conversion.rateDate)}` },
      ];
      if (today !== null) {
        rows.push({ label: 'Equivale hoy', value: formatMoney(Number(item.signedAmount) * today, conversion.baseCurrency, { signed: true }) });
      }

      return {
        title: `Conversión a ${conversion.baseCurrency}`,
        rows,
        note: 'Tus reportes y presupuestos usan este tipo de cambio y no cambian aunque la moneda se mueva después.',
        adjustable: true,
      };
    }

    return null;
  });

  protected readonly rows = computed(() => {
    const item = this.transaction();
    const category = item.category ? (item.category.parentName ? `${item.category.parentName} › ${item.category.name}` : item.category.name) : null;
    const transfer = item.transfer;
    // Between two currencies what arrives is not what left, so both are shown.
    const arrives = transfer && transfer.currencyIn !== transfer.currencyOut ? formatMoney(transfer.amountIn, transfer.currencyIn) : null;
    return [
      { label: 'Tipo', value: transfer?.isCardPayment ? 'Pago de tarjeta' : KIND_LABELS[item.kind] },
      { label: 'Categoría', value: category },
      { label: 'Cuenta', value: transfer ? null : item.accountName },
      { label: 'Desde', value: transfer?.fromAccountName },
      { label: 'Hacia', value: transfer?.toAccountName },
      { label: 'Llega', value: arrives },
      { label: 'Estado', value: STATUS_LABELS[item.status] },
      { label: 'Pagado con', value: item.fundedByGoal ? 'El ahorro de una meta' : null },
      { label: 'Comercio', value: item.merchant },
      { label: 'Nota', value: item.note },
      { label: 'Motivo de la anulación', value: item.voidReason },
    ].filter((row): row is { label: string; value: string } => !!row.value);
  });
}
