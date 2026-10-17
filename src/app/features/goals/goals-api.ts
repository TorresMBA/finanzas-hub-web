import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CreateGoalRequest, Goal, GoalSpendRequest, UpdateGoalRequest } from '../../core/api/api-types';
import { IDEMPOTENCY_KEY } from '../../core/http/api-interceptors';
import { WorkspaceStore } from '../../core/workspace/workspace-store';

/** How each state of a goal is called and coloured. */
export const HEALTH_LOOK: Readonly<Record<Goal['health'], { label: string; tone: 'ok' | 'warn' | 'over' | 'info' }>> = {
  onTrack: { label: 'En camino', tone: 'ok' },
  adjustPace: { label: 'Ajustar ritmo', tone: 'warn' },
  behind: { label: 'Atrasada', tone: 'over' },
  completed: { label: 'Completada', tone: 'info' },
};

/** The calls about the goals the signed-in person takes part in, in the selected workspace. */
@Injectable({ providedIn: 'root' })
export class GoalsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);

  /** Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly goalsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/goals` : undefined));
  readonly accountsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/accounts` : undefined));
  readonly categoriesUrl = computed(() => (this.workspaces.current() ? `${this.base()}/categories` : undefined));

  detailUrl(goalId: string | null): string | undefined {
    return this.workspaces.current() && goalId ? `${this.base()}/goals/${goalId}` : undefined;
  }

  create(request: CreateGoalRequest): Promise<Goal> {
    return firstValueFrom(this.http.post<Goal>(`${this.base()}/goals`, request));
  }

  update(goalId: string, request: UpdateGoalRequest): Promise<Goal> {
    return firstValueFrom(this.http.patch<Goal>(`${this.base()}/goals/${goalId}`, request));
  }

  /** `key` makes the request safe to repeat: create it when the form opens, not when it is sent. */
  move(goalId: string, what: 'contributions' | 'withdrawals', amount: number, accountId: string, key: string): Promise<Goal> {
    return firstValueFrom(
      this.http.post<Goal>(`${this.base()}/goals/${goalId}/${what}`, { amount, accountId }, { context: new HttpContext().set(IDEMPOTENCY_KEY, key) }),
    );
  }

  /** Spends what the person saved: back to `accountId` and registered there as an expense, marked as paid with the goal. */
  spend(goalId: string, request: GoalSpendRequest, key: string): Promise<Goal> {
    return firstValueFrom(
      this.http.post<Goal>(`${this.base()}/goals/${goalId}/spend`, request, { context: new HttpContext().set(IDEMPOTENCY_KEY, key) }),
    );
  }

  addParticipant(goalId: string, userId: string): Promise<Goal> {
    return firstValueFrom(this.http.post<Goal>(`${this.base()}/goals/${goalId}/participants`, { userId }));
  }

  /** The owner removes someone; anyone else leaves by naming themselves. */
  removeParticipant(goalId: string, userId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base()}/goals/${goalId}/participants/${userId}`));
  }

  close(goalId: string, how: 'archive' | 'cancel'): Promise<Goal> {
    return firstValueFrom(this.http.post<Goal>(`${this.base()}/goals/${goalId}/${how}`, null));
  }
}
