import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Account, HoldingSummary, InvestmentType } from '../../core/api/api-types';
import { isManagedAccount } from '../../core/api/managed-accounts';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { formatShortDate, toIsoDate } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { IconTile } from '../../shared/ui/icon-tile';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { InvestmentsApi, TYPES, TYPE_LOOK, actionsFor, hasUnits } from './investments-api';

/** What the dialog does: register an investment, or put money in, take it out or write down what one is worth. */
export type HoldingFormTarget =
  | { readonly mode: 'open'; readonly accounts: readonly Account[] }
  | {
      readonly mode: 'contribute' | 'withdraw' | 'value';
      readonly holding: HoldingSummary;
      readonly accounts: readonly Account[];
    };

/** How each type is explained when choosing it, and how its fields are called, as a bank or a broker would. */
const GUIDE: Readonly<
  Record<
    InvestmentType,
    {
      description: string;
      name: string;
      institution: string;
      institutionHint: string;
      symbol?: string;
      symbolHint?: string;
    }
  >
> = {
  termDeposit: {
    description: 'Dinero a una tasa fija (TEA) por un plazo. Sabes desde hoy cuánto recibirás.',
    name: 'Plazo fijo 360 días',
    institution: 'Banco o caja',
    institutionHint: 'BCP, Interbank, Caja Arequipa…',
  },
  mutualFund: {
    description: 'Lo administra una SAF y su valor cambia cada día. Registras lo que inviertes.',
    name: 'Fondo Conservador Soles',
    institution: 'Administradora (SAF)',
    institutionHint: 'Credicorp Capital, BBVA AM…',
  },
  stock: {
    description: 'Acciones de una empresa. Compras unidades a un precio.',
    name: 'Apple Inc.',
    institution: 'Broker',
    institutionHint: 'Interactive Brokers, Trii, Hapi…',
    symbol: 'Símbolo (ticker)',
    symbolHint: 'AAPL',
  },
  etf: {
    description: 'Un fondo que cotiza en bolsa, como VOO o SPY. Compras unidades a un precio.',
    name: 'Vanguard S&P 500',
    institution: 'Broker',
    institutionHint: 'Interactive Brokers, Trii, Hapi…',
    symbol: 'Símbolo (ticker)',
    symbolHint: 'VOO',
  },
  crypto: {
    description: 'Bitcoin, Ethereum y otras. Unidades con hasta 8 decimales.',
    name: 'Bitcoin',
    institution: 'Exchange o billetera',
    institutionHint: 'Binance, Buda, Ledger…',
    symbol: 'Símbolo',
    symbolHint: 'BTC',
  },
  other: {
    description: 'Cualquier otra inversión de la que conozcas su valor.',
    name: 'Préstamo a un amigo, terreno…',
    institution: 'Dónde está (opcional)',
    institutionHint: '',
  },
};

/** The terms banks offer most, in days. Any other can be typed. */
const TERMS = [30, 90, 180, 360, 720] as const;

/** A decimal typed with a comma or a point; NaN for anything else. */
function decimal(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? Number.NaN : Number(trimmed.replace(',', '.'));
}

/** Greater than zero. False for NaN, so text that is not a number never passes. */
function positive(value: number): boolean {
  return value > 0;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasDecimals(value: number, places: number): boolean {
  const factor = 10 ** places;
  return Math.abs(Math.round(value * factor) - value * factor) < 1e-6;
}

function units(value: number | string | null): string {
  return Number(value ?? 0).toLocaleString('es-PE', { maximumFractionDigits: 8 });
}

/**
 * What a contribution or a withdrawal did, as the person would say it.
 * @param quantity The units bought or sold; undefined for an investment that is not counted in units.
 */
function moveMessage(mode: 'contribute' | 'withdraw', holding: HoldingSummary, text: string, quantity: number | null | undefined): string {
  if (quantity !== undefined) {
    const verb = mode === 'withdraw' ? 'Vendiste' : 'Compraste';
    return `${verb} ${units(quantity)} de «${holding.name}» por ${text}.`;
  }

  if (mode === 'contribute') {
    return `Aportaste ${text} a «${holding.name}».`;
  }

  const verb = holding.type === 'mutualFund' ? 'Rescataste' : 'Retiraste';
  return `${verb} ${text} de «${holding.name}».`;
}

/**
 * One dialog for everything that changes an investment. Registering one goes in two steps: what it is, then the
 * fields that kind of investment has — units and price for shares and crypto, rate and term for a deposit, an amount
 * for a fund — with a summary of what will happen before confirming. Money always moves between an account of the
 * person and the investment as a transfer: buying is not spending. Only the gain of a redemption is an income.
 */
@Component({
  selector: 'app-holding-form',
  imports: [Dialog, Field, FormField, IconTile],
  template: `
    <app-dialog [title]="title()" (closed)="closed.emit()">
      @if (step() === 'type') {
        <div class="form-stack">
          <p class="form-note">
            ¿Qué vas a registrar? Elige el tipo y te pediremos solo lo que ese tipo necesita.
          </p>
          <div class="types" role="group" aria-label="Tipo de inversión">
            @for (option of types; track option) {
              <button
                type="button"
                class="type"
                [attr.aria-pressed]="model().type === option"
                (click)="chooseType(option)"
              >
                <app-icon-tile
                  [icon]="typeLook[option].icon"
                  [color]="typeLook[option].color"
                  [size]="34"
                />
                <span>
                  <strong>{{ typeLook[option].label }}</strong>
                  <small>{{ guide[option].description }}</small>
                </span>
              </button>
            }
          </div>
          <div class="form-actions">
            <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          </div>
        </div>
      } @else {
        <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
          @if (failure(); as text) {
            <div class="alert" role="alert">{{ text }}</div>
          }

          @if (target().mode === 'open') {
            <button
              type="button"
              class="chosen"
              (click)="step.set('type')"
              aria-label="Cambiar el tipo de inversión"
            >
              <app-icon-tile
                [icon]="typeLook[type()].icon"
                [color]="typeLook[type()].color"
                [size]="28"
              />
              <strong>{{ typeLook[type()].label }}</strong>
              <span class="link">Cambiar</span>
            </button>

            <fieldset>
              <legend>{{ unitsKind() ? 'Qué compras' : 'El producto' }}</legend>
              @if (guide[type()].symbol; as symbol) {
                <div class="form-pair">
                  <app-field [label]="symbol" [state]="holdingForm.ticker()">
                    <input
                      class="input upper"
                      type="text"
                      autocomplete="off"
                      [placeholder]="guide[type()].symbolHint ?? ''"
                      [formField]="holdingForm.ticker"
                    />
                  </app-field>
                  <app-field
                    label="Nombre (opcional)"
                    [hint]="'Si lo dejas vacío, usamos el símbolo.'"
                  >
                    <input
                      class="input"
                      type="text"
                      [placeholder]="guide[type()].name"
                      [formField]="holdingForm.name"
                    />
                  </app-field>
                </div>
              } @else {
                <app-field label="Nombre" [state]="holdingForm.name()">
                  <input
                    class="input"
                    type="text"
                    [placeholder]="guide[type()].name"
                    [formField]="holdingForm.name"
                  />
                </app-field>
              }
              <app-field
                [label]="guide[type()].institution + (type() === 'other' ? '' : ' (opcional)')"
              >
                <input
                  class="input"
                  type="text"
                  [placeholder]="guide[type()].institutionHint"
                  [formField]="holdingForm.institution"
                />
              </app-field>
            </fieldset>
          }

          @if (target().mode === 'value') {
            <app-field label="Fecha" [state]="holdingForm.date()">
              <input class="input" type="date" [max]="todayIso" [formField]="holdingForm.date" />
            </app-field>
            @if (unitsKind()) {
              <app-field
                [label]="'Precio actual de una unidad (' + currency() + ')'"
                [hint]="unitsHint()"
                [state]="holdingForm.price()"
              >
                <input
                  class="input"
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  [formField]="holdingForm.price"
                />
              </app-field>
            } @else {
              <app-field
                [label]="'Valor actual (' + currency() + ')'"
                hint="Lo que dice tu banco o tu SAF que vale hoy."
                [state]="holdingForm.amount()"
              >
                <input
                  class="input"
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  [formField]="holdingForm.amount"
                />
              </app-field>
            }
          } @else if (accounts().length === 0) {
            <p class="form-note">
              No tienes una cuenta {{ currencyNote() }}con la que mover este dinero. Créala en
              Cuentas.
            </p>
          } @else {
            <fieldset>
              <legend>{{ moneyLegend() }}</legend>
              @if (unitsKind()) {
                <div class="form-pair">
                  <app-field
                    [label]="target().mode === 'withdraw' ? 'Unidades que vendes' : 'Unidades'"
                    [hint]="quantityHint()"
                    [state]="holdingForm.quantity()"
                  >
                    <input
                      class="input"
                      type="text"
                      inputmode="decimal"
                      placeholder="0"
                      [formField]="holdingForm.quantity"
                    />
                  </app-field>
                  <app-field
                    [label]="'Precio por unidad' + currencySuffix()"
                    [state]="holdingForm.price()"
                  >
                    <input
                      class="input"
                      type="text"
                      inputmode="decimal"
                      placeholder="0.00"
                      [formField]="holdingForm.price"
                    />
                  </app-field>
                </div>
                @if (target().mode === 'withdraw') {
                  <button type="button" class="link" (click)="sellAll()">
                    Vender todo ({{ heldUnits() }} unidades)
                  </button>
                } @else {
                  <app-field
                    [label]="'Comisión' + currencySuffix() + ' (opcional)'"
                    hint="Lo que cobró el broker. Se suma a lo que pagas."
                    [state]="holdingForm.fee()"
                  >
                    <input
                      class="input"
                      type="text"
                      inputmode="decimal"
                      placeholder="0.00"
                      [formField]="holdingForm.fee"
                    />
                  </app-field>
                }
              } @else {
                <app-field
                  [label]="amountLabel() + currencySuffix()"
                  [hint]="amountHint()"
                  [state]="holdingForm.amount()"
                >
                  <input
                    class="input"
                    type="text"
                    inputmode="decimal"
                    placeholder="0.00"
                    [formField]="holdingForm.amount"
                  />
                </app-field>
                @if (target().mode === 'withdraw') {
                  <button type="button" class="link" (click)="takeAll()">
                    {{ action() }} todo ({{ worth() }})
                  </button>
                }
              }

              @if (deposit()) {
                <app-field
                  label="Tasa (TEA %)"
                  hint="La tasa efectiva anual que te dio el banco."
                  [state]="holdingForm.rate()"
                >
                  <input
                    class="input"
                    type="text"
                    inputmode="decimal"
                    placeholder="6.50"
                    [formField]="holdingForm.rate"
                  />
                </app-field>
                <app-field label="Plazo (días)" [state]="holdingForm.days()">
                  <div class="terms" role="group" aria-label="Plazos frecuentes">
                    @for (term of terms; track term) {
                      <button
                        type="button"
                        class="chip-toggle"
                        [attr.aria-pressed]="model().days === '' + term"
                        (click)="setTerm(term)"
                      >
                        {{ term }}
                      </button>
                    }
                  </div>
                  <input
                    class="input"
                    type="text"
                    inputmode="numeric"
                    placeholder="Otro plazo"
                    [formField]="holdingForm.days"
                  />
                </app-field>
              }
            </fieldset>

            <fieldset>
              <legend>
                {{ target().mode === 'withdraw' ? 'A dónde va el dinero' : 'Con qué pagas' }}
              </legend>
              <div class="form-pair">
                <app-field
                  [label]="target().mode === 'withdraw' ? 'Hacia la cuenta' : 'Desde la cuenta'"
                  [state]="holdingForm.accountId()"
                >
                  <select class="input" [formField]="holdingForm.accountId">
                    <option value="">Elige una cuenta</option>
                    @for (account of accounts(); track account.id) {
                      <option [value]="account.id">
                        {{ account.name }} · {{ balanceOf(account) }}
                      </option>
                    }
                  </select>
                </app-field>
                <app-field label="Fecha" [state]="holdingForm.date()">
                  <input
                    class="input"
                    type="date"
                    [max]="todayIso"
                    [formField]="holdingForm.date"
                  />
                </app-field>
              </div>
              @if (shortOfMoney()) {
                <p class="warning" role="status">
                  Esa cuenta tiene {{ balanceOf(account()!) }}: quedará en negativo.
                </p>
              }
            </fieldset>

            @if (summary(); as lines) {
              <section class="receipt" aria-label="Resumen">
                <h3>Resumen</h3>
                <dl>
                  @for (line of lines; track line.label) {
                    <div [class.total]="line.total">
                      <dt>{{ line.label }}</dt>
                      <dd>{{ line.value }}</dd>
                    </div>
                  }
                </dl>
              </section>
            }
            <p class="form-note">{{ note() }}</p>
          }

          <div class="form-actions">
            @if (target().mode === 'open') {
              <button class="button" type="button" (click)="step.set('type')">Atrás</button>
            } @else {
              <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
            }
            <button
              class="button button--primary"
              type="submit"
              [disabled]="busy() || (target().mode !== 'value' && accounts().length === 0)"
            >
              {{ busy() ? 'Guardando…' : action() }}
            </button>
          </div>
        </form>
      }
    </app-dialog>
  `,
  styles: `
    .types {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .type {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--bd);
      border-radius: 12px;
      text-align: left;
      background: var(--sf);

      &:hover {
        background: var(--sf2);
      }

      &[aria-pressed='true'] {
        border-color: var(--ac);
        background: var(--acs);
      }

      span {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      strong {
        font-size: 13.5px;
      }
      small {
        font-size: 12px;
        line-height: 1.35;
        color: var(--mu);
      }
    }
    .chosen {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 12px;
      background: var(--sf2);
      text-align: left;

      strong {
        flex: 1;
        font-size: 13.5px;
      }
    }
    fieldset {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    legend {
      margin-bottom: 10px;
      padding: 0;
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mu);
    }
    .terms {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;

      .chip-toggle {
        height: 30px;
        padding: 0 10px;
      }
      .chip-toggle[aria-pressed='true'] {
        background: var(--acs);
        color: var(--ac);
      }
    }
    .upper {
      text-transform: uppercase;
    }
    .link {
      align-self: flex-start;
      font-size: 13px;
    }
    .warning {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--am);
    }
    .receipt {
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--sf2);

      h3 {
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 800;
        color: var(--mu);
      }
      dl {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 0;
      }
      div {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
      }
      dt {
        color: var(--tx2);
      }
      dd {
        margin: 0;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .total {
        padding-top: 6px;
        border-top: 1px solid var(--bd);
        font-size: 14px;

        dd {
          font-weight: 800;
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoldingForm {
  private readonly api = inject(InvestmentsApi);
  private readonly today = inject(TODAY);

  // Created with the form, so sending it twice moves the money once.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<HoldingFormTarget>();

  /** Emits the message to show once it is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly types = TYPES;
  protected readonly typeLook = TYPE_LOOK;
  protected readonly guide = GUIDE;
  protected readonly terms = TERMS;
  protected readonly todayIso = toIsoDate(this.today());

  /** Registering starts by choosing the type; everything else goes straight to its fields. */
  protected readonly step = linkedSignal<'type' | 'details'>(() =>
    this.target().mode === 'open' ? 'type' : 'details',
  );

  private readonly holding = computed(() => {
    const target = this.target();
    return target.mode === 'open' ? null : target.holding;
  });

  protected readonly model = linkedSignal(() => ({
    type: 'termDeposit' as InvestmentType,
    name: '',
    ticker: '',
    institution: '',
    amount: '',
    quantity: '',
    // The price it was last valued at, as a starting point for buying or selling more.
    price: this.holding()?.quantity ? this.unitPriceOf(this.holding()!) : '',
    fee: '',
    rate: '',
    days: '',
    date: this.todayIso,
    // With a single account it could be, it is already chosen.
    accountId: this.accounts().length === 1 ? this.accounts()[0].id : '',
  }));

  protected readonly type = computed(() => this.holding()?.type ?? this.model().type);
  protected readonly unitsKind = computed(() => hasUnits(this.type()));
  protected readonly deposit = computed(
    () => this.target().mode === 'open' && this.type() === 'termDeposit',
  );

  /** The words of the buttons, as the page uses them for this kind of investment. */
  protected readonly action = computed(() => {
    const target = this.target();
    if (target.mode === 'open') {
      return this.unitsKind() ? 'Registrar compra' : 'Registrar inversión';
    }

    return actionsFor(target.holding.type)[target.mode];
  });
  protected readonly title = computed(() => {
    const holding = this.holding();
    return holding ? `${this.action()} · ${holding.name}` : 'Nueva inversión';
  });

  /** Accounts that hold money: not a card, not a goal or another investment; in the currency of the investment once it has one. */
  protected readonly accounts = computed(() => {
    const currency = this.holding()?.currency;
    return this.target().accounts.filter(
      (account) =>
        !account.isArchived &&
        account.type !== 'creditCard' &&
        !isManagedAccount(account.type) &&
        (!currency || account.currency === currency),
    );
  });

  protected readonly account = computed(
    () => this.accounts().find((account) => account.id === this.model().accountId) ?? null,
  );
  protected readonly currency = computed(
    () => this.holding()?.currency ?? this.account()?.currency ?? '',
  );
  protected readonly currencySuffix = computed(() =>
    this.currency() ? ` (${this.currency()})` : '',
  );
  protected readonly currencyNote = computed(() =>
    this.holding() ? `en ${this.holding()!.currency} ` : '',
  );
  protected readonly worth = computed(() => {
    const holding = this.holding();
    return holding ? formatMoney(holding.value, holding.currency) : '';
  });
  protected readonly heldUnits = computed(() => units(this.holding()?.quantity ?? 0));

  protected readonly moneyLegend = computed(() => {
    if (this.target().mode === 'withdraw') {
      return this.unitsKind() ? 'Qué vendes' : `Cuánto vas a ${this.action().toLowerCase()}`;
    }

    return this.unitsKind() ? 'Cuánto compras' : 'Cuánto inviertes';
  });
  protected readonly amountLabel = computed(() =>
    this.target().mode === 'withdraw'
      ? `Monto a ${this.action().toLowerCase()}`
      : 'Monto a invertir',
  );
  protected readonly amountHint = computed(() =>
    this.target().mode === 'withdraw' ? `Hoy vale ${this.worth()}.` : '',
  );
  protected readonly quantityHint = computed(() =>
    this.target().mode === 'withdraw' ? `Tienes ${this.heldUnits()}.` : 'Hasta 8 decimales.',
  );
  protected readonly unitsHint = computed(() => `Tienes ${this.heldUnits()} unidades.`);

  /** What leaves or arrives in the account: units times price, plus the fee when buying. Null until it can be counted. */
  protected readonly total = computed(() => {
    const model = this.model();
    if (!this.unitsKind()) {
      return parseAmount(model.amount);
    }

    const quantity = decimal(model.quantity);
    const price = decimal(model.price);
    if (!positive(quantity) || !positive(price)) {
      return null;
    }

    const fee = this.target().mode === 'withdraw' ? 0 : decimal(model.fee) || 0;
    return cents(quantity * price + fee);
  });

  protected readonly shortOfMoney = computed(() => {
    const account = this.account();
    const total = this.total();
    return (
      this.target().mode !== 'withdraw' &&
      account !== null &&
      total !== null &&
      total > Number(account.balance)
    );
  });

  /** What the bank or the broker would show before confirming. Null until there is something to show. */
  protected readonly summary = computed(() => {
    const total = this.total();
    const currency = this.currency();
    if (total === null || !positive(total) || !currency) {
      return null;
    }

    const money = (amount: number) => formatMoney(amount, currency);
    const model = this.model();
    const lines: { label: string; value: string; total?: boolean }[] = [];
    if (this.unitsKind()) {
      const [quantity, price] = [decimal(model.quantity), decimal(model.price)];
      const fee = this.target().mode === 'withdraw' ? 0 : decimal(model.fee) || 0;
      lines.push({
        label: `${units(quantity)} × ${money(price)}`,
        value: money(cents(quantity * price)),
      });
      if (fee > 0) {
        lines.push({ label: 'Comisión', value: money(fee) });
      }
    }

    if (this.deposit()) {
      const rate = decimal(model.rate);
      const days = Number(model.days);
      if (positive(rate) && positive(days)) {
        // As the bank counts it: compounded over a year of 360 days.
        const atMaturity = cents(total * Math.pow(1 + rate / 100, days / 360));
        const maturesOn = new Date(`${model.date}T00:00:00`);
        maturesOn.setDate(maturesOn.getDate() + days);
        lines.push(
          { label: 'Inviertes', value: money(total) },
          {
            label: `Interés estimado (${rate.toLocaleString('es-PE')} % TEA)`,
            value: `+${money(cents(atMaturity - total))}`,
          },
          {
            label: `Recibes el ${formatShortDate(toIsoDate(maturesOn))}`,
            value: money(atMaturity),
            total: true,
          },
        );
        return lines;
      }
    }

    const label = this.target().mode === 'withdraw' ? 'Recibes en tu cuenta' : 'Sale de tu cuenta';
    lines.push({ label, value: money(total), total: true });
    return lines;
  });

  protected readonly note = computed(() => {
    switch (this.target().mode) {
      case 'withdraw':
        return 'Vuelve a tu cuenta. Lo que ganaste sobre lo invertido entra como ingreso de «Inversiones»; si perdiste, como gasto.';
      case 'contribute':
        return 'Es una transferencia a tu inversión, no un gasto. Tu patrimonio no cambia.';
      default:
        return 'Es una transferencia desde tu cuenta, no un gasto: tu patrimonio no cambia. La inversión queda en la moneda de la cuenta.';
    }
  });

  protected readonly holdingForm = form(this.model, (path) => {
    validate(path.name, ({ value }) =>
      this.target().mode === 'open' && !this.unitsKind() && value().trim() === ''
        ? { kind: 'required', message: 'Escribe un nombre.' }
        : undefined,
    );
    validate(path.ticker, ({ value }) =>
      this.target().mode === 'open' &&
      this.unitsKind() &&
      value().trim() === '' &&
      this.model().name.trim() === ''
        ? {
            kind: 'required',
            message:
              'Escribe el símbolo, por ejemplo ' + (GUIDE[this.type()].symbolHint ?? '') + '.',
          }
        : undefined,
    );
    validate(path.amount, ({ value }) => {
      if (this.unitsKind()) {
        return undefined;
      }

      const amount = parseAmount(value());
      if (this.target().mode === 'value') {
        return amount === null || amount < 0
          ? { kind: 'amount', message: 'Un valor de cero o más.' }
          : undefined;
      }

      if (!amount || amount <= 0) {
        return { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' };
      }

      return this.target().mode === 'withdraw' && amount > Number(this.holding()?.value ?? 0)
        ? {
            kind: 'max',
            message: `No puedes ${this.action().toLowerCase()} más de lo que vale hoy (${this.worth()}).`,
          }
        : undefined;
    });
    validate(path.quantity, ({ value }) => {
      if (!this.unitsKind() || this.target().mode === 'value') {
        return undefined;
      }

      const quantity = decimal(value());
      if (!positive(quantity) || !hasDecimals(quantity, 8)) {
        return { kind: 'quantity', message: 'Cuántas unidades, con hasta 8 decimales.' };
      }

      return this.target().mode === 'withdraw' && quantity > Number(this.holding()?.quantity ?? 0)
        ? { kind: 'max', message: `Tienes ${this.heldUnits()} unidades.` }
        : undefined;
    });
    validate(path.price, ({ value }) => {
      const price = decimal(value());
      return this.unitsKind() && (!positive(price) || !hasDecimals(price, 8))
        ? { kind: 'amount', message: 'Un precio mayor que cero.' }
        : undefined;
    });
    validate(path.fee, ({ value }) => {
      const fee = value().trim() === '' ? 0 : decimal(value());
      return Number.isNaN(fee) || fee < 0 || !hasDecimals(fee, 2)
        ? { kind: 'amount', message: 'Cero o más, con hasta dos decimales.' }
        : undefined;
    });
    validate(path.rate, ({ value }) => {
      const rate = decimal(value());
      return this.deposit() && (!positive(rate) || rate > 100)
        ? { kind: 'rate', message: 'La TEA, por ejemplo 6.5.' }
        : undefined;
    });
    validate(path.days, ({ value }) => {
      const days = Number(value());
      return this.deposit() && (!Number.isInteger(days) || days < 1 || days > 3650)
        ? { kind: 'days', message: 'Un plazo de 1 a 3650 días.' }
        : undefined;
    });
    validate(path.date, ({ value }) => {
      if (!value()) {
        return { kind: 'required', message: 'Elige una fecha.' };
      }

      return value() > this.todayIso
        ? { kind: 'future', message: 'No puede ser una fecha futura.' }
        : undefined;
    });
    validate(path.accountId, ({ value }) =>
      this.target().mode !== 'value' && !value()
        ? { kind: 'required', message: 'Elige una cuenta.' }
        : undefined,
    );
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected balanceOf(account: Account): string {
    return formatMoney(account.balance, account.currency);
  }

  protected chooseType(type: InvestmentType): void {
    this.model.update((model) => ({ ...model, type }));
    this.failure.set(null);
    this.step.set('details');
  }

  protected setTerm(days: number): void {
    this.model.update((model) => ({ ...model, days: String(days) }));
  }

  protected takeAll(): void {
    this.model.update((model) => ({
      ...model,
      amount: Number(this.holding()?.value ?? 0).toFixed(2),
    }));
  }

  /** Every unit at the price it is worth now, so the investment closes. */
  protected sellAll(): void {
    const holding = this.holding();
    if (holding) {
      this.model.update((model) => ({
        ...model,
        quantity: String(Number(holding.quantity ?? 0)),
        price: model.price || this.unitPriceOf(holding),
      }));
    }
  }

  protected save(): void {
    void submit(this.holdingForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        this.saved.emit(await this.send());
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  /** The price of one unit by the last value the investment had. */
  private unitPriceOf(holding: HoldingSummary): string {
    const quantity = Number(holding.quantity ?? 0);
    return quantity > 0 ? String(Math.round((Number(holding.value) / quantity) * 1e8) / 1e8) : '';
  }

  private async send(): Promise<string> {
    const model = this.model();
    const amount = this.total() ?? 0;
    const target = this.target();
    if (target.mode === 'open') {
      return this.open(amount);
    }

    const { holding } = target;
    const price = this.unitsKind() ? decimal(model.price) : null;
    if (target.mode === 'value') {
      await this.api.value(
        holding.id,
        model.date,
        price === null ? parseAmount(model.amount) : null,
        price,
      );
      return `Valor de «${holding.name}» actualizado.`;
    }

    const quantity = this.unitsKind() ? decimal(model.quantity) : null;
    // A sale is at the market price of that day, which may be above the last one written down: it is written down first,
    // so the investment is worth what is being sold.
    if (target.mode === 'withdraw' && price !== null) {
      await this.api.value(holding.id, model.date, null, price);
    }

    const money = { amount, quantity, occurredOn: model.date, accountId: model.accountId };
    await this.api.move(
      holding.id,
      target.mode === 'withdraw' ? 'withdrawals' : 'contributions',
      money,
      this.idempotencyKey,
    );
    // Buying at a price says what the units are worth that day.
    if (target.mode === 'contribute' && price !== null) {
      await this.api.value(holding.id, model.date, null, price);
    }

    return moveMessage(target.mode, holding, formatMoney(amount, holding.currency), this.unitsKind() ? quantity : undefined);
  }

  private async open(amount: number): Promise<string> {
    const model = this.model();
    const withUnits = this.unitsKind();
    const deposit = this.deposit();
    const ticker = withUnits ? model.ticker.trim().toUpperCase() || null : null;
    const name = model.name.trim() || ticker || '';
    const opened = await this.api.open(
      {
        type: model.type,
        name,
        ticker,
        institution: model.institution.trim() || null,
        amount,
        quantity: withUnits ? decimal(model.quantity) : null,
        openedOn: model.date,
        fromAccountId: model.accountId,
        annualRate: deposit ? decimal(model.rate) : null,
        termDays: deposit ? Number(model.days) : null,
      },
      this.idempotencyKey,
    );
    // The price paid is what each unit is worth that day; the fee is what was paid on top.
    if (withUnits) {
      await this.api.value(opened.holding.id, model.date, null, decimal(model.price));
    }

    return withUnits
      ? `Registraste ${units(decimal(model.quantity))} de «${name}» por ${formatMoney(amount, this.currency())}.`
      : `Registraste «${name}» con ${formatMoney(amount, this.currency())}.`;
  }
}
