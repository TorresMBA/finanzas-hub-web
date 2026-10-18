import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Goal, GoalDetail, GoalList } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TEST_USER, TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Goals } from './goals';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;

const TRIP: Goal = {
  id: 'g-trip',
  name: 'Viaje Japón',
  targetAmount: 1000,
  currency: 'PEN',
  targetDate: '2026-12-31',
  status: 'active',
  isShared: true,
  isOwner: false,
  saved: 500,
  mySaved: 0,
  remaining: 500,
  percent: 50,
  requiredMonthly: 250,
  averageMonthly: 500,
  health: 'onTrack',
  participants: [
    { userId: 'u-brian', displayName: 'Brian', role: 'owner', saved: 500, isMe: false },
    { userId: TEST_USER.id, displayName: 'Juan', role: 'participant', saved: 0, isMe: true },
  ],
  myFundAccountId: null,
};
const LIST: GoalList = { goals: [TRIP], members: [], baseCurrency: 'PEN' };
const DETAIL: GoalDetail = {
  goal: TRIP,
  contributions: [{ id: 'c-1', userId: 'u-brian', displayName: 'Brian', type: 'contribution', amount: 500, occurredOn: '2026-10-12', isMine: false, isVoided: false }],
  monthly: [{ month: '2026-10', amount: 500 }],
};

describe('Goals', () => {
  let fixture: ComponentFixture<Goals>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([idempotencyKeyInterceptor, apiErrorInterceptor])), provideHttpClientTesting(), provideSession()],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Goals);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
  const button = (name: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.trim() === name);

  it('shows a shared goal to a participant with what each one put in, and only what a participant may do', async () => {
    http.expectOne(`${BASE}/goals`).flush(LIST);
    http.expectOne(`${BASE}/accounts`).flush([]);
    http.expectOne(`${BASE}/categories`).flush([]);
    await settle();
    http.expectOne(`${BASE}/goals/g-trip`).flush(DETAIL);
    await fixture.whenStable();

    expect(texts('.goal .goal-head strong')).toEqual(['Viaje Japón']);
    expect(texts('.goal .goal-foot span:last-child')).toEqual(['2 participantes']);
    expect(texts('.people:first-of-type li strong:first-child').slice(0, 2)).toEqual(['Brian', 'Juan (tú)']);
    expect(element.querySelector('.detail')!.textContent).toContain('Aportó');

    // Juan takes part but does not own the goal and has put nothing in yet.
    expect(button('Aportar')).toBeDefined();
    expect(button('Retirar')).toBeUndefined();
    expect(button('Usar el dinero')).toBeUndefined();
    expect(button('Editar')).toBeUndefined();
    expect(button('Cancelar meta')).toBeUndefined();
    expect(button('Salir de la meta')).toBeDefined();
  });
});
