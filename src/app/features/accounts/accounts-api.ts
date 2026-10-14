import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Account, AccountType, ExchangeRate, OpenAccountRequest, Transaction, UpdateAccountRequest } from '../../core/api/api-types';
import { IDEMPOTENCY_KEY } from '../../core/http/api-interceptors';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { TileColor } from '../../shared/ui/icon-tile';

const GOAL_FUND = { value: 'goalFund', label: 'Fondo de meta', icon: 'flag', color: 'violet' } as const;

export const ACCOUNT_TYPES: readonly { value: AccountType; label: string; icon: string; color: TileColor }[] = [
  { value: 'bank', label: 'Banco', icon: 'account_balance', color: 'blue' },
  { value: 'cash', label: 'Efectivo', icon: 'payments', color: 'green' },
  { value: 'wallet', label: 'Billetera', icon: 'account_balance_wallet', color: 'violet' },
  { value: 'creditCard', label: 'Tarjeta', icon: 'credit_card', color: 'amber' },
];

export const CURRENCIES: readonly { code: string; label: string; plural: string }[] = [
  { code: 'PEN', label: 'Sol peruano (S/)', plural: 'soles' },
  { code: 'USD', label: 'Dólar estadounidense (US$)', plural: 'dólares' },
  { code: 'EUR', label: 'Euro (€)', plural: 'euros' },
];

export function accountType(type: AccountType) {
  // The fund of a goal is opened by the goal, so it is not among the types a person can choose.
  return type === 'goalFund' ? GOAL_FUND : (ACCOUNT_TYPES.find((candidate) => candidate.value === type) ?? ACCOUNT_TYPES[0]);
}

export function currencyName(code: string): string {
  return CURRENCIES.find((candidate) => candidate.code === code)?.plural ?? code;
}

/** What paying a card sends. `sourceAmount` only when the paying account has another currency. */
export interface CardPayment {
  readonly fromAccountId: string;
  readonly amount: number;
  readonly sourceAmount: number | null;
  readonly occurredOn: string;
}

/** The calls that change the accounts of the signed-in person in the selected workspace. */
@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);

  /** Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly accountsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/accounts?includeArchived=true` : undefined));

  /** Net worth, in the base currency and currency by currency. */
  readonly summaryUrl = computed(() => (this.workspaces.current() ? `${this.base()}/accounts/summary` : undefined));

  /** The last movements of one account. */
  movementsUrl(accountId: string): string {
    return `${this.base()}/transactions?accountId=${accountId}&limit=6`;
  }

  /** `key` makes the request safe to repeat: create it when the form opens, not when it is sent. */
  open(request: OpenAccountRequest, key: string): Promise<Account> {
    return firstValueFrom(this.http.post<Account>(`${this.base()}/accounts`, request, { context: withKey(key) }));
  }

  update(accountId: string, request: UpdateAccountRequest): Promise<Account> {
    return firstValueFrom(this.http.patch<Account>(`${this.base()}/accounts/${accountId}`, request));
  }

  adjustBalance(accountId: string, actualBalance: number, occurredOn: string, key: string): Promise<Account> {
    return firstValueFrom(
      this.http.post<Account>(`${this.base()}/accounts/${accountId}/adjust-balance`, { actualBalance, occurredOn }, { context: withKey(key) }),
    );
  }

  payCard(cardId: string, payment: CardPayment, key: string): Promise<Transaction> {
    return firstValueFrom(this.http.post<Transaction>(`${this.base()}/accounts/${cardId}/payments`, payment, { context: withKey(key) }));
  }

  /** States how much of the base currency one unit of `currency` is worth from today on. */
  setRate(currency: string, rate: number): Promise<ExchangeRate> {
    return firstValueFrom(this.http.put<ExchangeRate>(`${this.base()}/exchange-rates/${currency}`, { rate }));
  }

  archive(accountId: string): Promise<Account> {
    return firstValueFrom(this.http.post<Account>(`${this.base()}/accounts/${accountId}/archive`, null));
  }

  restore(accountId: string): Promise<Account> {
    return firstValueFrom(this.http.post<Account>(`${this.base()}/accounts/${accountId}/restore`, null));
  }
}

function withKey(key: string): HttpContext {
  return new HttpContext().set(IDEMPOTENCY_KEY, key);
}
