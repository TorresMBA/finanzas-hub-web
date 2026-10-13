import { Provider, computed, signal } from '@angular/core';
import { Me, Workspace } from '../api/api-types';
import { SessionStore } from '../auth/session-store';
import { WorkspaceStore } from '../workspace/workspace-store';

export const TEST_USER: Me = {
  id: '0197e7a0-0000-7000-8000-000000000001',
  email: 'brian@example.com',
  emailConfirmed: true,
  displayName: 'Brian Quispe',
  phone: null,
  preferences: {
    locale: 'es-PE',
    dateFormat: 'dd/MM/yyyy',
    weekStart: 'monday',
    theme: 'dark',
    hideBalances: false,
    defaultWorkspaceId: null,
    savingsRateTarget: null,
  },
};

export const TEST_WORKSPACE: Workspace = {
  id: '0197e7a0-0000-7000-8000-0000000000aa',
  name: 'Hogar Quispe',
  baseCurrency: 'PEN',
  timeZone: 'America/Lima',
  status: 'active',
  role: 'owner',
  memberCount: 1,
};

/**
 * Providers that put a component test behind the guards: a signed-in person with one active workspace,
 * without any HTTP. Pass `null` as the user for a signed-out visitor.
 */
export function provideSession(user: Me | null = TEST_USER, workspaces: readonly Workspace[] = [TEST_WORKSPACE]): Provider[] {
  // Like the real stores, these know nothing until they are asked to load.
  const current = signal<Me | null>(null);
  const list = signal<readonly Workspace[]>([]);
  const selected = computed(() => list()[0] ?? null);
  const session: Partial<SessionStore> = {
    user: current.asReadonly(),
    isSignedIn: computed(() => current() !== null),
    ensureLoaded: async () => {
      await Promise.resolve();
      current.set(user);
      return user !== null;
    },
    logout: () => {
      current.set(null);
      return Promise.resolve();
    },
  };
  const store: Partial<WorkspaceStore> = {
    workspaces: list.asReadonly(),
    current: selected,
    needsOnboarding: computed(() => selected()?.status === 'pendingSetup' && selected()?.role === 'owner'),
    canAdminister: computed(() => selected() !== null && selected()?.role !== 'member'),
    ensureLoaded: async () => {
      await Promise.resolve();
      list.set(workspaces);
    },
    clear: () => list.set([]),
    select: () => undefined,
  };
  return [
    { provide: SessionStore, useValue: session },
    { provide: WorkspaceStore, useValue: store },
  ];
}
