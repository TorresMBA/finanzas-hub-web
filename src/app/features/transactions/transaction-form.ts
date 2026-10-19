import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Account, AccountType, Category, Transaction, TransactionType } from '../../core/api/api-types';
import { CurrencyCatalog } from '../../core/currency/currency-catalog';
import { isManagedAccount } from '../../core/api/managed-accounts';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { AccountPicker, PickerGroup } from '../../shared/ui/account-picker';
import { sameDayNextMonth, todayIso } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Disclosure } from '../../shared/ui/disclosure';
import { Field } from '../../shared/ui/field';
import { FxBreakdown, FxRow } from '../../shared/ui/fx-breakdown';
import { Icon } from '../../shared/ui/icon';
import { TileColor } from '../../shared/ui/icon-tile';
import { baseFirst, currencyDecimals, currencyLook, currencySymbol, formatMoney, formatRate, parseAmount, sumAmounts } from '../../shared/ui/money';
import { MoneyInput } from '../../shared/ui/money-input';
import { Switch } from '../../shared/ui/switch';
import { TagInput } from '../../shared/ui/tag-input';
import { isValidTag, parseTags } from '../../shared/ui/tags';
import { RateBook, TransactionBody, TransactionsApi } from './transactions-api';

/**
 * What the form is for: a new movement, optionally on a given account, or an income or expense being edited. With
 * `adjustRate` the edit opens on its exchange rate.
 */
export type TransactionFormTarget =
  | { readonly mode: 'post'; readonly accountId?: string }
  | { readonly mode: 'edit'; readonly transaction: Transaction; readonly adjustRate?: boolean };

/** A transfer is registered from the same form, as one more type; it is not a transaction with a category. */
type FormType = TransactionType | 'transfer';

interface TransactionFormModel {
  type: FormType;
  /** In the currency of the account; or the price, when it was set in another currency. */
  amount: string;
  /** The currency of the price when it is not the account's; empty when it is. */
  priceCurrency: string;
  /** What the account was charged for a price in another currency. Empty: the estimate at today's rate. */
  charged: string;
  /** Units of the base currency per unit of the account's, when the person states it. */
  fxRate: string;
  description: string;
  categoryId: string;
  /** The account of the income or expense; the origin of a transfer. */
  accountId: string;
  toAccountId: string;
  /** What arrives, when the destination of a transfer has another currency. */
  destinationAmount: string;
  /** What the bank charged apart for a transfer. */
  fee: string;
  date: string;
  tags: string;
  pending: boolean;
  /** Also schedule it for the same day of every month from the next one on. */
  repeat: boolean;
  merchant: string;
  note: string;
}

const TYPES: readonly { value: FormType; label: string }[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'transfer', label: 'Transferencia' },
];

interface AccountLook {
  readonly icon: string;
  readonly color: TileColor;
  readonly hint: string;
}

const OTHER_ACCOUNT: AccountLook = { icon: 'account_balance', color: 'neutral', hint: '' };

/** How each kind of account looks in the picker. Goal funds and investments are not offered: their sections move them. */
const ACCOUNT_LOOK: Readonly<Partial<Record<AccountType, AccountLook>>> = {
  bank: { icon: 'account_balance', color: 'blue', hint: 'Cuenta bancaria' },
  cash: { icon: 'payments', color: 'green', hint: 'Efectivo' },
  wallet: { icon: 'account_balance_wallet', color: 'violet', hint: 'Billetera' },
  creditCard: { icon: 'credit_card', color: 'amber', hint: 'Tarjeta de crédito' },
};

const MONTH = new Intl.DateTimeFormat('es-PE', { month: 'long' });

/** An amount greater than zero with the decimals its currency allows; the message says how many. */
function amountError(text: string, currency: string): { kind: string; message: string } | undefined {
  const decimals = currencyDecimals(currency);
  return (parseAmount(text, decimals) ?? 0) > 0
    ? undefined
    : { kind: 'amount', message: decimals > 0 ? `Un monto mayor que cero, con hasta ${decimals} decimales.` : 'Un monto mayor que cero, sin decimales.' };
}

/** A rate as the API takes it: greater than zero, up to six decimals. */
function parseRate(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return /^\d{1,7}(\.\d{1,6})?$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}

/** "−S/ 2.15 (0.7%)" over the market, or that there was no cost. */
function costOf(cost: number, over: number, currency: string): FxRow {
  if (Math.abs(cost) < 0.005) {
    return { label: '', value: 'Sin costo', tone: 'good' };
  }

  const share = over ? ` (${((cost / over) * 100).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%)` : '';
  return { label: '', value: `${formatMoney(-cost, currency)}${share}`, tone: cost > 0 ? 'bad' : 'good' };
}

/**
 * The dialog that registers an income, an expense or a transfer, or edits one of the first two. The account is chosen
 * with its balance in sight; a purchase priced in another currency, the rate a bank applied and what a transfer
 * between currencies cost are written as they happened. It saves by itself and reports what it did.
 */
@Component({
  selector: 'app-transaction-form',
  imports: [AccountPicker, Dialog, Disclosure, Field, FormField, FxBreakdown, Icon, MoneyInput, Switch, TagInput],
  template: `
    <app-dialog [title]="target().mode === 'post' ? 'Nueva transacción' : 'Editar transacción'" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <div class="segmented segmented--block" role="group" aria-label="Tipo">
          @for (type of types(); track type.value) {
            <button type="button" [attr.aria-pressed]="model().type === type.value" (click)="chooseType(type.value)">{{ type.label }}</button>
          }
        </div>

        @if (isTransfer()) {
          <p class="form-note">Mueve dinero entre dos cuentas tuyas. No es ingreso ni gasto, y tu patrimonio no cambia (salvo lo que cueste el cambio de moneda).</p>
          <app-field label="Descripción (opcional)" [state]="transactionForm.description()">
            <input class="input" type="text" placeholder="Transferencia" [formField]="transactionForm.description" />
          </app-field>
          <app-field label="Desde" [state]="transactionForm.accountId()">
            <app-account-picker label="Desde" [groups]="originGroups()" [formField]="transactionForm.accountId" />
          </app-field>
          <div class="form-pair">
            <app-field label="Monto que envías" [state]="transactionForm.amount()">
              <app-money-input label="Monto que envías" [currency]="currency() || baseCurrency()" [formField]="transactionForm.amount" />
            </app-field>
            <app-field label="Fecha" [state]="transactionForm.date()">
              <input class="input" type="date" [formField]="transactionForm.date" />
            </app-field>
          </div>
          <span class="arrow" aria-hidden="true"><app-icon name="arrow_downward" [size]="17" /></span>
          <app-field label="Hacia" [state]="transactionForm.toAccountId()">
            <app-account-picker label="Hacia" placeholder="Elige la cuenta que recibe" [groups]="destinationGroups()" [formField]="transactionForm.toAccountId" />
          </app-field>
          @if (destinationCurrency(); as arriving) {
            <app-field label="Monto que recibes" hint="Escribe lo que realmente llegó, como figura en tu banco." [state]="transactionForm.destinationAmount()">
              <app-money-input label="Monto que recibes" [currency]="arriving" [formField]="transactionForm.destinationAmount" />
            </app-field>
            @if (transferFx(); as rows) {
              <app-fx-breakdown [rows]="rows" note="El costo del cambio ya está en los montos: tu patrimonio baja por él, pero no es un gasto." />
            }
          }
          <app-field
            label="Comisión cobrada (opcional)"
            hint="Si tu banco cobró una comisión aparte, se registra como gasto en «Comisiones» de la cuenta de origen."
            [state]="transactionForm.fee()"
          >
            <app-money-input label="Comisión cobrada" [currency]="currency() || baseCurrency()" [formField]="transactionForm.fee" />
          </app-field>
          <app-field label="Nota (opcional)" [state]="transactionForm.note()">
            <input class="input" type="text" [formField]="transactionForm.note" />
          </app-field>
        } @else {
          <app-field label="Descripción" [state]="transactionForm.description()">
            <input class="input" type="text" placeholder="ej. Compra de la semana" [formField]="transactionForm.description" />
          </app-field>
          <app-field label="Cuenta" [state]="transactionForm.accountId()">
            <app-account-picker label="Cuenta" [groups]="originGroups()" [formField]="transactionForm.accountId" />
          </app-field>
          <div class="form-pair form-pair--amount">
            <app-field [label]="foreign() ? 'Precio' : 'Monto'" [state]="transactionForm.amount()">
              <app-money-input
                [label]="foreign() ? 'Precio' : 'Monto'"
                [currency]="priceCurrency() || baseCurrency()"
                [currencies]="currencyChoices()"
                [formField]="transactionForm.amount"
                (currencyChange)="choosePriceCurrency($event)"
              />
            </app-field>
            <app-field label="Fecha" [state]="transactionForm.date()">
              <input class="input" type="date" [formField]="transactionForm.date" />
            </app-field>
          </div>

          @if (foreign()) {
            <section class="foreign" [attr.aria-label]="'Compra en ' + model().priceCurrency">
              <p class="foreign-title"><app-icon name="credit_card" [size]="17" />Compra en {{ model().priceCurrency }}, pagada con {{ accountName() }}</p>
              <app-field label="Se cobra en tu cuenta" [state]="transactionForm.charged()">
                <app-money-input label="Se cobra en tu cuenta" [currency]="currency()" [placeholder]="estimate() ?? '0.00'" [formField]="transactionForm.charged" />
              </app-field>
              @if (purchaseFx(); as rows) {
                <app-fx-breakdown [rows]="rows" />
              }
              <p class="note">
                Es un estimado. Cuando llegue tu estado de cuenta, ajusta el monto cobrado: cuenta en {{ currency() }} y el precio en
                {{ model().priceCurrency }} queda como referencia.
              </p>
              <button type="button" class="link" (click)="choosePriceCurrency(currency())">Volver a {{ currency() }}</button>
            </section>
          } @else if (quickCurrencies().length > 0) {
            <div class="quick">
              <span>¿Compraste en otra moneda?</span>
              @for (code of quickCurrencies(); track code) {
                <button type="button" class="chip" (click)="choosePriceCurrency(code)"><app-icon name="currency_exchange" [size]="14" />Pagar en {{ symbol(code) }}</button>
              }
            </div>
          }

          @if (convertsToBase()) {
            <section class="rate" aria-label="Tipo de cambio">
              <div class="rate-line">
                <span><app-icon name="currency_exchange" [size]="16" />{{ inBaseLine() }}</span>
                <button type="button" class="link" (click)="toggleRate()">{{ editingRate() ? 'Usar el de tu tabla' : 'Editar' }}</button>
              </div>
              @if (editingRate()) {
                <app-field [label]="'1 ' + symbol(currency()) + ' = ' + symbol(baseCurrency())" [state]="transactionForm.fxRate()">
                  <input class="input" type="text" inputmode="decimal" [placeholder]="tableRate() ?? '0.0000'" [formField]="transactionForm.fxRate" />
                </app-field>
              }
              <p class="note">{{ rateNote() }}</p>
            </section>
          }

          <app-field label="Categoría" [state]="transactionForm.categoryId()">
            <select class="input" [formField]="transactionForm.categoryId">
              <option value="">Elige una categoría</option>
              @for (option of categoryOptions(); track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
          </app-field>

          <app-disclosure [label]="target().mode === 'post' ? 'Etiquetas, comercio, nota, repetir' : 'Etiquetas, comercio, nota'" [count]="extras()" [(open)]="moreOpen">
            <app-field label="Etiquetas" [state]="transactionForm.tags()">
              <app-tag-input [suggestions]="suggestedTags()" [formField]="transactionForm.tags" />
            </app-field>
            <app-field label="Comercio" [state]="transactionForm.merchant()">
              <input class="input" type="text" placeholder="ej. Amazon, Tottus, Uber" [formField]="transactionForm.merchant" />
            </app-field>
            <app-field label="Nota" [state]="transactionForm.note()">
              <textarea class="input note-input" rows="2" placeholder="Algo que quieras recordar" [formField]="transactionForm.note"></textarea>
            </app-field>
            @if (target().mode === 'post') {
              <app-switch
                title="Pendiente de revisar"
                [description]="model().pending ? 'Aparece marcada en la lista. Cuenta en el saldo igual.' : 'Márcala si aún debes confirmar el monto o la categoría.'"
                [formField]="transactionForm.pending"
              />
              <app-switch title="Repetir cada mes" [description]="repeatNote()" [formField]="transactionForm.repeat" />
            }
          </app-disclosure>
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : target().mode === 'post' ? 'Registrar' : 'Guardar' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: `
    .form-pair--amount {
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    }
    .arrow {
      align-self: center;
      width: 28px;
      height: 28px;
      margin: -6px 0;
      display: grid;
      place-items: center;
      border-radius: 99px;
      border: 1px solid var(--bd);
      background: var(--sf2);
      color: var(--mu);
    }
    .quick {
      margin-top: -6px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: var(--mu);
    }
    .chip {
      height: 24px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 9px;
      border-radius: 99px;
      background: var(--bls);
      color: var(--bl);
      font-size: 11.5px;
      font-weight: 800;
    }
    .foreign,
    .rate {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border-radius: 12px;
      background: var(--bls);

      app-fx-breakdown {
        padding: 0;
      }
    }
    .foreign-title,
    .rate-line span {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 800;

      app-icon {
        color: var(--bl);
      }
    }
    .rate-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      font-variant-numeric: tabular-nums;

      .link {
        font-size: 12px;
        font-weight: 800;
        color: var(--bl);
      }
    }
    .foreign .link {
      align-self: flex-start;
      font-size: 11.5px;
      font-weight: 800;
      color: var(--mu);
    }
    .note {
      font-size: 11.5px;
      color: var(--tx2);
      text-wrap: pretty;
    }
    .note-input {
      height: auto;
      padding: 10px 12px;
      resize: vertical;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionForm {
  private readonly api = inject(TransactionsApi);
  private readonly today = inject(TODAY);
  private readonly catalog = inject(CurrencyCatalog);

  // One key for the life of this dialog: a second click or a retry repeats the request instead of the effect.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<TransactionFormTarget>();
  readonly accounts = input.required<readonly Account[]>();
  readonly categories = input.required<readonly Category[]>();
  /** The person's rates today: for estimates and to propose the rate of an amount in another currency. */
  readonly rates = input.required<RateBook>();

  /** Emits the message to show once the movement is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  /** A transfer cannot be edited, so an income or expense being edited cannot become one either. */
  protected readonly types = computed(() => (this.target().mode === 'post' ? TYPES : TYPES.filter((type) => type.value !== 'transfer')));

  protected readonly model = linkedSignal<TransactionFormModel>(() => this.initialModel());
  protected readonly isTransfer = computed(() => this.model().type === 'transfer');
  protected readonly symbol = currencySymbol;

  protected readonly currency = computed(() => this.currencyOf(this.model().accountId));
  protected readonly baseCurrency = computed(() => this.rates().baseCurrency ?? '');
  protected readonly accountName = computed(() => this.accounts().find((account) => account.id === this.model().accountId)?.name ?? '');

  /** A price set in another currency than the account's: the amount is the price, and what was charged is asked apart. */
  protected readonly foreign = computed(() => !this.isTransfer() && this.model().priceCurrency !== '' && this.model().priceCurrency !== this.currency());
  /** The currency the amount field is in. */
  protected readonly priceCurrency = computed(() => (this.foreign() ? this.model().priceCurrency : this.currency()));

  /** The rate is open to edit: chosen by the person, or already stated by hand. */
  protected readonly editingRate = linkedSignal(() => {
    const target = this.target();
    return target.mode === 'edit' && (!!target.adjustRate || !!target.transaction.conversion?.isManual);
  });

  /** The folded details start open when an edit already has some, so they are seen. */
  protected readonly moreOpen = linkedSignal(() => {
    const target = this.target();
    return target.mode === 'edit' && (target.transaction.tags.length > 0 || !!target.transaction.merchant || !!target.transaction.note);
  });

  protected readonly transactionForm = form(this.model, (path) => {
    validate(path.amount, ({ value }) => (value().trim() === '' ? { kind: 'required', message: 'Escribe el monto.' } : amountError(value(), this.priceCurrency())));
    validate(path.charged, ({ value }) => {
      if (!this.foreign() || (value().trim() === '' && this.estimate() !== null)) {
        return undefined;
      }

      return value().trim() === '' ? { kind: 'required', message: 'Escribe cuánto se cobró en tu cuenta.' } : amountError(value(), this.currency());
    });
    validate(path.fxRate, ({ value }) => {
      if (!this.convertsToBase() || !this.editingRate() || value().trim() === '') {
        return undefined;
      }

      return parseRate(value()) === null ? { kind: 'rate', message: 'Un tipo de cambio mayor que cero, con hasta 6 decimales.' } : undefined;
    });
    required(path.date, { message: 'Elige una fecha.' });
    validate(path.description, ({ value }) => (!this.isTransfer() && value().trim() === '' ? { kind: 'required', message: 'Escribe una descripción.' } : undefined));
    maxLength(path.description, 120, { message: 'Máximo 120 caracteres.' });
    validate(path.categoryId, ({ value }) => (!this.isTransfer() && value() === '' ? { kind: 'required', message: 'Elige una categoría.' } : undefined));
    required(path.accountId, { message: 'Elige una cuenta.' });
    validate(path.toAccountId, ({ value }) => {
      if (!this.isTransfer()) {
        return undefined;
      }

      if (value() === '') {
        return { kind: 'required', message: 'Elige la cuenta que recibe.' };
      }

      return value() === this.model().accountId ? { kind: 'sameAccount', message: 'Elige una cuenta distinta de la de origen.' } : undefined;
    });
    validate(path.destinationAmount, ({ value }) => (this.destinationCurrency() ? amountError(value(), this.destinationCurrency()!) : undefined));
    validate(path.fee, ({ value }) => (this.isTransfer() && value().trim() !== '' ? amountError(value(), this.currency()) : undefined));
    validate(path.tags, ({ value }) => {
      const tags = parseTags(value());
      if (tags.length > 10) {
        return { kind: 'tooManyTags', message: 'Máximo 10 etiquetas.' };
      }

      return tags.every(isValidTag) ? undefined : { kind: 'tagName', message: 'Cada etiqueta tiene hasta 40 letras, números o guiones.' };
    });
    maxLength(path.merchant, 80, { message: 'Máximo 80 caracteres.' });
    maxLength(path.note, 500, { message: 'Máximo 500 caracteres.' });
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** The categories of the chosen type and their subcategories, plus the one the transaction already has. */
  protected readonly categoryOptions = computed(() => {
    const target = this.target();
    const current = target.mode === 'edit' ? target.transaction.category?.id : undefined;
    return this.categories()
      .filter((category) => category.kind === this.model().type)
      .flatMap((category) => [
        { id: category.id, label: category.name, archived: category.isArchived },
        ...category.subcategories.map((subcategory) => ({
          id: subcategory.id,
          label: `${category.name} › ${subcategory.name}`,
          archived: category.isArchived || subcategory.isArchived,
        })),
      ])
      .filter((option) => !option.archived || option.id === current);
  });

  /** The tags the chosen category suggests, offered as chips. */
  protected readonly suggestedTags = computed(() => {
    const categoryId = this.model().categoryId;
    const category = this.categories().find(
      (candidate) => candidate.id === categoryId || candidate.subcategories.some((subcategory) => subcategory.id === categoryId),
    );
    return category?.tags ?? [];
  });

  /** The person's own accounts in use, plus the one an edit already has. The fund of a goal only moves from the goal. */
  private readonly ownAccounts = computed(() => {
    const target = this.target();
    const current = target.mode === 'edit' ? target.transaction.accountId : undefined;
    return this.accounts().filter((account) => !isManagedAccount(account.type) && (!account.isArchived || account.id === current));
  });

  protected readonly originGroups = computed(() => this.groupsOf(null));
  /** The origin of a transfer cannot also receive it. */
  protected readonly destinationGroups = computed(() => this.groupsOf(this.model().accountId));

  /** The currency of the receiving account when it is not the one that leaves: then both amounts are asked. */
  protected readonly destinationCurrency = computed(() => {
    const arriving = this.isTransfer() ? this.currencyOf(this.model().toAccountId) : '';
    return arriving !== '' && this.currency() !== '' && arriving !== this.currency() ? arriving : null;
  });

  /** The currencies a price can be set in: the account's first, then the rest of the catalog. */
  protected readonly currencyChoices = computed(() => {
    const own = this.currency();
    return own ? [own, ...this.catalog.list().map((currency) => currency.code).filter((code) => code !== own)] : [];
  });

  /** "Pagar en US$": the other currencies, one tap away, for an expense. */
  protected readonly quickCurrencies = computed(() => (this.model().type === 'expense' ? this.currencyChoices().slice(1, 3) : []));

  /** What a price in another currency is charged at today's market rate. Null without a rate. */
  protected readonly estimate = computed(() => {
    const price = parseAmount(this.model().amount, currencyDecimals(this.model().priceCurrency));
    const rate = this.foreign() ? this.rates().cross(this.model().priceCurrency, this.currency()) : null;
    return price && rate ? (price * rate).toFixed(currencyDecimals(this.currency())) : null;
  });

  protected readonly purchaseFx = computed<readonly FxRow[] | null>(() => {
    const { priceCurrency, amount, charged } = this.model();
    const price = parseAmount(amount, currencyDecimals(priceCurrency));
    const paid = parseAmount(charged, currencyDecimals(this.currency())) ?? Number(this.estimate() ?? 0);
    const market = this.rates().cross(priceCurrency, this.currency());
    if (!price || !paid) {
      return null;
    }

    const rows: FxRow[] = [{ label: 'Tipo de cambio del banco', value: formatRate(paid / price, priceCurrency, this.currency()) }];
    if (market !== null) {
      rows.push(
        { label: 'Mercado hoy', value: formatRate(market, priceCurrency, this.currency()) },
        { ...costOf(paid - price * market, price * market, this.currency()), label: 'Recargo por cambio' },
      );
    }

    const base = this.rates().cross(this.currency(), this.baseCurrency());
    if (this.currency() !== this.baseCurrency() && base !== null) {
      rows.push({ label: 'En tu moneda base', value: `≈ ${formatMoney(paid * base, this.baseCurrency())}` });
    }

    return rows;
  });

  protected readonly transferFx = computed<readonly FxRow[] | null>(() => {
    const arriving = this.destinationCurrency();
    const sent = parseAmount(this.model().amount, currencyDecimals(this.currency()));
    const received = arriving ? parseAmount(this.model().destinationAmount, currencyDecimals(arriving)) : null;
    if (!arriving || !sent || !received) {
      return null;
    }

    const rows: FxRow[] = [{ label: 'Tipo de cambio aplicado', value: formatRate(sent / received, arriving, this.currency()) }];
    const market = this.rates().cross(arriving, this.currency());
    if (market !== null) {
      rows.push(
        { label: 'Mercado hoy', value: formatRate(market, arriving, this.currency()) },
        { ...costOf(sent - received * market, received * market, this.currency()), label: 'Costo del cambio' },
      );
    }

    return rows;
  });

  /** An amount in an account whose currency is not the base one is also worth something in the base one. */
  protected readonly convertsToBase = computed(() => !this.isTransfer() && !this.foreign() && this.currency() !== '' && !!this.baseCurrency() && this.currency() !== this.baseCurrency());
  protected readonly tableRate = computed(() => {
    const rate = this.rates().inBase(this.currency());
    return rate === null ? null : rate.toFixed(4);
  });

  /** "≈ S/ 187.00 · 1 US$ = S/ 3.740", with the rate typed or the one of the table. */
  protected readonly inBaseLine = computed(() => {
    const stated = this.editingRate() ? parseRate(this.model().fxRate) : null;
    const rate = stated ?? (this.tableRate() === null ? null : Number(this.tableRate()));
    if (rate === null) {
      return `Sin tipo de cambio para ${this.currency()}`;
    }

    const amount = parseAmount(this.model().amount, currencyDecimals(this.currency())) ?? 0;
    return `≈ ${formatMoney(amount * rate, this.baseCurrency())} · ${formatRate(rate, this.currency(), this.baseCurrency())}`;
  });

  protected readonly rateNote = computed(() => {
    if (this.editingRate()) {
      return 'Tipo de cambio manual: úsalo si tu banco te cobró uno distinto. Se guarda con la transacción.';
    }

    return this.tableRate() === null
      ? `No tienes tipo de cambio para ${this.currency()}: escríbelo aquí o defínelo en Cuentas.`
      : 'Tu tipo de cambio vigente para esa fecha. Se guarda con la transacción y no cambia después.';
  });

  /** How many of the folded details hold something. */
  protected readonly extras = computed(() => {
    const { tags, merchant, note, pending, repeat } = this.model();
    return [parseTags(tags).length > 0, merchant.trim() !== '', note.trim() !== '', pending, repeat].filter(Boolean).length;
  });

  protected readonly repeatNote = computed(() => {
    if (!this.model().repeat) {
      return 'Para gastos fijos como suscripciones o alquiler.';
    }

    const next = sameDayNextMonth(this.model().date || todayIso(this.today()));
    const [year, month, day] = next.split('-').map(Number);
    return `Se registrará el día ${day} de cada mes, desde ${MONTH.format(new Date(year, month - 1, 1))}. La detienes en el Calendario.`;
  });

  constructor() {
    // With a single account there is nothing to choose. The accounts may arrive after the dialog opened, so
    // this fills the one field without touching what the person already typed in the others.
    effect(() => {
      const open = this.accounts().filter((account) => !account.isArchived && !isManagedAccount(account.type));
      untracked(() => {
        if (this.target().mode === 'post' && this.model().accountId === '' && open.length === 1) {
          this.model.update((model) => ({ ...model, accountId: open[0].id }));
        }
      });
    });
  }

  /** The categories offered depend on the type, so changing it asks for the category again. */
  protected chooseType(type: FormType): void {
    if (type !== this.model().type) {
      this.model.update((model) => ({ ...model, type, categoryId: '', priceCurrency: '', charged: '' }));
    }
  }

  /** The account's own currency goes back to a plain amount; another one asks for what was charged. */
  protected choosePriceCurrency(code: string): void {
    this.model.update((model) => ({ ...model, priceCurrency: code === this.currency() ? '' : code, charged: '' }));
  }

  protected toggleRate(): void {
    this.editingRate.set(!this.editingRate());
    this.model.update((model) => ({ ...model, fxRate: '' }));
  }

  protected save(): void {
    void submit(this.transactionForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        this.saved.emit(await this.persist());
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  private async persist(): Promise<string> {
    const target = this.target();
    const value = this.model();
    const note = value.note.trim() || null;
    if (value.type === 'transfer') {
      const decimals = currencyDecimals(this.currency());
      const transfer = await this.api.transfer(
        {
          fromAccountId: value.accountId,
          toAccountId: value.toAccountId,
          amount: parseAmount(value.amount, decimals) ?? 0,
          destinationAmount: this.destinationCurrency() ? parseAmount(value.destinationAmount, currencyDecimals(this.destinationCurrency()!)) : null,
          occurredOn: value.date,
          description: value.description.trim() || null,
          note,
          fee: value.fee.trim() === '' ? null : parseAmount(value.fee, decimals),
        },
        this.idempotencyKey,
      );
      return `Transferencia de ${formatMoney(transfer.amount, transfer.currency)} registrada.`;
    }

    const foreign = this.foreign();
    const price = parseAmount(value.amount, currencyDecimals(this.priceCurrency())) ?? 0;
    const charged = foreign ? (parseAmount(value.charged, currencyDecimals(this.currency())) ?? Number(this.estimate())) : price;
    const body: TransactionBody = {
      type: value.type,
      accountId: value.accountId,
      amount: charged,
      categoryId: value.categoryId,
      occurredOn: value.date,
      description: value.description.trim(),
      merchant: value.merchant.trim() || null,
      note,
      tags: parseTags(value.tags),
      originalAmount: foreign ? price : null,
      originalCurrency: foreign ? value.priceCurrency : null,
      fxRate: this.convertsToBase() && this.editingRate() ? parseRate(value.fxRate) : null,
    };
    if (target.mode === 'edit') {
      await this.api.edit(target.transaction.id, body);
      return `«${body.description}» guardado.`;
    }

    const posted = await this.api.post(body, value.pending, this.idempotencyKey);
    const done = `${value.type === 'income' ? 'Ingreso' : 'Gasto'} de ${formatMoney(posted.amount, posted.currency)} registrado`;
    if (!value.repeat) {
      return `${done}.`;
    }

    // The movement is already in the ledger: failing to schedule the next ones must not look like it was lost.
    try {
      await this.api.repeatMonthly(body, sameDayNextMonth(value.date));
      return `${done}. Se repetirá cada mes.`;
    } catch {
      return `${done}, pero no se pudo programar su repetición. Prográmalo desde el Calendario.`;
    }
  }

  /** The accounts by currency, the base one first, each group with what it holds. */
  private groupsOf(excluded: string | null): PickerGroup[] {
    const accounts = this.ownAccounts();
    const base = this.baseCurrency();
    const currencies = baseFirst(accounts.map((account) => account.currency), base);
    return currencies.map((code) => {
      const inCurrency = accounts.filter((account) => account.currency === code);
      const name = currencyLook(code)?.pluralName ?? code;
      return {
        label: `${name} · ${code}`,
        total: formatMoney(sumAmounts(inCurrency.map((account) => account.balance)), code),
        options: inCurrency.map((account) => {
          const look = ACCOUNT_LOOK[account.type] ?? OTHER_ACCOUNT;
          const isOrigin = account.id === excluded;
          return {
            id: account.id,
            name: account.name,
            hint: isOrigin ? 'Cuenta de origen' : look.hint,
            currency: account.currency,
            balance: account.balance,
            icon: look.icon,
            color: look.color,
            disabled: isOrigin,
          };
        }),
      };
    });
  }

  private currencyOf(accountId: string): string {
    return this.accounts().find((account) => account.id === accountId)?.currency ?? '';
  }

  private initialModel(): TransactionFormModel {
    const target = this.target();
    const blank = { toAccountId: '', destinationAmount: '', fee: '', priceCurrency: '', charged: '', fxRate: '' };
    if (target.mode === 'edit') {
      const transaction = target.transaction;
      const price = transaction.originalPrice;
      const decimals = currencyDecimals(transaction.currency);
      return {
        ...blank,
        type: transaction.kind === 'income' ? 'income' : 'expense',
        // A price in another currency is edited as it was entered: the price, and what was charged apart.
        amount: price ? Number(price.amount).toFixed(currencyDecimals(price.currency)) : Number(transaction.amount).toFixed(decimals),
        priceCurrency: price?.currency ?? '',
        charged: price ? Number(transaction.amount).toFixed(decimals) : '',
        fxRate: transaction.conversion?.isManual ? String(Number(transaction.conversion.rate)) : '',
        description: transaction.description,
        categoryId: transaction.category?.id ?? '',
        accountId: transaction.accountId,
        date: transaction.occurredOn,
        tags: transaction.tags.join(', '),
        pending: transaction.status === 'pending',
        repeat: false,
        merchant: transaction.merchant ?? '',
        note: transaction.note ?? '',
      };
    }

    return {
      ...blank,
      type: 'expense',
      amount: '',
      description: '',
      categoryId: '',
      accountId: target.accountId ?? '',
      date: todayIso(this.today()),
      tags: '',
      pending: false,
      repeat: false,
      merchant: '',
      note: '',
    };
  }
}
