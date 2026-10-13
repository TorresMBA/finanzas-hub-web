import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OperationKind, OperationStatus, PostTransferRequest, Transaction, TransactionPage, TransactionType } from '../../core/api/api-types';
import { IDEMPOTENCY_KEY } from '../../core/http/api-interceptors';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { TileColor } from '../../shared/ui/icon-tile';

export const KIND_LABELS: Readonly<Record<OperationKind, string>> = {
  income: 'Ingreso',
  expense: 'Gasto',
  refund: 'Reembolso',
  transfer: 'Transferencia',
  adjustment: 'Ajuste de saldo',
  openingBalance: 'Saldo inicial',
};

export const STATUS_LABELS: Readonly<Record<OperationStatus, string>> = { confirmed: 'Confirmada', pending: 'Pendiente', voided: 'Anulada' };

/** The kinds of movement the list can be narrowed to. */
export type MovementFilter = TransactionType | 'transfer';

/** The icon and colour of a movement: its category's, the one of a transfer, or a neutral one for what the application registered. */
export function lookOf(transaction: Transaction): { icon: string; color: TileColor } {
  const voided = transaction.status === 'voided';
  if (transaction.category) {
    return { icon: transaction.category.icon, color: voided ? 'neutral' : (transaction.category.color as TileColor) };
  }

  if (transaction.transfer) {
    return transaction.transfer.isCardPayment
      ? { icon: 'credit_card', color: voided ? 'neutral' : 'amber' }
      : { icon: 'swap_horiz', color: voided ? 'neutral' : 'blue' };
  }

  return { icon: transaction.kind === 'adjustment' ? 'tune' : 'flag', color: 'neutral' };
}

export interface TransactionFilters {
  readonly type: MovementFilter | null;
  readonly voided: boolean;
  readonly accountId: string;
  readonly text: string;
  readonly from: string;
  readonly to: string;
}

/** What a transaction says, as the form sends it. */
export interface TransactionBody {
  readonly type: TransactionType;
  readonly accountId: string;
  readonly amount: number;
  readonly categoryId: string;
  readonly occurredOn: string;
  readonly description: string;
  readonly merchant: string | null;
  readonly note: string | null;
  readonly tags: readonly string[];
}

/** The calls about the transactions of the signed-in person in the selected workspace. */
@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);

  /** Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly accountsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/accounts?includeArchived=true` : undefined));
  readonly categoriesUrl = computed(() => (this.workspaces.current() ? `${this.base()}/categories?includeArchived=true` : undefined));

  list(filters: TransactionFilters, cursor: string | null): Promise<TransactionPage> {
    let params = new HttpParams().set('from', filters.from).set('to', filters.to).set('limit', 50);
    if (filters.type) params = params.set('type', filters.type);
    if (filters.voided) params = params.set('status', 'voided');
    if (filters.accountId) params = params.set('accountId', filters.accountId);
    if (filters.text) params = params.set('q', filters.text);
    if (cursor) params = params.set('cursor', cursor);
    return firstValueFrom(this.http.get<TransactionPage>(`${this.base()}/transactions`, { params }));
  }

  /** `key` makes the request safe to repeat: create it when the form opens, not when it is sent. */
  post(body: TransactionBody, pending: boolean, key: string): Promise<Transaction> {
    return firstValueFrom(
      this.http.post<Transaction>(`${this.base()}/transactions`, { ...body, pending }, { context: new HttpContext().set(IDEMPOTENCY_KEY, key) }),
    );
  }

  /** Moves money between two accounts of the person. It comes back as a movement like any other. */
  transfer(body: PostTransferRequest, key: string): Promise<Transaction> {
    return firstValueFrom(this.http.post<Transaction>(`${this.base()}/transfers`, body, { context: new HttpContext().set(IDEMPOTENCY_KEY, key) }));
  }

  edit(transactionId: string, body: TransactionBody): Promise<Transaction> {
    return firstValueFrom(this.http.patch<Transaction>(`${this.base()}/transactions/${transactionId}`, body));
  }

  confirm(transactionId: string): Promise<Transaction> {
    return firstValueFrom(this.http.post<Transaction>(`${this.base()}/transactions/${transactionId}/confirm`, null));
  }

  void(transactionId: string, reason: string | null): Promise<Transaction> {
    return firstValueFrom(this.http.post<Transaction>(`${this.base()}/transactions/${transactionId}/void`, { reason }));
  }
}
