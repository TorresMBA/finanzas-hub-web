import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SharedGroupDetail, SharedGroups } from '../../core/api/api-types';
import { SessionStore } from '../../core/auth/session-store';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TEST_USER, TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Shared } from './shared';
import { previewSplit } from './shared-api';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;

const GROUP = {
  id: 'g-depa', name: 'Depa', currency: 'PEN', status: 'active' as const, memberCount: 3, myBalance: -70, owedToMe: 30, iOwe: 100, pendingExpenses: 1,
  memberNames: ['Brian', 'Pedro', 'Juan'], lastActivityOn: '2026-10-12',
};
const LIST: SharedGroups = { groups: [GROUP], totals: [{ currency: 'PEN', owedToMe: 0, iOwe: 100 }], members: [], baseCurrency: 'PEN' };
const DETAIL: SharedGroupDetail = {
  group: GROUP,
  isAdmin: false,
  members: [
    { userId: 'u-brian', displayName: 'Brian', role: 'admin', balance: -100, isMe: false },
    { userId: TEST_USER.id, displayName: 'Juan', role: 'member', balance: -100, isMe: true },
    { userId: 'u-pedro', displayName: 'Pedro', role: 'member', balance: 30, isMe: false },
  ],
  debts: [
    { fromUserId: TEST_USER.id, fromName: 'Juan', toUserId: 'u-brian', toName: 'Brian', amount: 100 },
    { fromUserId: 'u-pedro', fromName: 'Pedro', toUserId: TEST_USER.id, toName: 'Juan', amount: 30 },
  ],
  voidsLeftToday: 3,
  expenses: [
    {
      id: 'e-1', description: 'Cena', totalAmount: 300, paidByUserId: 'u-brian', paidByName: 'Brian', occurredOn: '2026-10-12', splitType: 'equal', status: 'pending',
      myShare: 100, myPending: 100, canCancel: false,
      shares: [
        { userId: 'u-brian', displayName: 'Brian', amount: 100, paidAmount: 100 },
        { userId: TEST_USER.id, displayName: 'Juan', amount: 100, paidAmount: 0 },
        { userId: 'u-pedro', displayName: 'Pedro', amount: 100, paidAmount: 0 },
      ],
    },
  ],
  settlements: [],
};

describe('previewSplit', () => {
  it('divides like the server: to the cent, with what rounding leaves over going to the first', () => {
    expect(previewSplit(300, 'equal', [0, 0, 0])).toEqual([100, 100, 100]);
    expect(previewSplit(100, 'equal', [0, 0, 0])).toEqual([33.34, 33.33, 33.33]);
    expect(previewSplit(300, 'percentage', [50, 30, 20])).toEqual([150, 90, 60]);
    expect(previewSplit(300, 'shares', [2, 1, 1])).toEqual([150, 75, 75]);
    expect(previewSplit(300, 'fixedAmount', [150, 100, 50])).toEqual([150, 100, 50]);

    // What does not add up has no preview.
    expect(previewSplit(300, 'percentage', [50, 30])).toBeNull();
    expect(previewSplit(300, 'fixedAmount', [150, 100])).toBeNull();
  });
});

describe('Shared', () => {
  let fixture: ComponentFixture<Shared>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([idempotencyKeyInterceptor, apiErrorInterceptor])), provideHttpClientTesting(), provideSession()],
    });
    // The page tells the person from the others by the session.
    await TestBed.inject(SessionStore).ensureLoaded();
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Shared);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  it('says in the list what there is to settle in each group and, in the group, with whom and who has repaid', async () => {
    http.expectOne(`${BASE}/shared-groups`).flush(LIST);
    http.expectOne(`${BASE}/accounts`).flush([]);
    http.expectOne(`${BASE}/categories?kind=expense`).flush([]);
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    http.expectOne(`${BASE}/shared-groups/g-depa`).flush(DETAIL);
    await fixture.whenStable();

    const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

    // The list alone tells whether there is something to do in the group.
    const card = text(element.querySelector('[aria-label="Grupos"] button'));
    expect(card).toContain('Depa');
    expect(card).toContain('Te deben S/ 30.00');
    expect(card).toContain('Debes S/ 100.00');
    expect(card).toContain('1 por saldar');

    const debts = Array.from(element.querySelectorAll('[aria-label="Deudas"] li'));
    const buttons = (row: Element) => Array.from(row.querySelectorAll('button')).map((button) => button.textContent?.trim());

    // Juan owes Brian: he can pay. Pedro owes Juan: he can register it or remind him.
    expect(debts.map((row) => text(row.querySelector('.names')))).toEqual(['Brian Le debes S/ 100.00', 'Pedro Te debe S/ 30.00']);
    expect(buttons(debts[0])).toEqual(['Pagar']);
    expect(buttons(debts[1])).toEqual(['Registrar cobro', 'Recordar']);
    expect(text(element.querySelector('[aria-label="Gastos del grupo"] summary'))).toContain('Debes S/ 100.00');

    // Inside the expense, who paid it and who still owes their part.
    expect(Array.from(element.querySelectorAll('.shares .share-side .lead')).map(text)).toEqual(['Pagó el gasto', 'Debe S/ 100.00', 'Debe S/ 100.00']);

    // He did not register the dinner nor pay it, and he does not run the group.
    const all = Array.from(element.querySelectorAll('button')).map((button) => button.textContent?.trim());
    expect(all).not.toContain('Cancelar este gasto');
    expect(all).not.toContain('Archivar grupo');
    expect(all).toContain('Salir');

    // With each of the others, only what is between the two.
    const members = text(element.querySelector('[aria-label="Miembros del grupo"]'));
    expect(members).toContain('Brian Le debes S/ 100.00');
    expect(members).toContain('Pedro Te debe S/ 30.00');
  });
});
