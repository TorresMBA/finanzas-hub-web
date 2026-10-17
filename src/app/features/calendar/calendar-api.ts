import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CalendarItem, CreateRecurringRuleRequest, RecurringRule } from '../../core/api/api-types';
import { WorkspaceStore } from '../../core/workspace/workspace-store';

export const FREQUENCY_LABELS: Readonly<Record<RecurringRule['frequency'], string>> = { once: 'Una vez', monthly: 'Cada mes', yearly: 'Cada año' };

export const RULE_STATUS_LABELS: Readonly<Record<RecurringRule['status'], string>> = { active: 'Activa', paused: 'En pausa', ended: 'Terminada' };

/** How each kind of thing on the calendar is called and coloured. */
export const KIND_LOOK: Readonly<Record<CalendarItem['kind'], { label: string; tone: 'in' | 'out' | 'move' }>> = {
  income: { label: 'Ingreso', tone: 'in' },
  expense: { label: 'Gasto', tone: 'out' },
  transfer: { label: 'Transferencia', tone: 'move' },
  cardDue: { label: 'Vence tarjeta', tone: 'move' },
  cardClosing: { label: 'Corte de tarjeta', tone: 'move' },
};

export const REMINDER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Sin recordatorio' },
  { value: '0', label: 'El mismo día' },
  { value: '1', label: '1 día antes' },
  { value: '3', label: '3 días antes' },
  { value: '7', label: '1 semana antes' },
];

/** The calls about the calendar and the scheduled movements of the signed-in person in the selected workspace. */
@Injectable({ providedIn: 'root' })
export class CalendarApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);

  /** Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly rulesUrl = computed(() => (this.workspaces.current() ? `${this.base()}/recurring-rules` : undefined));
  readonly accountsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/accounts` : undefined));
  readonly categoriesUrl = computed(() => (this.workspaces.current() ? `${this.base()}/categories` : undefined));

  calendarUrl(range: { from: string; to: string }): string | undefined {
    return this.workspaces.current() ? `${this.base()}/calendar?from=${range.from}&to=${range.to}` : undefined;
  }

  create(request: CreateRecurringRuleRequest): Promise<RecurringRule> {
    return firstValueFrom(this.http.post<RecurringRule>(`${this.base()}/recurring-rules`, request));
  }

  changeStatus(ruleId: string, change: 'pause' | 'resume' | 'end'): Promise<RecurringRule> {
    return firstValueFrom(this.http.post<RecurringRule>(`${this.base()}/recurring-rules/${ruleId}/${change}`, null));
  }

  /** Registers a date of a rule in the ledger. */
  confirm(ruleId: string, date: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base()}/recurring-rules/${ruleId}/occurrences/${date}/confirm`, {}));
  }

  /** Leaves a date of a rule without a movement. */
  skip(ruleId: string, date: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base()}/recurring-rules/${ruleId}/occurrences/${date}/skip`, null));
  }
}
