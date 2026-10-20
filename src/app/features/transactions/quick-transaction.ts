import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Account, Category, ExchangeRate } from '../../core/api/api-types';
import { MovementsFeed, QUICK_OUTLET } from '../../core/movements/movements-feed';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { TransactionForm, TransactionFormTarget } from './transaction-form';
import { RateBook, TransactionsApi } from './transactions-api';

/**
 * The dialog to register a movement from any page, opened by the floating button of the frame. It is the same form
 * as in Transacciones, with the accounts, categories and rates as they are now; once saved, the page behind catches up.
 */
@Component({
  selector: 'app-quick-transaction',
  imports: [TransactionForm],
  template: `
    <app-transaction-form
      [target]="target"
      [accounts]="accounts.value() ?? []"
      [categories]="categories.value() ?? []"
      [rates]="rates()"
      (saved)="onSaved($event)"
      (closed)="close()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickTransaction {
  private readonly api = inject(TransactionsApi);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly router = inject(Router);
  private readonly feed = inject(MovementsFeed);

  protected readonly target: TransactionFormTarget = { mode: 'post' };
  protected readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());
  protected readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());
  private readonly exchangeRates = httpResource<ExchangeRate[]>(() => this.api.ratesUrl());
  protected readonly rates = computed(() => new RateBook(this.workspaces.current()?.baseCurrency ?? null, this.exchangeRates.value() ?? []));

  protected onSaved(message: string): void {
    this.feed.saved(message);
    this.close();
  }

  protected close(): void {
    void this.router.navigate([{ outlets: { [QUICK_OUTLET]: null } }], { skipLocationChange: true });
  }
}
