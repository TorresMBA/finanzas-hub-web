import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Account, AccountSummary, Transaction, TransactionPage } from '../../core/api/api-types';
import { isManagedAccount } from '../../core/api/managed-accounts';
import { errorMessage } from '../../core/errors/error-messages';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { formatShortDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { IconTile } from '../../shared/ui/icon-tile';
import { MoneyPipe, formatMoney, sumAmounts } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatCard } from '../../shared/ui/stat-card';
import { AccountForm, AccountFormTarget } from './account-form';
import { AccountsApi, accountType } from './accounts-api';
import { CardPaymentForm } from './card-payment-form';
import { ExchangeRateForm, ExchangeRateTarget } from './exchange-rate-form';

type Tab = 'all' | 'banks' | 'wallets' | 'cards';

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'banks', label: 'Bancos' },
  { value: 'wallets', label: 'Efectivo y billeteras' },
  { value: 'cards', label: 'Tarjetas' },
];

/** How much of its line a card has used, and how worried to look about it. */
function usageOf(account: Account): { percent: number; level: 'ok' | 'warn' | 'over' } | null {
  const card = account.creditCard;
  if (!card) {
    return null;
  }

  const percent = Math.round((Number(card.used) / Number(card.creditLimit)) * 100);
  return { percent, level: percent >= 100 ? 'over' : percent >= 70 ? 'warn' : 'ok' };
}

/** One amount per currency: balances in different currencies are never added together. */
function totalsByCurrency(accounts: readonly Account[]): { currency: string; total: number }[] {
  const currencies = [...new Set(accounts.map((account) => account.currency))].sort();
  return currencies.map((currency) => ({
    currency,
    total: sumAmounts(accounts.filter((account) => account.currency === currency).map((account) => account.balance)),
  }));
}

/**
 * The person's own accounts with their balances, and what they add up to. A balance is never stored: the API
 * derives it from the movements every time, and net worth comes from the API too, so this page only shows
 * what it is told.
 */
@Component({
  selector: 'app-accounts',
  imports: [AccountForm, CardPaymentForm, EmptyState, ErrorState, ExchangeRateForm, Icon, IconTile, MoneyPipe, PageHeader, RouterLink, Skeleton, StatCard],
  templateUrl: './accounts.html',
  styleUrl: './accounts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Accounts {
  private readonly api = inject(AccountsApi);
  private readonly injector = inject(Injector);
  private readonly detail = viewChild<ElementRef<HTMLElement>>('detail');
  protected readonly workspaces = inject(WorkspaceStore);

  protected readonly tabs = TABS;
  protected readonly typeOf = accountType;
  protected readonly shortDate = formatShortDate;
  protected readonly usageOf = usageOf;

  // Archived ones come too and are hidden here, so showing them is instant.
  protected readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());
  protected readonly summary = httpResource<AccountSummary>(() => this.api.summaryUrl());

  protected readonly tab = signal<Tab>('all');
  protected readonly isManaged = (account: Account) => isManagedAccount(account.type);
  protected readonly showArchived = signal(false);
  protected readonly formTarget = signal<AccountFormTarget | null>(null);
  protected readonly payingCard = signal<Account | null>(null);
  protected readonly rateTarget = signal<ExchangeRateTarget | null>(null);
  private readonly selectedId = signal<string | null>(null);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly all = computed(() => this.accounts.value() ?? []);
  protected readonly active = computed(() => this.all().filter((account) => !account.isArchived));
  protected readonly archivedCount = computed(() => this.all().length - this.active().length);

  /** Net worth, what is owned and what is owed, in the base currency. Empty until the workspace has one. */
  protected readonly stats = computed(() => {
    const summary = this.summary.value();
    const currency = summary?.baseCurrency;
    return summary && currency
      ? [
          { label: 'Patrimonio', value: formatMoney(summary.netWorth, currency), icon: 'savings', color: 'green' as const },
          { label: 'Tienes', value: formatMoney(summary.assets, currency), icon: 'account_balance', color: 'blue' as const },
          { label: 'Debes', value: formatMoney(summary.debts, currency), icon: 'credit_card', color: 'amber' as const },
        ]
      : [];
  });

  /** The other currencies the person has money in, each with the rate that brings it to the base one. */
  protected readonly rates = computed(() => {
    const summary = this.summary.value();
    const baseCurrency = summary?.baseCurrency;
    return summary && baseCurrency
      ? summary.currencies.filter((position) => position.currency !== baseCurrency).map((position) => ({ currency: position.currency, baseCurrency, rate: position.rate }))
      : [];
  });

  protected readonly groups = computed(() => {
    const visible = this.all().filter((account) => this.showArchived() || !account.isArchived);
    const tab = this.tab();
    return [
      { id: 'banks', label: 'Cuentas bancarias', accounts: visible.filter((account) => account.type === 'bank') },
      { id: 'wallets', label: 'Efectivo y billeteras', accounts: visible.filter((account) => account.type === 'cash' || account.type === 'wallet') },
      { id: 'cards', label: 'Tarjetas de crédito', accounts: visible.filter((account) => account.type === 'creditCard') },
      // What the person put aside for their goals. It moves from Metas, not from here.
      { id: 'goals', label: 'Fondos de metas', accounts: visible.filter((account) => account.type === 'goalFund') },
      // The capital put into investments. It moves from Inversiones.
      { id: 'investments', label: 'Inversiones', accounts: visible.filter((account) => account.type === 'investment') },
    ]
      .filter((group) => (tab === 'all' || tab === group.id) && group.accounts.length > 0)
      .map((group) => ({ ...group, totals: totalsByCurrency(group.accounts.filter((account) => !account.isArchived)) }));
  });

  /** The account in the detail panel: the chosen one while it is on screen, otherwise the first. */
  protected readonly selected = computed(() => {
    const visible = this.groups().flatMap((group) => group.accounts);
    return visible.find((account) => account.id === this.selectedId()) ?? visible[0] ?? null;
  });

  // A string, so the movements are asked again only when another account is selected, not every time the list reloads.
  private readonly movementsUrl = computed(() => {
    const account = this.selected();
    return account ? this.api.movementsUrl(account.id) : undefined;
  });
  protected readonly movements = httpResource<TransactionPage>(() => this.movementsUrl());

  /** For a transfer, the account on the other side of it. */
  protected counterpart(movement: Transaction, accountId: string): string {
    const transfer = movement.transfer;
    if (!transfer) {
      return '';
    }

    return transfer.toAccountId === accountId ? ` · desde ${transfer.fromAccountName}` : ` · hacia ${transfer.toAccountName}`;
  }

  protected select(account: Account): void {
    this.selectedId.set(account.id);
    // Below the desktop width the detail is under the list: bring it into view so the tap visibly did something.
    afterNextRender(() => this.detail()?.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), { injector: this.injector });
  }

  protected open(target: AccountFormTarget): void {
    this.formTarget.set(target);
  }

  protected onSaved(message: string): void {
    this.formTarget.set(null);
    this.payingCard.set(null);
    this.rateTarget.set(null);
    this.failure.set(null);
    this.notice.set(message);
    this.reload();
  }

  protected archive(account: Account): Promise<void> {
    return this.run(`«${account.name}» archivada. Conserva su saldo y sus movimientos, pero ya no se ofrece.`, () => this.api.archive(account.id));
  }

  protected restore(account: Account): Promise<void> {
    return this.run(`«${account.name}» restaurada.`, () => this.api.restore(account.id));
  }

  protected reload(): void {
    this.accounts.reload();
    this.summary.reload();
    this.movements.reload();
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
