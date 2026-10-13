import { DOCUMENT } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Account, BaseTotals, Category, CurrencyTotals, Transaction } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { PeriodStore } from '../../core/period/period-store';
import { formatDay, monthRange } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { IconTile } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney, sumAmounts } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { TransactionDetail } from './transaction-detail';
import { TransactionForm, TransactionFormTarget } from './transaction-form';
import { MovementFilter, STATUS_LABELS, TransactionFilters, TransactionsApi, lookOf } from './transactions-api';

type Tab = 'all' | MovementFilter;

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'transfer', label: 'Transferencias' },
];

const DESKTOP = '(min-width: 1100px)';
const SEARCH_DELAY_MS = 300;

/**
 * The person's movements of the month selected in the top bar, newest first. Totals come from the API for
 * everything the filter matches; this page adds nothing up except the net of each day it is showing.
 */
@Component({
  selector: 'app-transactions',
  imports: [Dialog, EmptyState, ErrorState, Icon, IconTile, MoneyPipe, PageHeader, RouterLink, Skeleton, TransactionDetail, TransactionForm],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Transactions {
  private readonly api = inject(TransactionsApi);
  private readonly period = inject(PeriodStore);
  private readonly media = inject(DOCUMENT).defaultView?.matchMedia?.(DESKTOP);

  /** From the URL: the account whose movements to show, when arriving from its page. */
  readonly accountId = input<string>();

  protected readonly tabs = TABS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly lookOf = lookOf;
  protected readonly periodLabel = this.period.label;

  protected readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());
  protected readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());

  protected readonly tab = signal<Tab>('all');
  protected readonly account = linkedSignal(() => this.accountId() ?? '');
  protected readonly showVoided = signal(false);
  protected readonly searchText = signal('');
  private readonly appliedText = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly items = signal<readonly Transaction[]>([]);
  protected readonly totals = signal<readonly CurrencyTotals[]>([]);
  private readonly baseTotals = signal<BaseTotals | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly loadingMore = signal(false);
  private requests = 0;

  protected readonly formTarget = signal<TransactionFormTarget | null>(null);
  private readonly selectedId = signal<string | null>(null);
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
    return { ...monthRange(year, month), type: tab === 'all' ? null : tab, voided: this.showVoided(), accountId: this.account(), text: this.appliedText() };
  });

  /**
   * Everything in the base currency, when the per-currency summaries alone do not say it: there is more than one
   * currency, or the only one is not the base.
   */
  protected readonly inBase = computed(() => {
    const base = this.baseTotals();
    const totals = this.totals();
    return base && (totals.length > 1 || (totals.length === 1 && totals[0].currency !== base.currency)) ? base : null;
  });

  protected readonly hasFilters = computed(() => this.tab() !== 'all' || this.account() !== '' || this.showVoided() || this.appliedText() !== '');

  /**
   * The page by day, each with the net of the income and expenses it shows, one figure per currency. An opening
   * balance or an adjustment is neither, exactly as in the totals of the API.
   */
  protected readonly days = computed(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const item of this.items()) {
      byDay.set(item.occurredOn, [...(byDay.get(item.occurredOn) ?? []), item]);
    }

    return [...byDay].map(([date, items]) => {
      const counted = items.filter((item) => item.status !== 'voided' && (item.kind === 'income' || item.kind === 'expense'));
      return {
        date,
        label: formatDay(date),
        items,
        nets: [...new Set(counted.map((item) => item.currency))]
          .sort()
          .map((currency) => formatMoney(sumAmounts(counted.filter((item) => item.currency === currency).map((item) => item.signedAmount)), currency, { signed: true })),
      };
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
    this.account.set('');
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
  }

  protected openPost(): void {
    this.formTarget.set({ mode: 'post', accountId: this.account() || undefined });
  }

  protected openEdit(transaction: Transaction): void {
    this.formTarget.set({ mode: 'edit', transaction });
  }

  protected onSaved(message: string): void {
    this.formTarget.set(null);
    this.failure.set(null);
    this.notice.set(message);
    this.reload();
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
