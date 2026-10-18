import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account, BaseTotals, Category, CurrencyTotals, Transaction, TransactionPage } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Transactions } from './transactions';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;
const LIST_URL = `${BASE}/transactions`;

const BCP: Account = {
  id: 'a-bcp', name: 'BCP', type: 'bank', currency: 'PEN', institution: null, balance: 946, includeInNetWorth: true, creditCard: null, isArchived: false,
  createdAt: '2026-10-01T10:00:00Z',
  isFavorite: false,
};
const DOLLARS: Account = { ...BCP, id: 'a-usd', name: 'BCP Dólares', currency: 'USD' };
const GROCERIES: Category = {
  id: 'c-groceries',
  kind: 'expense',
  name: 'Supermercado',
  icon: 'shopping_cart',
  color: 'green',
  isArchived: false,
  tags: ['mercado'],
  subcategories: [{ id: 's-pantry', name: 'Despensa', isArchived: false }],
};
const SALARY: Category = { id: 'c-salary', kind: 'income', name: 'Sueldo', icon: 'payments', color: 'green', isArchived: false, tags: ['fijo'], subcategories: [] };

const movement = (id: string, description: string, signedAmount: number, occurredOn: string, extra: Partial<Transaction> = {}): Transaction => ({
  id,
  kind: signedAmount > 0 ? 'income' : 'expense',
  status: 'confirmed',
  occurredOn,
  description,
  merchant: null,
  note: null,
  amount: Math.abs(signedAmount),
  signedAmount,
  currency: 'PEN',
  accountId: 'a-bcp',
  accountName: 'BCP',
  category: { id: 'c-groceries', name: 'Supermercado', parentName: null, icon: 'shopping_cart', color: 'green' },
  tags: [],
  isEditable: true,
  createdAt: '2026-10-12T10:00:00Z',
  voidReason: null,
  transfer: null,
  fundedByGoal: false,
  ...extra,
});
const WONG = movement('t-wong', 'Wong', -54, '2026-10-12', { tags: ['mercado'], merchant: 'Wong Benavides' });
const SALARY_PAID = movement('t-salary', 'Sueldo', 4500, '2026-10-12', { status: 'pending' });
const NETFLIX = movement('t-netflix', 'Netflix', -12.99, '2026-10-12', { currency: 'USD', accountId: 'a-usd', accountName: 'BCP Dólares' });
const OPENING = movement('t-opening', 'Saldo inicial', 1000, '2026-10-01', { kind: 'openingBalance', category: null, isEditable: false });
const TRANSFER = movement('t-transfer', 'Transferencia', -375, '2026-10-11', {
  kind: 'transfer',
  category: null,
  isEditable: false,
  transfer: {
    fromAccountId: 'a-bcp', fromAccountName: 'BCP', amountOut: 375, currencyOut: 'PEN',
    toAccountId: 'a-usd', toAccountName: 'BCP Dólares', amountIn: 100, currencyIn: 'USD', isCardPayment: false,
  },
});
const IN_BASE: BaseTotals = { currency: 'PEN', income: 4500, expense: 102.71, net: 4397.29, missingRates: [] };
const TOTALS: CurrencyTotals[] = [
  { currency: 'PEN', income: 4500, expense: 54, net: 4446, count: 2 },
  { currency: 'USD', income: 0, expense: 12.99, net: -12.99, count: 1 },
];
const page = (items: Transaction[], totals: CurrencyTotals[] = [], nextCursor: string | null = null, baseTotals: BaseTotals | null = null): TransactionPage => ({
  items,
  totals,
  nextCursor,
  baseTotals,
});

describe('Transactions', () => {
  let fixture: ComponentFixture<Transactions>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([idempotencyKeyInterceptor, apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideSession(),
        { provide: TODAY, useValue: () => new Date(2026, 9, 13) },
      ],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Transactions);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  /** Lets what a click or an answer started run and renders it; with a request waiting the application is not stable. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  const listRequest = (): TestRequest => http.expectOne((request) => request.method === 'GET' && request.url === LIST_URL);
  const paramsOf = (request: TestRequest) => Object.fromEntries(request.request.params.keys().map((key) => [key, request.request.params.get(key)]));

  /** Answers the accounts and the categories the page asks for when it opens. */
  function lists(accounts: Account[] = [BCP, DOLLARS]): void {
    http.expectOne(`${BASE}/accounts?includeArchived=true`).flush(accounts);
    http.expectOne(`${BASE}/categories?includeArchived=true`).flush([GROCERIES, SALARY]);
  }

  async function open(items: Transaction[] = [WONG, SALARY_PAID, NETFLIX, OPENING], totals = TOTALS): Promise<void> {
    lists();
    listRequest().flush(page(items, totals));
    await fixture.whenStable();
  }

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
  const button = (name: string, within: ParentNode = element) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.replace(/\s+/g, ' ').trim() === name)!;

  async function click(name: string, within: ParentNode = element): Promise<void> {
    button(name, within).click();
    await settle();
  }

  async function fill(label: string, value: string): Promise<void> {
    const field = Array.from(element.querySelectorAll('app-transaction-form label')).find((node) => node.textContent?.includes(label))!;
    const control = field.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
    control.value = value;
    // A browser raises both on a select, in this order.
    control.dispatchEvent(new Event('input'));
    if (control instanceof HTMLSelectElement) {
      control.dispatchEvent(new Event('change'));
    }

    await settle();
  }

  it('asks for the month selected in the top bar and shows placeholders meanwhile', async () => {
    expect(element.querySelectorAll('app-skeleton')).toHaveLength(5);

    lists();
    const request = listRequest();
    expect(paramsOf(request)).toEqual({ from: '2026-10-01', to: '2026-10-31', limit: '50' });
    request.flush(page([WONG], TOTALS));
    await fixture.whenStable();

    expect(element.querySelector('app-page-header .eyebrow')?.textContent).toBe('Octubre 2026');
    expect(element.querySelector('app-skeleton')).toBeNull();
  });

  it('lists the movements by day, with the net of the income and expenses of each currency', async () => {
    await open();

    expect(texts('.day')).toEqual(['Lunes, 12 de octubre+S/ 4,446.00 · −US$ 12.99', 'Jueves, 1 de octubre']);
    expect(texts('.row .names strong')).toEqual(['Wong', 'Sueldo', 'Netflix', 'Saldo inicial']);
    expect(texts('.row .names span')).toEqual(['Supermercado · BCP', 'Supermercado · BCP', 'Supermercado · BCP Dólares', 'BCP']);
    expect(texts('.row .amount')).toEqual(['−S/ 54.00', '+S/ 4,500.00', '−US$ 12.99', '+S/ 1,000.00']);
    expect(texts('.row .status')).toEqual(['Confirmada', 'Pendiente', 'Confirmada', 'Confirmada']);
  });

  it('shows the totals the API calculated, one row per currency', async () => {
    await open();

    expect(texts('.summary dd')).toEqual(['S/ 4,500.00', 'S/ 54.00', '+S/ 4,446.00', 'US$ 0.00', 'US$ 12.99', '−US$ 12.99']);
  });

  it('adds every currency up in the base one only when the API did, and says what it could not convert', async () => {
    lists();
    listRequest().flush(page([WONG, NETFLIX], TOTALS, null, { ...IN_BASE, missingRates: ['EUR'] }));
    await fixture.whenStable();

    expect(texts('.summary--base dt')).toEqual(['Ingresos en PEN', 'Gastos en PEN', 'Neto en PEN']);
    expect(texts('.summary--base dd')).toEqual(['S/ 4,500.00', 'S/ 102.71', '+S/ 4,397.29']);
    expect(element.querySelector('.hint')?.textContent).toContain('Sin contar lo que está en EUR');

    // With one currency that is already the base one, the summary of that currency says it all.
    await click('Gastos');
    listRequest().flush(page([WONG], [TOTALS[0]], null, IN_BASE));
    await settle();
    expect(element.querySelector('.summary--base')).toBeNull();
  });

  it('shows a transfer as money between two accounts, neither earned nor spent', async () => {
    await open([WONG, TRANSFER], [TOTALS[0]]);

    expect(texts('.day')).toEqual(['Lunes, 12 de octubre−S/ 54.00', 'Domingo, 11 de octubre']);
    expect(texts('.row .names span')).toEqual(['Supermercado · BCP', 'BCP → BCP Dólares']);
    expect(texts('.row .amount')).toEqual(['−S/ 54.00', 'S/ 375.00']);

    element.querySelectorAll<HTMLButtonElement>('.row')[1].click();
    await settle();
    const detail = element.querySelector('.detail')!;
    expect(detail.querySelector('.amount')?.textContent?.trim()).toBe('S/ 375.00');
    expect(texts('.detail dl div')).toEqual(['TipoTransferencia', 'DesdeBCP', 'HaciaBCP Dólares', 'LlegaUS$ 100.00', 'EstadoConfirmada']);
    expect(button('Editar', detail)).toBeUndefined();
    expect(button('Anular', detail)).toBeDefined();

    await click('Transferencias');
    const filtered = listRequest();
    expect(paramsOf(filtered)).toMatchObject({ type: 'transfer' });
    filtered.flush(page([TRANSFER]));
    await settle();

    // Seen from one of its accounts, the same transfer is money that came in.
    const select = element.querySelector<HTMLSelectElement>('.account-filter')!;
    select.value = 'a-usd';
    select.dispatchEvent(new Event('change'));
    await settle();
    listRequest().flush(page([{ ...TRANSFER, amount: 100, signedAmount: 100, currency: 'USD', accountId: 'a-usd', accountName: 'BCP Dólares' }]));
    await settle();
    expect(texts('.row .amount')).toEqual(['+US$ 100.00']);
  });

  it('registers a transfer between two currencies, asking how much arrives', async () => {
    await open();
    await click('addNueva transacción');
    const form = () => element.querySelector('app-transaction-form')!;
    const send = async () => {
      form().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
    };

    await click('Transferencia');
    expect(texts('app-transaction-form label .label')).toEqual(['Monto', 'Fecha', 'Desde', 'Hacia', 'Descripción (opcional)', 'Nota (opcional)']);
    await send();
    expect(texts('app-transaction-form [role="alert"]')).toEqual(['Escribe el monto.', 'Elige una cuenta.', 'Elige la cuenta que recibe.']);

    await fill('Monto', '375');
    await fill('Fecha', '2026-10-13');
    await fill('Desde', 'a-bcp');
    await fill('Hacia', 'a-bcp');
    await send();
    expect(texts('app-transaction-form [role="alert"]')).toEqual(['Elige una cuenta distinta de la de origen.']);

    await fill('Hacia', 'a-usd');
    await send();
    expect(texts('app-transaction-form [role="alert"]')).toEqual(['Un monto mayor que cero, con hasta dos decimales.']);

    await fill('Llega a la cuenta (USD)', '100');
    await send();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/transfers` });
    expect(request.request.body).toEqual({
      fromAccountId: 'a-bcp', toAccountId: 'a-usd', amount: 375, destinationAmount: 100, occurredOn: '2026-10-13', description: null, note: null,
    });
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    request.flush(TRANSFER);
    await settle();
    listRequest().flush(page([TRANSFER]));
    await settle();

    expect(form()).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Transferencia de S/ 375.00 registrada.');
  });

  it('shows the first movement in the panel and another one on click', async () => {
    await open();
    const detail = () => element.querySelector('.detail')!;
    expect(detail().querySelector('strong')?.textContent).toBe('Wong');
    expect(texts('.detail dt')).toEqual(['Tipo', 'Categoría', 'Cuenta', 'Estado', 'Comercio']);
    expect(texts('.detail .tag')).toEqual(['#mercado']);

    element.querySelectorAll<HTMLButtonElement>('.row')[3].click();
    await settle();

    expect(detail().querySelector('strong')?.textContent).toBe('Saldo inicial');
    expect(button('Editar', detail())).toBeUndefined();
    expect(button('Anular', detail())).toBeDefined();
  });

  it('sends someone without accounts to create one first', async () => {
    lists([]);
    listRequest().flush(page([]));
    await fixture.whenStable();

    expect(element.querySelector('app-empty-state')?.textContent).toContain('Primero necesitas una cuenta');
    expect(element.querySelector('app-empty-state a')?.getAttribute('href')).toBe('/accounts');
  });

  it('tells an empty month from a filter that matches nothing', async () => {
    await open([], []);
    expect(element.querySelector('app-empty-state')?.textContent).toContain('Sin movimientos en octubre 2026');

    await click('Gastos');
    const filtered = listRequest();
    expect(paramsOf(filtered)).toMatchObject({ type: 'expense' });
    filtered.flush(page([]));
    await settle();
    expect(element.querySelector('app-empty-state')?.textContent).toContain('Sin resultados');

    await click('Limpiar filtros');
    expect(paramsOf(listRequest())).toEqual({ from: '2026-10-01', to: '2026-10-31', limit: '50' });
  });

  it('asks again when a filter changes, and for the voided ones only when told', async () => {
    await open();

    await click('Ingresos');
    const income = listRequest();
    expect(paramsOf(income)).toMatchObject({ type: 'income' });
    income.flush(page([SALARY_PAID]));
    await settle();
    expect(texts('.row .names strong')).toEqual(['Sueldo']);

    await click('Anuladas');
    const voided = listRequest();
    expect(paramsOf(voided)).toMatchObject({ type: 'income', status: 'voided' });
    voided.flush(page([]));
    await settle();

    const select = element.querySelector<HTMLSelectElement>('.account-filter')!;
    select.value = 'a-usd';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(paramsOf(listRequest())).toMatchObject({ accountId: 'a-usd' });
  });

  it('adds the next page to the list instead of replacing it', async () => {
    lists();
    listRequest().flush(page([WONG, SALARY_PAID], TOTALS, 'cursor-1'));
    await fixture.whenStable();

    await click('Cargar más');
    const next = listRequest();
    expect(paramsOf(next)).toMatchObject({ cursor: 'cursor-1' });
    next.flush(page([OPENING], TOTALS));
    await settle();

    expect(texts('.row .names strong')).toEqual(['Wong', 'Sueldo', 'Saldo inicial']);
    expect(button('Cargar más')).toBeUndefined();
  });

  it('says so when the movements cannot be loaded and retries', async () => {
    lists();
    listRequest().flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(element.querySelector('app-error-state')?.textContent).toContain('No se pudieron cargar tus movimientos');

    await click('Reintentar');
    listRequest().flush(page([WONG], TOTALS));
    await settle();

    expect(texts('.row .names strong')).toEqual(['Wong']);
  });

  it('registers an expense with the tags of its category and a key that makes it safe to repeat', async () => {
    await open();
    await click('addNueva transacción');
    const form = () => element.querySelector('app-transaction-form')!;

    form().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(texts('app-transaction-form [role="alert"]')).toEqual(['Escribe el monto.', 'Escribe una descripción.', 'Elige una categoría.', 'Elige una cuenta.']);

    await fill('Monto', '54,90');
    await fill('Fecha', '2026-10-13');
    await fill('Descripción', ' Wong ');
    await fill('Categoría', 's-pantry');
    await fill('Cuenta', 'a-bcp');
    expect(texts('app-transaction-form label .label')[0]).toBe('Monto (PEN)');
    form().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const request = http.expectOne({ method: 'POST', url: LIST_URL });
    expect(request.request.body).toEqual({
      type: 'expense',
      accountId: 'a-bcp',
      amount: 54.9,
      categoryId: 's-pantry',
      occurredOn: '2026-10-13',
      description: 'Wong',
      merchant: null,
      note: null,
      tags: ['mercado'],
      pending: false,
    });
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    request.flush(movement('t-new', 'Wong', -54.9, '2026-10-13'));
    await settle();
    listRequest().flush(page([WONG], TOTALS));
    await settle();

    expect(form()).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Gasto de S/ 54.90 registrado.');
  });

  it('offers only the categories of the chosen type and asks again when it changes', async () => {
    await open();
    await click('addNueva transacción');
    const options = () => texts('app-transaction-form select option').slice(0, 3);
    expect(options()).toEqual(['Elige una categoría', 'Supermercado', 'Supermercado › Despensa']);

    await fill('Categoría', 'c-groceries');
    await click('Ingreso');

    expect(texts('app-transaction-form select option').slice(0, 2)).toEqual(['Elige una categoría', 'Sueldo']);
    expect(element.querySelector<HTMLSelectElement>('app-transaction-form select')?.value).toBe('');
  });

  it('chooses the only account by itself, even when the accounts arrive after the form opened', async () => {
    http.expectOne(`${BASE}/categories?includeArchived=true`).flush([GROCERIES, SALARY]);
    listRequest().flush(page([]));
    await settle();
    await click('addNueva transacción');
    await fill('Descripción', 'Ya escrita');

    http.expectOne(`${BASE}/accounts?includeArchived=true`).flush([BCP]);
    await fixture.whenStable();

    const selects = element.querySelectorAll<HTMLSelectElement>('app-transaction-form select');
    expect(selects[1].value).toBe('a-bcp');
    expect(element.querySelector<HTMLInputElement>('app-transaction-form input[placeholder^="ej."]')?.value).toBe('Ya escrita');
  });

  it('voids a movement with the reason the person gives', async () => {
    await open();
    const detail = element.querySelector('.detail')!;

    await click('Anular', detail);
    const reason = detail.querySelector<HTMLInputElement>('.void input')!;
    reason.value = ' Duplicado ';
    reason.dispatchEvent(new Event('input'));
    await settle();
    await click('Sí, anular', detail);

    const request = http.expectOne({ method: 'POST', url: `${LIST_URL}/t-wong/void` });
    expect(request.request.body).toEqual({ reason: 'Duplicado' });
    request.flush({ ...WONG, status: 'voided' });
    await settle();
    listRequest().flush(page([SALARY_PAID], TOTALS));
    await settle();

    expect(element.querySelector('[role="status"]')?.textContent).toBe('«Wong» anulado. Ya no cuenta en saldos ni en totales.');
    expect(texts('.row .names strong')).toEqual(['Sueldo']);
  });

  it('confirms a pending movement from its panel', async () => {
    await open([SALARY_PAID], TOTALS);

    await click('Confirmar', element.querySelector('.detail')!);
    http.expectOne({ method: 'POST', url: `${LIST_URL}/t-salary/confirm` }).flush({ ...SALARY_PAID, status: 'confirmed' });
    await settle();
    listRequest().flush(page([{ ...SALARY_PAID, status: 'confirmed' }], TOTALS));
    await settle();

    expect(texts('.row .status')).toEqual(['Confirmada']);
    expect(button('Confirmar')).toBeUndefined();
  });

  it('starts filtered by the account it was opened for', async () => {
    http.match(() => true).forEach((request) => request.flush(request.request.url === LIST_URL ? page([]) : []));
    const scoped = TestBed.createComponent(Transactions);
    scoped.componentRef.setInput('accountId', 'a-usd');
    TestBed.tick();

    http.expectOne(`${BASE}/accounts?includeArchived=true`).flush([BCP, DOLLARS]);
    http.expectOne(`${BASE}/categories?includeArchived=true`).flush([GROCERIES, SALARY]);
    const request = listRequest();
    expect(paramsOf(request)).toMatchObject({ accountId: 'a-usd' });
    request.flush(page([NETFLIX]));
    await scoped.whenStable();
    await fixture.whenStable();

    expect(scoped.nativeElement.querySelector('.account-filter').value).toBe('a-usd');
  });

  it('starts on a category from a budget, and on every date from the global search', async () => {
    http.match(() => true).forEach((request) => request.flush(request.request.url === LIST_URL ? page([]) : []));
    const scoped = TestBed.createComponent(Transactions);
    scoped.componentRef.setInput('categoryId', 'c-groceries');
    scoped.componentRef.setInput('q', 'wong');
    scoped.componentRef.setInput('range', 'all');
    TestBed.tick();

    http.expectOne(`${BASE}/accounts?includeArchived=true`).flush([BCP, DOLLARS]);
    http.expectOne(`${BASE}/categories?includeArchived=true`).flush([GROCERIES, SALARY]);
    const request = listRequest();
    // No month: what the search found in March has to be on the list too.
    expect(paramsOf(request)).toEqual({ limit: '50', categoryId: 'c-groceries', q: 'wong' });
    request.flush(page([WONG]));
    await scoped.whenStable();
    await fixture.whenStable();

    const view = scoped.nativeElement as HTMLElement;
    const filter = view.querySelector<HTMLSelectElement>('select[aria-label^="Categoría"]')!;
    expect(filter.value).toBe('c-groceries');
    expect(filter.getAttribute('aria-label')).toBe('Categoría: Supermercado');
    expect(view.querySelector('app-page-header')!.textContent).toContain('Todas las fechas');
  });
});
