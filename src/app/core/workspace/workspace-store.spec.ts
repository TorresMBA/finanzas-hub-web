import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Me, Workspace } from '../api/api-types';
import { SessionStore } from '../auth/session-store';
import { TEST_USER, TEST_WORKSPACE } from '../testing/signed-in';
import { WorkspaceStore } from './workspace-store';

describe('WorkspaceStore', () => {
  const personal: Workspace = { ...TEST_WORKSPACE, id: 'personal', name: 'Personal', status: 'pendingSetup' };
  const home: Workspace = { ...TEST_WORKSPACE, id: 'home', name: 'Hogar', role: 'member', isPersonal: false };
  const user = signal<Me | null>(TEST_USER);
  let store: WorkspaceStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    user.set(TEST_USER);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SessionStore, useValue: { user: user.asReadonly() } }],
    });
    store = TestBed.inject(WorkspaceStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function load(workspaces: Workspace[]): Promise<void> {
    const loading = store.ensureLoaded();
    http.expectOne('/api/v1/me/workspaces').flush(workspaces);
    await loading;
  }

  it('opens on the first workspace when the person has expressed no preference', async () => {
    await load([personal, home]);

    expect(store.current()?.id).toBe('personal');
  });

  it('opens on the workspace of the preferences, and a choice made on this device wins over it', async () => {
    user.set({ ...TEST_USER, preferences: { ...TEST_USER.preferences, defaultWorkspaceId: 'home' } });
    await load([personal, home]);
    expect(store.current()?.id).toBe('home');

    store.select('personal');

    expect(store.current()?.id).toBe('personal');
    expect(localStorage.getItem('ph.workspace')).toBe('personal');
  });

  it('falls back when the remembered workspace is no longer one of theirs', async () => {
    store.select('left-long-ago');
    await load([home]);

    expect(store.current()?.id).toBe('home');
  });

  it('asks for the personal workspace to be set up whichever one is open', async () => {
    await load([personal, home]);
    store.select('home');

    // Private finances live in the personal workspace: without its currency nothing can be registered anywhere.
    expect(store.needsOnboarding()).toBe(true);
    expect(store.pendingSetup()?.id).toBe('personal');
    expect(store.canAdminister()).toBe(false);
  });

  it('does not ask a member to set up a workspace they do not own', async () => {
    await load([{ ...personal, status: 'active' }, { ...home, status: 'pendingSetup' }]);
    store.select('home');

    expect(store.needsOnboarding()).toBe(false);
  });

  it('forgets everything when the session ends', async () => {
    await load([personal]);
    store.select('personal');

    store.clear();

    expect(store.workspaces()).toEqual([]);
    expect(store.current()).toBeNull();
    expect(localStorage.getItem('ph.workspace')).toBeNull();
  });
});
