import { DOCUMENT } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Account, AccountSummary, BaseTotals, Category, CurrencyTotals, ExchangeRate, Transaction } from '../../core/api/api-types';
import { isManagedAccount } from '../../core/api/managed-accounts';
import { errorMessage } from '../../core/errors/error-messages';
import { PeriodStore } from '../../core/period/period-store';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { formatDay, formatShortDate, monthRange } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { IconTile } from '../../shared/ui/icon-tile';
import { currencySymbol, formatMoney, formatRate, sumAmounts } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { NetWorthCard } from './net-worth-card';
import { TransactionDetail } from './transaction-detail';
import { TransactionForm, TransactionFormTarget } from './transaction-form';
import { MovementFilter, RateBook, STATUS_LABELS, TransactionFilters, TransactionsApi, lookOf } from './transactions-api';
import { TransactionsSummary } from './transactions-summary';

type Tab = 'all' | MovementFilter;

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'transfer', label: 'Transferencias' },
];

const DESKTOP = '(min-width: 1100px)';
const SEARCH_DELAY_MS = 300;

/** Beyond this many currencies the filter is a list to open instead of a row of buttons. */
const MAX_CURRENCY_TABS = 4;

/**
 * The person's movements of the month selected in the top bar (or of every date), newest first. Totals come from the API for
 * everything the filter matches; this page adds nothing up except the net of each day it is showing.
 */
@Component({
  selector: 'app-transactions',
  imports: [
    Dialog,
    EmptyState,
    ErrorState,
    Icon,
    IconTile,
    NetWorthCard,
    PageHeader,
    RouterLink,
    Skeleton,
    TransactionDetail,
    TransactionForm,
    TransactionsSummary,
  ],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Transactions {
  private readonly api = inject(TransactionsApi);
  private readonly period = inject(PeriodStore);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly media = inject(DOCUMENT).defaultView?.matchMedia?.(DESKTOP);

  /** From the URL: the account whose movements to show, when arriving from its page. */
  readonly accountId = input<string>();

  /** A text to search for on arrival, from the global search. */
  readonly q = input<string>();

  /** From the URL: the category whose movements to show (with its subcategories), when arriving from a budget. */
  readonly categoryId = input<string>();

  /** From the URL: `all` to look at every date instead of the month of the top bar, as the global search does. */
  readonly range = input<string>();

  /** From the URL: the movement to open on arrival, as a result of the global search does. */
  readonly open = input<string>();

  protected readonly tabs = TABS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly lookOf = lookOf;
  protected readonly periodLabel = this.period.label;

  protected readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());
  protected readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());
  private readonly exchangeRates = httpResource<ExchangeRate[]>(() => this.api.ratesUrl());
  protected readonly netWorth = httpResource<AccountSummary>(() => this.api.summaryUrl());

  /** The person's rates today, for what an amount is worth now. Empty while they load or when there are none. */
  protected readonly rates = computed(() => new RateBook(this.workspaces.current()?.baseCurrency ?? null, this.exchangeRates.value() ?? []));

  /** "1 US$ = S/ 3.740" for each rate, and the day of the latest, for the header. */
  protected readonly rateChips = computed(() => {
    const book = this.rates();
    const rates = book.all.filter((rate) => rate.currency !== book.baseCurrency);
    if (!book.baseCurrency || rates.length === 0) {
      return null;
    }

    const latest = rates.map((rate) => rate.asOf).sort().at(-1)!;
    return { rates: rates.map((rate) => formatRate(rate.rate, rate.currency, rate.baseCurrency)), since: formatShortDate(latest) };
  });

  protected readonly tab = signal<Tab>('all');
  protected readonly account = linkedSignal(() => this.accountId() ?? '');
  protected readonly category = linkedSignal(() => this.categoryId() ?? '');
  protected readonly allDates = linkedSignal(() => this.range() === 'all');
  protected readonly showVoided = signal(false);
  /** Movements on accounts of one currency; empty for all of them. */
  protected readonly currency = signal('');
  protected readonly moreFiltersOpen = signal(false);

  /** The currencies of the person's accounts, the base one first. Only worth filtering by with more than one. */
  protected readonly currencyTabs = computed(() => {
    const base = this.workspaces.current()?.baseCurrency;
    const codes = [...new Set((this.accounts.value() ?? []).map((account) => account.currency))].sort((a, b) =>
      a === base ? -1 : b === base ? 1 : a.localeCompare(b),
    );
    return codes.length > 1 ? codes.map((code) => ({ code, label: `${currencySymbol(code)} ${code}` })) : [];
  });

  protected readonly manyCurrencies = computed(() => this.currencyTabs().length > MAX_CURRENCY_TABS);

  /** How many of the filters folded under "Más filtros" are on, so they are not forgotten. */
  protected readonly moreFilters = computed(() => [this.account() !== '', this.category() !== '', this.allDates(), this.showVoided()].filter(Boolean).length);

  /** The person's own accounts first; the funds of goals and the capital of investments apart, since other sections move them. */
  protected readonly accountOptions = computed(() => {
    const all = this.accounts.value() ?? [];
    return { own: all.filter((account) => !isManagedAccount(account.type)), managed: all.filter((account) => isManagedAccount(account.type)) };
  });

  /** The categories with their subcategories right below, for the filter. */
  protected readonly categoryOptions = computed(() =>
    (this.categories.value() ?? []).flatMap((parent) => [
      { id: parent.id, label: parent.name },
      ...parent.subcategories.map((child) => ({ id: child.id, label: `${parent.name} › ${child.name}` })),
    ]),
  );

  /** The name of the category filter says what it shows, so it matches what can be read on it. */
  protected readonly categoryFilterLabel = computed(() => {
    const chosen = this.categoryOptions().find((option) => option.id === this.category());
    return `Categoría: ${chosen?.label ?? 'Todas las categorías'}`;
  });

  /** What the list covers, for the header and the empty state. */
  protected readonly scopeLabel = computed(() => (this.allDates() ? 'Todas las fechas' : this.periodLabel()));
  protected readonly searchText = linkedSignal(() => this.q() ?? '');
  private readonly appliedText = linkedSignal(() => (this.q() ?? '').trim());
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly items = signal<readonly Transaction[]>([]);
  protected readonly totals = signal<readonly CurrencyTotals[]>([]);
  protected readonly baseTotals = signal<BaseTotals | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly loadingMore = signal(false);
  private requests = 0;

  protected readonly formTarget = signal<TransactionFormTarget | null>(null);
  private readonly selectedId = linkedSignal<string | null>(() => this.open() ?? null);
  protected readonly isDesktop = signal(this.media?.matches ?? true);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  private readonly filters = computed<TransactionFilters | null>(() => {
    // Nothing to ask until the workspace is known.
    if (!this.api.accountsUrl()) {
      return null;
    }

    const { year, month } = this.period.month();
    const tab = this.tab();
    const range = this.allDates() ? { from: null, to: null } : monthRange(year, month);
    return {
      ...range,
      type: tab === 'all' ? null : tab,
      voided: this.showVoided(),
      accountId: this.account(),
      categoryId: this.category(),
      text: this.appliedText(),
      currency: this.currency(),
    };
  });

  protected readonly hasFilters = computed(
    () =>
      this.tab() !== 'all' ||
      this.account() !== '' ||
      this.category() !== '' ||
      this.allDates() ||
      this.showVoided() ||
      this.appliedText() !== '' ||
      this.currency() !== '',
  );

  /**
   * The page by day, each with the net of the income and expenses it shows: in the base currency, each amount at what
   * it was worth that day, when every one of them can be; otherwise one figure per currency. An opening balance or an
   * adjustment is neither, exactly as in the totals of the API.
   */
  protected readonly days = computed(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const item of this.items()) {
      byDay.set(item.occurredOn, [...(byDay.get(item.occurredOn) ?? []), item]);
    }

    return [...byDay].map(([date, items]) => {
      const counted = items.filter((item) => item.status !== 'voided' && (item.kind === 'income' || item.kind === 'expense'));
      return { date, label: formatDay(date), items, net: this.netOf(counted) };
    });
  });

  /** On desktop the panel always shows something: the chosen movement, or the first. Below it, only a chosen one. */
  protected readonly selected = computed(() => {
    const chosen = this.items().find((item) => item.id === this.selectedId());
    return chosen ?? (this.isDesktop() ? (this.items()[0] ?? null) : null);
  });

  constructor() {
    effect(() => {
      const filters = this.filters();
      if (filters) {
        untracked(() => void this.load(filters, null));
      }
    });

    const onChange = (event: MediaQueryListEvent) => this.isDesktop.set(event.matches);
    this.media?.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => {
      this.media?.removeEventListener('change', onChange);
      clearTimeout(this.searchTimer);
    });
  }

  /** Waits for a pause in the typing before asking the API. */
  protected search(text: string): void {
    this.searchText.set(text);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.appliedText.set(text.trim()), SEARCH_DELAY_MS);
  }

  protected clearFilters(): void {
    clearTimeout(this.searchTimer);
    this.tab.set('all');
    this.currency.set('');
    this.account.set('');
    this.category.set('');
    this.allDates.set(false);
    this.showVoided.set(false);
    this.searchText.set('');
    this.appliedText.set('');
  }

  protected select(transaction: Transaction): void {
    this.selectedId.set(transaction.id);
  }

  protected closeDetail(): void {
    this.selectedId.set(null);
  }

  protected loadMore(): void {
    const filters = this.filters();
    if (filters && this.nextCursor()) {
      void this.load(filters, this.nextCursor());
    }
  }

  protected reload(): void {
    const filters = this.filters();
    if (filters) {
      void this.load(filters, null);
    }

    // Saving, voiding or confirming moves balances: net worth follows.
    if (this.netWorth.hasValue()) {
      this.netWorth.reload();
    }
  }

  protected openPost(): void {
    this.formTarget.set({ mode: 'post', accountId: this.account() || undefined });
  }

  protected openEdit(transaction: Transaction, adjustRate = false): void {
    this.formTarget.set({ mode: 'edit', transaction, adjustRate });
  }

  /** The amount of a row as it reads in the list. A transfer between currencies shows what left and what arrived. */
  protected amountOf(item: Transaction): string {
    const transfer = item.transfer;
    if (transfer && transfer.currencyIn !== transfer.currencyOut && this.account() === '') {
      return `${formatMoney(transfer.amountOut, transfer.currencyOut)} → ${formatMoney(transfer.amountIn, transfer.currencyIn)}`;
    }

    return transfer && this.account() === '' ? formatMoney(item.amount, item.currency) : formatMoney(item.signedAmount, item.currency, { signed: true });
  }

  /** A second line under the amount: the rate of a transfer between currencies, the original price, or what it is in the base currency. */
  protected subOf(item: Transaction): string | null {
    const transfer = item.transfer;
    if (transfer && transfer.currencyIn !== transfer.currencyOut) {
      return formatRate(Number(transfer.amountOut) / Number(transfer.amountIn), transfer.currencyIn, transfer.currencyOut);
    }

    if (item.originalPrice) {
      const price = item.originalPrice;
      return `${formatMoney(price.amount, price.currency)} · ${formatRate(Number(item.amount) / Number(price.amount), price.currency, item.currency)}`;
    }

    const conversion = item.conversion;
    if (!conversion) {
      return null;
    }

    return transfer
      ? `≈ ${formatMoney(conversion.baseAmount, conversion.baseCurrency)}`
      : `≈ ${formatMoney(Number(item.signedAmount) < 0 ? -Number(conversion.baseAmount) : conversion.baseAmount, conversion.baseCurrency, { signed: true })}`;
  }

  protected pickCurrency(code: string): void {
    this.currency.set(this.currency() === code ? '' : code);
  }

  protected onSaved(message: string): void {
    this.formTarget.set(null);
    this.failure.set(null);
    this.notice.set(message);
    this.reload();
  }

  /**
   * The net of some income and expenses: "Neto S/ 120.00 · en PEN" when every amount has a value in the base
   * currency; otherwise one figure per currency, which are never added together.
   */
  private netOf(counted: readonly Transaction[]): string {
    const base = this.workspaces.current()?.baseCurrency;
    const currencies = [...new Set(counted.map((item) => item.currency))].sort();
    const inBase = counted.map((item) => {
      if (item.currency === base) {
        return item.signedAmount;
      }

      return item.conversion ? (Number(item.signedAmount) < 0 ? -Number(item.conversion.baseAmount) : item.conversion.baseAmount) : null;
    });
    if (base && currencies.length > 1 && this.currency() === '' && inBase.every((amount) => amount !== null)) {
      return `Neto ${formatMoney(sumAmounts(inBase as string[]), base, { signed: true })} · en ${base}`;
    }

    return currencies
      .map((currency) => formatMoney(sumAmounts(counted.filter((item) => item.currency === currency).map((item) => item.signedAmount)), currency, { signed: true }))
      .join(' · ');
  }

  protected confirm(transaction: Transaction): Promise<void> {
    return this.run(`«${transaction.description}» confirmado.`, () => this.api.confirm(transaction.id));
  }

  protected voidTransaction(transaction: Transaction, reason: string | null): Promise<void> {
    return this.run(`«${transaction.description}» anulado. Ya no cuenta en saldos ni en totales.`, async () => {
      await this.api.void(transaction.id, reason);
      this.selectedId.set(null);
    });
  }

  /** Loads the first page, replacing the list, or the page after `cursor`, adding to it. */
  private async load(filters: TransactionFilters, cursor: string | null): Promise<void> {
    const request = ++this.requests;
    if (cursor) {
      this.loadingMore.set(true);
    } else if (this.items().length === 0) {
      this.state.set('loading');
    }

    try {
      const page = await this.api.list(filters, cursor);
      // A newer request was sent meanwhile: its answer is the one that counts.
      if (request !== this.requests) {
        return;
      }

      this.items.set(cursor ? [...this.items(), ...page.items] : page.items);
      this.totals.set(page.totals);
      this.baseTotals.set(page.baseTotals);
      this.nextCursor.set(page.nextCursor);
      this.state.set('ready');
    } catch (error) {
      if (request === this.requests) {
        if (cursor) {
          this.failure.set(errorMessage(error));
        } else {
          this.items.set([]);
          this.state.set('error');
        }
      }
    } finally {
      if (request === this.requests) {
        this.loadingMore.set(false);
      }
    }
  }

  private async run(success: string, action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      await action();
      this.notice.set(success);
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
      this.reload();
    }
  }
}
