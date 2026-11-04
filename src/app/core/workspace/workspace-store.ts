import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Workspace, WorkspaceKind } from '../api/api-types';
import { SessionStore } from '../auth/session-store';

const STORAGE_KEY = 'ph.workspace';

/**
 * The workspaces of the signed-in person and the one the application is showing. Every workspace request
 * carries the selected id in its URL, so two tabs can show two workspaces without interfering.
 */
/** What each kind is called on screen (ADR-023). */
export const WORKSPACE_KIND_LABELS: Readonly<Record<WorkspaceKind, string>> = { personal: 'Personal', business: 'Negocio', other: 'Otros' };

/**
 * How a workspace is called in a list: with its owner when it is someone else's, since everyone has a "Personal",
 * and with its kind when it keeps its own books, so a business is never mistaken for the personal ones.
 */
export function workspaceLabel(workspace: Workspace): string {
  const name = workspace.role === 'owner' || !workspace.ownerName ? workspace.name : `${workspace.name} · de ${workspace.ownerName}`;
  return workspace.kind === 'personal' ? name : `${name} · ${WORKSPACE_KIND_LABELS[workspace.kind]}`;
}

/** See {@link WorkspaceStore.otherBooks}. */
export function otherBooksOf(workspaces: readonly Workspace[], open: Workspace | null): readonly Workspace[] {
  if (!open) {
    return [];
  }

  return workspaces.filter((workspace) =>
    workspace.kind === 'personal' ? workspace.isPersonal && open.kind !== 'personal' : workspace.role === 'owner' && workspace.id !== open.id,
  );
}

/** See {@link WorkspaceStore.bookLabel}. */
export function bookLabelIn(workspaces: readonly Workspace[], workspaceId: string): string {
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  return workspace ? workspaceLabel(workspace) : 'otro libro';
}

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStore);
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage;
  private readonly list = signal<readonly Workspace[]>([]);
  private readonly selectedId = signal<string | null>(this.storage?.getItem(STORAGE_KEY) ?? null);
  private loading: Promise<void> | null = null;

  readonly workspaces = this.list.asReadonly();

  /** The selected workspace; when the stored choice is gone, the one the user opens on, then the first. */
  readonly current = computed<Workspace | null>(() => {
    const workspaces = this.list();
    const preferred = this.session.user()?.preferences.defaultWorkspaceId;
    return (
      workspaces.find((workspace) => workspace.id === this.selectedId()) ??
      workspaces.find((workspace) => workspace.id === preferred) ??
      workspaces[0] ??
      null
    );
  });

  /**
   * The workspace the person got with their account. Their accounts, movements and budgets live there and are
   * the same whichever workspace is open; the others only add what is shared.
   */
  readonly personal = computed<Workspace | null>(() => this.list().find((workspace) => workspace.isPersonal) ?? null);

  /**
   * The workspace whose owner still has to choose its currency: the personal one first, because nothing private
   * can be registered without it, then the one open.
   */
  readonly pendingSetup = computed<Workspace | null>(() => {
    const personal = this.personal();
    if (personal?.status === 'pendingSetup') {
      return personal;
    }

    const workspace = this.current();
    return workspace?.status === 'pendingSetup' && workspace.role === 'owner' ? workspace : null;
  });

  readonly needsOnboarding = computed(() => this.pendingSetup() !== null);

  /**
   * The workspaces whose books are the person's other than those open (ADR-023): the personal one when a business or
   * another is open, and each business or other they own. Money moves to them with a transfer between books.
   */
  readonly otherBooks = computed(() => otherBooksOf(this.list(), this.current()));

  /** How a workspace whose book holds the other side of a transfer is called; one the person no longer has is just "otro libro". */
  bookLabel(workspaceId: string): string {
    return bookLabelIn(this.list(), workspaceId);
  }

  /** Only a Personal workspace has other members, goals and shared expenses. */
  readonly allowsCollaboration = computed(() => this.current()?.kind === 'personal');

  readonly canAdminister = computed(() => {
    const role = this.current()?.role;
    return role === 'admin' || role === 'owner';
  });

  ensureLoaded(): Promise<void> {
    this.loading ??= this.refresh();
    return this.loading;
  }

  async refresh(): Promise<void> {
    try {
      this.list.set(await firstValueFrom(this.http.get<Workspace[]>('/api/v1/me/workspaces')));
      this.loading = Promise.resolve();
    } catch (error) {
      this.loading = null;
      throw error;
    }
  }

  select(workspaceId: string): void {
    this.selectedId.set(workspaceId);
    this.storage?.setItem(STORAGE_KEY, workspaceId);
  }

  /** Forgets everything when the session ends, so the next person on this browser starts clean. */
  clear(): void {
    this.list.set([]);
    this.selectedId.set(null);
    this.storage?.removeItem(STORAGE_KEY);
    this.loading = null;
  }

  /** Business and Other start with books of their own, empty; Personal shows the personal ones of whoever opens it. */
  async create(name: string, kind: WorkspaceKind): Promise<Workspace> {
    const workspace = await firstValueFrom(this.http.post<Workspace>('/api/v1/workspaces', { name, kind }));
    await this.refresh();
    this.select(workspace.id);
    return workspace;
  }

  async completeOnboarding(baseCurrency: string, timeZone: string): Promise<void> {
    const workspace = this.pendingSetup() ?? this.requireCurrent();
    await firstValueFrom(this.http.post(`/api/v1/workspaces/${workspace.id}/onboarding/complete`, { baseCurrency, timeZone }));
    await this.refresh();
  }

  async update(name: string, timeZone: string): Promise<void> {
    const workspace = this.requireCurrent();
    await firstValueFrom(this.http.patch(`/api/v1/workspaces/${workspace.id}`, { name, timeZone }));
    await this.refresh();
  }

  private requireCurrent(): Workspace {
    const workspace = this.current();
    if (!workspace) {
      throw new Error('No workspace is selected.');
    }

    return workspace;
  }
}
