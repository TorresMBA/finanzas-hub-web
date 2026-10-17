import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdjustBudgetRequest, Budget, BudgetStatus, CreateBudgetRequest } from '../../core/api/api-types';
import { WorkspaceStore } from '../../core/workspace/workspace-store';

/** How each state is called and which colour it takes. */
export const STATUS_LOOK: Readonly<Record<BudgetStatus, { label: string; tone: 'ok' | 'warn' | 'over' | 'info' }>> = {
  onTrack: { label: 'En ritmo', tone: 'ok' },
  atRisk: { label: 'En riesgo', tone: 'warn' },
  exceeded: { label: 'Excedido', tone: 'over' },
  fixed: { label: 'Fijo', tone: 'info' },
  paid: { label: 'Pagado', tone: 'info' },
};

export const ALERT_THRESHOLDS = [75, 90, 100] as const;

/** The calls about the budgets of the signed-in person in the selected workspace. */
@Injectable({ providedIn: 'root' })
export class BudgetsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);

  /** The expense categories a budget can go on. Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly categoriesUrl = computed(() => (this.workspaces.current() ? `${this.base()}/categories?kind=expense` : undefined));

  /** @param month As 2026-10. */
  listUrl(month: string): string | undefined {
    return this.workspaces.current() ? `${this.base()}/budgets?month=${month}` : undefined;
  }

  /**
   * What each category spent in a month, in the base currency, with every subcategory apart from its parent. It is
   * the same query the budgets add up, so the subtotals of a budget always make its total.
   */
  totalsUrl(range: { from: string; to: string }): string | undefined {
    return this.workspaces.current() ? `${this.base()}/transactions/category-totals?from=${range.from}&to=${range.to}` : undefined;
  }

  detailUrl(budgetId: string | null, month: string): string | undefined {
    return this.workspaces.current() && budgetId ? `${this.base()}/budgets/${budgetId}?month=${month}` : undefined;
  }

  create(request: CreateBudgetRequest): Promise<Budget> {
    return firstValueFrom(this.http.post<Budget>(`${this.base()}/budgets`, request));
  }

  adjust(budgetId: string, request: AdjustBudgetRequest): Promise<Budget> {
    return firstValueFrom(this.http.patch<Budget>(`${this.base()}/budgets/${budgetId}`, request));
  }

  end(budgetId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base()}/budgets/${budgetId}`));
  }
}
