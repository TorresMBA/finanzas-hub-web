import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HoldingDetail, InvestmentType, OpenHoldingRequest } from '../../core/api/api-types';
import { IDEMPOTENCY_KEY } from '../../core/http/api-interceptors';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { TileColor } from '../../shared/ui/icon-tile';

/** How each type of investment is called, and its icon and colour. */
export const TYPE_LOOK: Readonly<Record<InvestmentType, { label: string; plural: string; icon: string; color: TileColor }>> = {
  mutualFund: { label: 'Fondo mutuo', plural: 'Fondos mutuos', icon: 'account_balance', color: 'blue' },
  termDeposit: { label: 'Depósito a plazo', plural: 'Depósitos a plazo', icon: 'savings', color: 'green' },
  stock: { label: 'Acción', plural: 'Acciones', icon: 'show_chart', color: 'violet' },
  etf: { label: 'ETF', plural: 'ETFs', icon: 'stacked_line_chart', color: 'violet' },
  crypto: { label: 'Cripto', plural: 'Cripto', icon: 'currency_bitcoin', color: 'amber' },
  other: { label: 'Otra', plural: 'Otras', icon: 'work', color: 'neutral' },
};

export const TYPES = Object.keys(TYPE_LOOK) as InvestmentType[];

/** The types whose units are counted. */
export function hasUnits(type: InvestmentType): boolean {
  return type === 'stock' || type === 'etf' || type === 'crypto';
}

export interface HoldingMoney {
  readonly amount: number;
  readonly quantity: number | null;
  readonly occurredOn: string;
  readonly accountId: string;
}

/** The calls about the investments of the signed-in person. They are private to that person. */
@Injectable({ providedIn: 'root' })
export class InvestmentsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);

  /** Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly accountsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/accounts` : undefined));

  summaryUrl(type: InvestmentType | null): string | undefined {
    if (!this.workspaces.current()) {
      return undefined;
    }

    const filter = type ? '?type=' + type : '';
    return `${this.base()}/investments/summary${filter}`;
  }

  detailUrl(holdingId: string | null): string | undefined {
    return this.workspaces.current() && holdingId ? `${this.base()}/holdings/${holdingId}` : undefined;
  }

  /** `key` makes the request safe to repeat: create it when the form opens, not when it is sent. */
  open(request: OpenHoldingRequest, key: string): Promise<HoldingDetail> {
    return firstValueFrom(this.http.post<HoldingDetail>(`${this.base()}/holdings`, request, { context: new HttpContext().set(IDEMPOTENCY_KEY, key) }));
  }

  move(holdingId: string, what: 'contributions' | 'withdrawals', money: HoldingMoney, key: string): Promise<HoldingDetail> {
    return firstValueFrom(
      this.http.post<HoldingDetail>(`${this.base()}/holdings/${holdingId}/${what}`, money, { context: new HttpContext().set(IDEMPOTENCY_KEY, key) }),
    );
  }

  value(holdingId: string, onDate: string, value: number | null, unitPrice: number | null): Promise<HoldingDetail> {
    return firstValueFrom(this.http.post<HoldingDetail>(`${this.base()}/holdings/${holdingId}/valuations`, { onDate, value, unitPrice }));
  }
}
