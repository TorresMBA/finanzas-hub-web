import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CreateSharedExpenseRequest, SharedExpense, SharedGroupDetail, SharedGroups, SplitType } from '../../core/api/api-types';
import { IDEMPOTENCY_KEY } from '../../core/http/api-interceptors';
import { WorkspaceStore } from '../../core/workspace/workspace-store';

export const STATUS_LOOK: Readonly<Record<SharedExpense['status'], { label: string; tone: 'ok' | 'warn' | 'info' | 'none' }>> = {
  pending: { label: 'Por pagar', tone: 'warn' },
  partiallyPaid: { label: 'Pagado en parte', tone: 'info' },
  settled: { label: 'Liquidado', tone: 'ok' },
  cancelled: { label: 'Cancelado', tone: 'none' },
};

/** The list of groups with the detail of each one, by group id. */
export interface SharedBoard {
  readonly list: SharedGroups;
  readonly details: ReadonlyMap<string, SharedGroupDetail>;
}

export const SPLIT_TYPES: readonly { value: SplitType; label: string; unit: string }[] = [
  { value: 'equal', label: 'Partes iguales', unit: '' },
  { value: 'percentage', label: 'Porcentajes', unit: '%' },
  { value: 'fixedAmount', label: 'Montos', unit: '' },
  { value: 'shares', label: 'Partes', unit: 'partes' },
];

/**
 * What each one would pay, for the preview of the form. The server divides again with the same rule: the cents
 * left over by rounding go, one each, to those whose part was cut the most. Null when the values do not add up.
 */
export function previewSplit(total: number, type: SplitType, values: readonly number[]): number[] | null {
  if (values.length === 0 || !(total > 0)) {
    return null;
  }

  if (type === 'fixedAmount') {
    return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) === Math.round(total * 100) ? [...values] : null;
  }

  const weights = type === 'equal' ? values.map(() => 1) : values;
  const sum = weights.reduce((all, weight) => all + weight, 0);
  if (weights.some((weight) => !(weight >= 0)) || sum <= 0 || (type === 'percentage' && Math.round(sum * 100) !== 10000) || (type === 'shares' && weights.some((weight) => weight <= 0))) {
    return null;
  }

  const cents = Math.round(total * 100);
  const exact = weights.map((weight) => (cents * weight) / sum);
  const parts = exact.map((amount) => Math.floor(amount + 1e-9));
  const leftover = cents - parts.reduce((all, part) => all + part, 0);
  exact
    .map((amount, index) => ({ index, cut: amount - parts[index] }))
    .sort((a, b) => b.cut - a.cut || a.index - b.index)
    .slice(0, leftover)
    .forEach(({ index }) => parts[index]++);
  return parts.map((part) => part / 100);
}

/** The calls about the groups the signed-in person splits expenses in, in the selected workspace. */
@Injectable({ providedIn: 'root' })
export class SharedApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);

  /** Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly groupsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/shared-groups` : undefined));
  readonly accountsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/accounts` : undefined));
  readonly categoriesUrl = computed(() => (this.workspaces.current() ? `${this.base()}/categories?kind=expense` : undefined));

  /**
   * The list and, behind it, every group as the person sees it: the summary adds up what is owed per person and
   * per group over all of them. The groups of a person are a handful, so asking for each one is cheap.
   */
  async board(groupsUrl: string): Promise<SharedBoard> {
    const list = await firstValueFrom(this.http.get<SharedGroups>(groupsUrl));
    const details = await Promise.all(list.groups.map((group) => firstValueFrom(this.http.get<SharedGroupDetail>(`${groupsUrl}/${group.id}`))));
    return { list, details: new Map(details.map((detail) => [detail.group.id, detail])) };
  }

  createGroup(name: string, memberUserIds: readonly string[]): Promise<SharedGroupDetail> {
    return firstValueFrom(this.http.post<SharedGroupDetail>(`${this.base()}/shared-groups`, { name, memberUserIds }));
  }

  addMember(groupId: string, userId: string): Promise<SharedGroupDetail> {
    return firstValueFrom(this.http.post<SharedGroupDetail>(`${this.base()}/shared-groups/${groupId}/members`, { userId }));
  }

  /** Who created the group removes someone; anyone else leaves by naming themselves. */
  removeMember(groupId: string, userId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base()}/shared-groups/${groupId}/members/${userId}`));
  }

  archive(groupId: string): Promise<SharedGroupDetail> {
    return firstValueFrom(this.http.post<SharedGroupDetail>(`${this.base()}/shared-groups/${groupId}/archive`, null));
  }

  /** `key` makes the request safe to repeat: create it when the form opens, not when it is sent. */
  createExpense(groupId: string, request: CreateSharedExpenseRequest, key: string): Promise<SharedGroupDetail> {
    return firstValueFrom(this.http.post<SharedGroupDetail>(`${this.base()}/shared-groups/${groupId}/expenses`, request, this.withKey(key)));
  }

  cancelExpense(groupId: string, expenseId: string): Promise<SharedGroupDetail> {
    return firstValueFrom(this.http.post<SharedGroupDetail>(`${this.base()}/shared-groups/${groupId}/expenses/${expenseId}/cancel`, null));
  }

  recordSettlement(
    groupId: string,
    request: { fromUserId: string; toUserId: string; amount: number; accountId: string | null; categoryId: string | null },
    key: string,
  ): Promise<SharedGroupDetail> {
    return firstValueFrom(this.http.post<SharedGroupDetail>(`${this.base()}/shared-groups/${groupId}/settlements`, request, this.withKey(key)));
  }

  /** Puts a payment already registered in one of the accounts of the person. */
  linkAccount(groupId: string, settlementId: string, accountId: string, categoryId: string | null, key: string): Promise<SharedGroupDetail> {
    return firstValueFrom(
      this.http.post<SharedGroupDetail>(`${this.base()}/shared-groups/${groupId}/settlements/${settlementId}/link-account`, { accountId, categoryId }, this.withKey(key)),
    );
  }

  voidSettlement(groupId: string, settlementId: string): Promise<SharedGroupDetail> {
    return firstValueFrom(this.http.post<SharedGroupDetail>(`${this.base()}/shared-groups/${groupId}/settlements/${settlementId}/void`, null));
  }

  remind(groupId: string, userId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base()}/shared-groups/${groupId}/members/${userId}/remind`, null));
  }

  private withKey(key: string): { context: HttpContext } {
    return { context: new HttpContext().set(IDEMPOTENCY_KEY, key) };
  }
}
