import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { Transaction } from '../../core/api/api-types';
import { formatDay } from '../../shared/ui/dates';
import { IconTile } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney } from '../../shared/ui/money';
import { KIND_LABELS, STATUS_LABELS, lookOf } from './transactions-api';

/** Everything about one movement, and what can be done with it. It asks; the page does. */
@Component({
  selector: 'app-transaction-detail',
  imports: [IconTile, MoneyPipe],
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
    <dl>
      @for (row of rows(); track row.label) {
        <div>
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      }
    </dl>
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

  readonly edit = output<void>();
  readonly confirmed = output<void>();

  /** Emits the reason the person gave, or null. */
  readonly voided = output<string | null>();

  // Both go back to their start when another movement is shown: the question belonged to the previous one.
  private readonly transactionId = computed(() => this.transaction().id);
  protected readonly confirmingVoid = linkedSignal({ source: this.transactionId, computation: () => false });
  protected readonly reason = linkedSignal({ source: this.transactionId, computation: () => '' });

  protected readonly look = computed(() => lookOf(this.transaction()));
  protected readonly day = computed(() => formatDay(this.transaction().occurredOn));

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
      { label: 'Comercio', value: item.merchant },
      { label: 'Nota', value: item.note },
      { label: 'Motivo de la anulación', value: item.voidReason },
    ].filter((row): row is { label: string; value: string } => !!row.value);
  });
}
