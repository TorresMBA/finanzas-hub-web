import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CategorizationRule, ImportDetail, ImportRecordState, NewAccountType } from '../../core/api/api-types';
import { IDEMPOTENCY_KEY } from '../../core/http/api-interceptors';
import { WorkspaceStore } from '../../core/workspace/workspace-store';

export type RecordFilter = 'all' | 'pending' | 'ready' | 'duplicate' | 'excluded' | 'invalid' | 'imported';

/** How each state of a line is called and coloured. */
export const STATE_LOOK: Readonly<Record<ImportRecordState, { label: string; tone: 'ok' | 'warn' | 'over' | 'info' | 'none' }>> = {
  ready: { label: 'Listo', tone: 'ok' },
  needsAccount: { label: 'Sin cuenta', tone: 'warn' },
  needsCategory: { label: 'Sin categoría', tone: 'warn' },
  currencyMismatch: { label: 'Otra moneda', tone: 'warn' },
  duplicate: { label: 'Ya registrado', tone: 'info' },
  excluded: { label: 'Excluido', tone: 'none' },
  invalid: { label: 'No se pudo leer', tone: 'over' },
  imported: { label: 'Importado', tone: 'ok' },
};

export const NEW_ACCOUNT_TYPES: readonly { value: NewAccountType; label: string }[] = [
  { value: 'bank', label: 'banco' },
  { value: 'cash', label: 'efectivo' },
  { value: 'wallet', label: 'billetera' },
];

/** The calls about the imports and the rules of the signed-in person. Like the ledger, they are theirs in any workspace. */
@Injectable({ providedIn: 'root' })
export class IntegrationsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);
  private readonly ready = computed(() => this.workspaces.current() !== null && this.workspaces.current() !== undefined);

  /** Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly importsUrl = computed(() => (this.ready() ? `${this.base()}/imports` : undefined));
  readonly rulesUrl = computed(() => (this.ready() ? `${this.base()}/categorization-rules` : undefined));
  readonly accountsUrl = computed(() => (this.ready() ? `${this.base()}/accounts` : undefined));
  readonly categoriesUrl = computed(() => (this.ready() ? `${this.base()}/categories` : undefined));

  detailUrl(importId: string | null, filter: RecordFilter, offset: number): string | undefined {
    if (!this.ready() || !importId) {
      return undefined;
    }

    const query = new URLSearchParams({ offset: String(offset) });
    if (filter !== 'all') {
      query.set('filter', filter);
    }

    return `${this.base()}/imports/${importId}?${query}`;
  }

  /** The body is the file itself; nothing of it is kept but its lines. */
  upload(file: File, accountId: string | null): Promise<ImportDetail> {
    const query = new URLSearchParams({ fileName: file.name });
    if (accountId) {
      query.set('accountId', accountId);
    }

    return firstValueFrom(
      this.http.post<ImportDetail>(`${this.base()}/imports?${query}`, file, { headers: { 'Content-Type': 'application/octet-stream' } }),
    );
  }

  mapAccount(importId: string, mappingId: string, accountId: string | null, createAs: NewAccountType | null): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base()}/imports/${importId}/accounts/${mappingId}`, { accountId, createAs }));
  }

  mapCategory(importId: string, mappingId: string, categoryId: string | null, create: boolean): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base()}/imports/${importId}/categories/${mappingId}`, { categoryId, create }));
  }

  review(importId: string, recordId: string, change: { categoryId?: string; excluded?: boolean }): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${this.base()}/imports/${importId}/records/${recordId}`, change));
  }

  /** `key` makes the request safe to repeat: a second click does not import twice. */
  commit(importId: string, key: string): Promise<ImportDetail> {
    return firstValueFrom(
      this.http.post<ImportDetail>(`${this.base()}/imports/${importId}/commit`, null, { context: new HttpContext().set(IDEMPOTENCY_KEY, key) }),
    );
  }

  /** Runs the rules again over the lines still without category; what was chosen by hand stays. */
  reapplyRules(importId: string): Promise<ImportDetail> {
    return firstValueFrom(this.http.post<ImportDetail>(`${this.base()}/imports/${importId}/reapply-rules`, null));
  }

  discard(importId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base()}/imports/${importId}`));
  }

  saveRule(rule: { id?: string; pattern: string; categoryId: string; isActive: boolean }): Promise<CategorizationRule> {
    const body = { pattern: rule.pattern, categoryId: rule.categoryId, isActive: rule.isActive };
    return firstValueFrom(
      rule.id
        ? this.http.put<CategorizationRule>(`${this.base()}/categorization-rules/${rule.id}`, body)
        : this.http.post<CategorizationRule>(`${this.base()}/categorization-rules`, body),
    );
  }

  deleteRule(ruleId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base()}/categorization-rules/${ruleId}`));
  }
}
