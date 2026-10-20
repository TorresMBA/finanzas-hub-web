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
  id: 'g-depa', name: 'Depa', icon: 'group', currency: 'PEN', status: 'active' as const, memberCount: 3, myBalance: -70, owedToMe: 30, iOwe: 100, pendingExpenses: 1,
  memberNames: ['Brian', 'Pedro', 'Juan'], lastActivityOn: '2026-10-12',
};
const LIST: SharedGroups = { groups: [GROUP], totals: [{ currency: 'PEN', owedToMe: 30, iOwe: 100 }], members: [], baseCurrency: 'PEN' };
const DETAIL: SharedGroupDetail = {
  group: GROUP,
  isAdmin: false,
  members: [
    { userId: 'u-brian', displayName: 'Brian', role: 'admin', balance: -100, isMe: false },
    { userId: TEST_USER.id, displayName: 'Juan', role: 'member', balance: -100, isMe: true },
    { userId: 'u-pedro', displayName: 'Pedro', role: 'member', balance: 30, isMe: false },
  ],
  debts: [
    {
      fromUserId: TEST_USER.id, fromName: 'Juan', toUserId: 'u-brian', toName: 'Brian', amount: 100,
      items: [{ expenseId: 'e-1', description: 'Cena', occurredOn: '2026-10-12', amount: 100, pending: 100 }],
    },
    {
      fromUserId: 'u-pedro', fromName: 'Pedro', toUserId: TEST_USER.id, toName: 'Juan', amount: 30,
      items: [{ expenseId: 'e-0', description: 'Taxi', occurredOn: '2026-10-10', amount: 30, pending: 30 }],
    },
  ],
  voidsLeftToday: 3,
  expenses: [
    {
      id: 'e-1', description: 'Cena', totalAmount: 300, paidByUserId: 'u-brian', paidByName: 'Brian', occurredOn: '2026-10-12', splitType: 'equal', status: 'pending',
      myShare: 100, myPending: 100, canCancel: false, canLinkAccount: false, createdAt: '2026-10-12T15:00:00Z',
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

  it('sums up where the person stands with each person and, in a group, what to pay or collect and who has repaid', async () => {
    http.expectOne(`${BASE}/shared-groups`).flush(LIST);
    http.expectOne(`${BASE}/accounts`).flush([]);
    http.expectOne(`${BASE}/categories?kind=expense`).flush([]);
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    http.expectOne(`${BASE}/shared-groups/g-depa`).flush(DETAIL);
    await fixture.whenStable();

    const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
    const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map(text);
    // What a button says, without the name of its icon.
    const buttons = (node: Element) =>
      Array.from(node.querySelectorAll('button')).map((button) =>
        Array.from(button.childNodes)
          .filter((child) => child.nodeName !== 'APP-ICON')
          .map((child) => child.textContent)
          .join('')
          .trim(),
      );
    const show = async (button: Element | undefined) => {
      (button as HTMLButtonElement).click();
      await fixture.whenStable();
    };
    const tab = (name: string) => Array.from(element.querySelectorAll('[role="tab"]')).find((node) => text(node) === name);

    // Over everything: the net balance, and with each person what is between the two, group by group.
    expect(text(element.querySelector('.kpi .kpi-value'))).toBe('−S/ 70.00');
    expect(texts('.person-names strong')).toEqual(['Brian', 'Pedro']);
    expect(texts('.part')).toEqual(['Depa: le debes S/ 100.00', 'Depa: te debe S/ 30.00']);
    expect(texts('.person-side strong')).toEqual(['S/ 100.00', 'S/ 30.00']);
    expect(texts('.person-label')).toEqual(['Le debes', 'Te debe']);

    // The card alone tells where the person stands in the group.
    const card = Array.from(element.querySelectorAll('nav[aria-label="Grupos"] .pick')).find((button) => text(button)?.includes('Depa'));
    expect(text(card)).toContain('3 miembros · 1 gasto');
    expect(text(card)).toContain('Debes S/ 70.00');
    await show(card);

    // Juan owes Brian: he can pay. Pedro owes Juan: he can register it or remind him.
    const debts = Array.from(element.querySelectorAll('[aria-label="Deudas"] li'));
    expect(debts.map((row) => text(row.querySelector('.names strong')))).toEqual(['Tú le pagas a Brian', 'Pedro te paga']);
    expect(buttons(debts[0])).toEqual(['Registrar pago']);
    expect(buttons(debts[1])).toEqual(['Marcar recibido', 'Recordar']);

    // In the activity, what the dinner means for him and, inside it, who still owes their part.
    await show(tab('Actividad'));
    expect(text(element.querySelector('.expense .effect'))).toBe('Debes S/ 100.00');
    expect(texts('.shares .share-side .lead')).toEqual(['Pagó el gasto', 'Debe S/ 100.00', 'Debe S/ 100.00']);
    expect(buttons(element)).not.toContain('Cancelar este gasto');

    // With each of the others, only what is between the two; he does not run the group, but can leave it.
    await show(tab('Miembros'));
    expect(texts('[aria-label="Miembros"] .names')).toEqual(['BrianCreó el grupo', 'Juan (tú)Miembro', 'PedroMiembro']);
    expect(texts('[aria-label="Miembros"] .member-side strong')).toEqual(['Le debes S/ 100.00', 'Debes S/ 100.00', 'Te debe S/ 30.00']);
    expect(buttons(element)).toContain('Salir');
    expect(buttons(element)).not.toContain('Archivar grupo');
  });

  it('shows the activity newest first, expenses and payments mixed by when they were registered', async () => {
    const payment = (id: string, fromUserId: string, fromName: string, createdAt: string) => ({
      id, fromUserId, fromName, toUserId: 'u-brian', toName: 'Brian', amount: 10, occurredOn: '2026-10-12', isVoided: false, canVoid: false, canLinkAccount: false,
      createdAt,
    });
    const detail: SharedGroupDetail = {
      ...DETAIL,
      expenses: [...DETAIL.expenses, { ...DETAIL.expenses[0], id: 'e-old', description: 'Mercado', occurredOn: '2026-10-08', createdAt: '2026-10-12T20:00:00Z' }],
      // Listed by the API with the oldest of the day first, to be put in order by the page.
      settlements: [payment('s-1', TEST_USER.id, 'Juan', '2026-10-12T16:00:00Z'), payment('s-2', 'u-pedro', 'Pedro', '2026-10-12T18:00:00Z')],
    };
    http.expectOne(`${BASE}/shared-groups`).flush(LIST);
    http.expectOne(`${BASE}/accounts`).flush([]);
    http.expectOne(`${BASE}/categories?kind=expense`).flush([]);
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    http.expectOne(`${BASE}/shared-groups/g-depa`).flush(detail);
    await fixture.whenStable();

    const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
    const pick = (selector: string, name: string) =>
      (Array.from(element.querySelectorAll<HTMLElement>(selector)).find((node) => text(node)?.includes(name)) as HTMLElement).click();
    pick('nav[aria-label="Grupos"] .pick', 'Depa');
    await fixture.whenStable();
    pick('[role="tab"]', 'Actividad');
    await fixture.whenStable();

    // Pedro's payment is the latest of the 12th, the dinner the first; the market is of an earlier day, however late it was registered.
    expect(Array.from(element.querySelectorAll('.item-title')).map(text)).toEqual(['Pedro → Brian', 'Tú → Brian', 'Cena', 'Mercado']);
  });

  it('breaks a debt into its expenses to pay one alone, and offers to register an expense the person paid later', async () => {
    const market = {
      ...DETAIL.expenses[0], id: 'e-2', description: 'Mercado', totalAmount: 60, paidByUserId: TEST_USER.id, paidByName: 'Juan', occurredOn: '2026-10-08',
      myShare: 30, myPending: 0, canCancel: true, canLinkAccount: true,
    };
    const detail: SharedGroupDetail = {
      ...DETAIL,
      debts: [
        {
          ...DETAIL.debts[0],
          items: [
            { expenseId: 'e-0', description: 'Almuerzo', occurredOn: '2026-10-05', amount: 50, pending: 20 },
            { expenseId: 'e-1', description: 'Cena', occurredOn: '2026-10-12', amount: 100, pending: 80 },
          ],
        },
      ],
      expenses: [...DETAIL.expenses, market],
    };
    http.expectOne(`${BASE}/shared-groups`).flush(LIST);
    http.expectOne(`${BASE}/accounts`).flush([]);
    http.expectOne(`${BASE}/categories?kind=expense`).flush([]);
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    http.expectOne(`${BASE}/shared-groups/g-depa`).flush(detail);
    await fixture.whenStable();

    const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
    const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map(text);
    const click = async (selector: string, name: string) => {
      (Array.from(element.querySelectorAll<HTMLButtonElement>(selector)).find((button) => text(button)?.includes(name)) as HTMLButtonElement).click();
      await fixture.whenStable();
    };
    await click('nav[aria-label="Grupos"] .pick', 'Depa');

    // The debt says what it is made of; all of it is still one click away.
    const debt = element.querySelector('[aria-label="Deudas"] > li')!;
    expect(text(debt.querySelector('.debt .lead'))).toContain('2 gastos pendientes');
    expect(text(debt.querySelector('.debt-actions'))).toContain('Pagar todo');
    expect(texts('.breakdown .breakdown-title')).toEqual(['Almuerzo', 'Cena']);
    expect(texts('.breakdown .breakdown-amount strong')).toEqual(['S/ 20.00 de S/ 50.00', 'S/ 80.00 de S/ 100.00']);

    // Paying only the dinner asks for what is left of it. Opening a payment brings the balances as they are now.
    (element.querySelectorAll<HTMLButtonElement>('.breakdown button')[1]).click();
    TestBed.tick();
    http.expectOne(`${BASE}/accounts`).flush([]);
    await fixture.whenStable();
    const form = element.querySelector('app-settlement-form')!;
    expect(text(form)).toContain('Pagar «Cena» a Brian');
    expect(text(form)).toContain('De «Cena» quedan S/ 80.00.');
    expect(form.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value).toBe('80.00');
    await click('app-settlement-form button', 'Cancelar');

    // The market he paid is not in his accounts yet: he can find it and register it.
    await click('[role="tab"]', 'Actividad');
    expect(texts('[aria-label="Qué actividad ver"] button')).toEqual(['Todo', 'Gastos', 'Pagos', 'Sin registrar · 1']);
    await click('[aria-label="Qué actividad ver"] button', 'Sin registrar · 1');
    expect(texts('.expense .item-title')).toEqual(['Mercado']);
    expect(text(element.querySelector('.expense .names .lead'))).toContain('Sin registrar en tu cuenta');
    (Array.from(element.querySelectorAll<HTMLButtonElement>('.expense summary button')).find((button) => text(button)?.includes('Registrar en mi cuenta')) as HTMLButtonElement).click();
    TestBed.tick();
    http.expectOne(`${BASE}/accounts`).flush([]);
    await fixture.whenStable();
    expect(text(element.querySelector('app-expense-account-form'))).toContain('Pagaste S/ 60.00 por «Mercado»');
  });
});
