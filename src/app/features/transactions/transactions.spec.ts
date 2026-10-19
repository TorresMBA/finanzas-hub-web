import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account, AccountSummary, BaseTotals, Category, CurrencyTotals, ExchangeRate, Transaction, TransactionPage } from '../../core/api/api-types';
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
  { currency: 'PEN', income: 4500, expense: 54, net: 4446, count: 2, baseNet: 4446 },
  { currency: 'USD', income: 0, expense: 12.99, net: -12.99, count: 1, baseNet: -48.71 },
];
const RATES: ExchangeRate[] = [{ currency: 'USD', baseCurrency: 'PEN', rate: 3.75, asOf: '2026-10-01' }];
const NET_WORTH: AccountSummary = {
  baseCurrency: 'PEN',
  netWorth: 1321,
  assets: 1321,
  debts: 0,
  missingRates: [],
  currencies: [
    { currency: 'PEN', assets: 946, debts: 0, net: 946, rate: null, rateDate: null },
    { currency: 'USD', assets: 100, debts: 0, net: 100, rate: 3.75, rateDate: '2026-10-01' },
  ],
};
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

  afterEach(() => {
    // The rates and net worth are asked for on opening and again after every change: answered whenever they are pending.
    rates();
    http.verify();
  });

  /** Lets what a click or an answer started run and renders it; with a request waiting the application is not stable. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  const listRequest = (): TestRequest => http.expectOne((request) => request.method === 'GET' && request.url === LIST_URL);
  const paramsOf = (request: TestRequest) => Object.fromEntries(request.request.params.keys().map((key) => [key, request.request.params.get(key)]));

  /** Answers the person's exchange rates and net worth, wherever they are pending. */
  function rates(): void {
    http.match(`${BASE}/exchange-rates`).forEach((request) => request.flush(RATES));
    http.match(`${BASE}/accounts/summary`).forEach((request) => request.flush(NET_WORTH));
  }

  /** Answers the accounts and the categories the page asks for when it opens, and the rates and net worth. */
  function lists(accounts: Account[] = [BCP, DOLLARS]): void {
    http.expectOne(`${BASE}/accounts?includeArchived=true`).flush(accounts);
    http.expectOne(`${BASE}/categories?includeArchived=true`).flush([GROCERIES, SALARY]);
    rates();
  }

  async function open(items: Transaction[] = [WONG, SALARY_PAID, NETFLIX, OPENING], totals = TOTALS, baseTotals: BaseTotals | null = IN_BASE): Promise<void> {
    lists();
    listRequest().flush(page(items, totals, null, baseTotals));
    await fixture.whenStable();
  }

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
  const button = (name: string, within: ParentNode = element) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.replace(/\s+/g, ' ').trim() === name)!;

  async function click(name: string, within: ParentNode = element): Promise<void> {
    button(name, within).click();
    await settle();
  }

  /** Chooses an account by name in the picker of a field, as a person does: open it, click the account. */
  async function pick(label: string, account: string): Promise<void> {
    const field = Array.from(element.querySelectorAll('app-transaction-form app-field')).find((node) => node.querySelector('.label')?.textContent === label)!;
    field.querySelector<HTMLButtonElement>('app-account-picker .trigger')!.click();
    await settle();
    Array.from(field.querySelectorAll<HTMLElement>('[role="option"]'))
      .find((option) => option.querySelector('strong')?.textContent === account)!
      .click();
    await settle();
  }

  const options = (label: string) => {
    const field = Array.from(element.querySelectorAll('app-transaction-form app-field')).find((node) => node.querySelector('.label')?.textContent === label)!;
    return Array.from(field.querySelectorAll('[role="option"]')).map((option) => `${option.querySelector('strong')?.textContent}${option.getAttribute('aria-disabled') ? ' (no)' : ''}`);
  };

  async function fill(label: string, value: string): Promise<void> {
    const field = Array.from(element.querySelectorAll('app-transaction-form label')).find((node) => node.textContent?.includes(label))!;
    // An amount with a choice of currency has a select in front: what is typed goes to the amount.
    const control = (field.querySelector<HTMLInputElement>('input, textarea') ?? field.querySelector<HTMLSelectElement>('select'))!;
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

  it('adds every currency up in the base one, with a row per currency that filters the list by it', async () => {
    await open();

    expect(texts('app-transactions-summary h2')).toEqual(['Octubre 2026 · todas las monedas']);
    expect(texts('app-transactions-summary .badge')).toEqual(['Convertido a PEN']);
    expect(texts('.kpis dd:not(.note)')).toEqual(['S/ 4,500.00', 'S/ 102.71', '+S/ 4,397.29']);
    // Each currency in its own amounts, and its net in soles at the rate of each day.
    const cells = Array.from(element.querySelectorAll('app-transactions-summary tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('th, td:not(:last-child)')).map((cell) => cell.textContent?.trim()).join(' '),
    );
    expect(cells).toEqual([
      'PEN S/ 4,500.00 S/ 54.00 +S/ 4,446.00 —',
      'USD US$ 0.00 US$ 12.99 −US$ 12.99 ≈ −S/ 48.71',
    ]);
    // The rates the conversions use are in sight, and net worth by currency beside the list.
    expect(texts('.rates span:not(.sr-only)')).toEqual(['1 US$ = S/ 3.750', '· desde el 1 oct']);
    expect(texts('app-net-worth-card .line')).toEqual(['PENMoneda baseS/ 946.00', 'USDUS$ 100.00S/ 375.00']);

    element.querySelector<HTMLButtonElement>('[aria-label="Ver solo USD"]')!.click();
    await settle();
    const dollars = listRequest();
    expect(paramsOf(dollars)).toMatchObject({ currency: 'USD' });
    dollars.flush(page([NETFLIX], [TOTALS[1]], null, IN_BASE));
    await settle();

    // One currency in its own amounts, and what they are worth today in the base one.
    expect(texts('app-transactions-summary h2')).toEqual(['Octubre 2026 · solo movimientos en USD']);
    expect(texts('.kpis dd:not(.note)')).toEqual(['US$ 0.00', 'US$ 12.99', '−US$ 12.99']);
    expect(texts('.kpis .note')).toEqual(['≈ S/ 0.00 hoy', '≈ S/ 48.71 hoy', '≈ −S/ 48.71 hoy']);
    expect(element.querySelector('[aria-label="Moneda"] [aria-pressed="true"]')?.textContent).toBe('US$ USD');
  });

  it('says what it could not convert, and shows a single base currency in its own amounts', async () => {
    await open([WONG, NETFLIX], TOTALS, { ...IN_BASE, missingRates: ['EUR'] });
    expect(element.querySelector('app-transactions-summary .hint')?.textContent).toContain('Sin contar lo que está en EUR');

    await click('Gastos');
    listRequest().flush(page([WONG], [TOTALS[0]], null, IN_BASE));
    await settle();
    expect(texts('app-transactions-summary .badge')).toEqual(['Monto original']);
    expect(element.querySelector('app-transactions-summary table')).toBeNull();
    expect(texts('.kpis .note')).toEqual(['Moneda base', 'Moneda base', 'Moneda base']);
  });

  it('shows a transfer as money between two accounts, neither earned nor spent', async () => {
    await open([WONG, TRANSFER], [TOTALS[0]]);

    expect(texts('.day')).toEqual(['Lunes, 12 de octubre−S/ 54.00', 'Domingo, 11 de octubre']);
    expect(texts('.row .names span')).toEqual(['Supermercado · BCP', 'BCP → BCP Dólares']);
    // Between two currencies the row shows what left and what arrived, and the rate that implies.
    expect(texts('.row .amount')).toEqual(['−S/ 54.00', 'S/ 375.00 → US$ 100.00']);
    expect(texts('.row .figures small')).toEqual(['1 US$ = S/ 3.750']);

    element.querySelectorAll<HTMLButtonElement>('.row')[1].click();
    await settle();
    const detail = element.querySelector('.detail')!;
    expect(detail.querySelector('.amount')?.textContent?.trim()).toBe('S/ 375.00');
    expect(detail.querySelector('.sub')?.textContent).toBe('Recibiste US$ 100.00');
    expect(texts('app-transaction-detail > dl > div')).toEqual(['TipoTransferencia', 'DesdeBCP', 'HaciaBCP Dólares', 'LlegaUS$ 100.00', 'EstadoConfirmada']);
    expect(texts('.detail app-fx-breakdown dl div')).toEqual(['EnviasteS/ 375.00', 'RecibisteUS$ 100.00', 'Tipo aplicado1 US$ = S/ 3.750']);
    expect(button('Editar', detail)).toBeUndefined();
    expect(button('Anular', detail)).toBeDefined();

    await click('Transferencias');
    const filtered = listRequest();
    expect(paramsOf(filtered)).toMatchObject({ type: 'transfer' });
    filtered.flush(page([TRANSFER]));
    await settle();

    // Seen from one of its accounts, the same transfer is money that came in.
    const select = element.querySelector<HTMLSelectElement>('#account-filter')!;
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
    expect(texts('app-transaction-form label .label')).toEqual([
      'Descripción (opcional)', 'Desde', 'Monto que envías', 'Fecha', 'Hacia', 'Comisión cobrada (opcional)', 'Nota (opcional)',
    ]);
    await send();
    expect(texts('app-transaction-form [role="alert"]')).toEqual(['Elige una cuenta.', 'Escribe el monto.', 'Elige la cuenta que recibe.']);

    await pick('Desde', 'BCP');
    await fill('Monto que envías', '375');
    await fill('Fecha', '2026-10-13');
    // The accounts come by currency with their balances, and the origin cannot receive.
    element.querySelectorAll<HTMLButtonElement>('app-transaction-form app-account-picker .trigger')[1].click();
    await settle();
    expect(options('Hacia')).toEqual(['BCP (no)', 'BCP Dólares']);
    element.querySelectorAll<HTMLElement>('app-transaction-form [role="option"]')[1].click();
    await settle();
    await send();
    expect(texts('app-transaction-form [role="alert"]')).toEqual(['Un monto mayor que cero, con hasta 2 decimales.']);

    await fill('Monto que recibes', '100');
    // What the exchange cost against the person's rate: nothing, at 3.75.
    expect(texts('app-transaction-form app-fx-breakdown dl div')).toEqual([
      'Tipo de cambio aplicado1 US$ = S/ 3.750', 'Mercado hoy1 US$ = S/ 3.750', 'Costo del cambioSin costo',
    ]);
    await send();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/transfers` });
    expect(request.request.body).toEqual({
      fromAccountId: 'a-bcp', toAccountId: 'a-usd', amount: 375, destinationAmount: 100, occurredOn: '2026-10-13', description: null, note: null, fee: null,
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

    const select = element.querySelector<HTMLSelectElement>('#account-filter')!;
    select.value = 'a-usd';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(paramsOf(listRequest())).toMatchObject({ accountId: 'a-usd' });
    // The filters folded under "Más filtros" say how many are on.
    expect(element.querySelector('.more-filters .count')?.textContent).toBe('2');
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
    expect(texts('app-transaction-form [role="alert"]')).toEqual(['Escribe una descripción.', 'Elige una cuenta.', 'Escribe el monto.', 'Elige una categoría.']);

    await fill('Descripción', ' Wong ');
    await pick('Cuenta', 'BCP');
    await fill('Monto', '54,90');
    await fill('Fecha', '2026-10-13');
    await fill('Categoría', 's-pantry');
    // The category offers its tags; one click adds them.
    element.querySelector<HTMLButtonElement>('app-disclosure .toggle')!.click();
    await settle();
    await click('+ mercado');
    expect(texts('app-tag-input .chip')).toEqual(['#mercado ×']);
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
      originalAmount: null,
      originalCurrency: null,
      fxRate: null,
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
    rates();
    listRequest().flush(page([]));
    await settle();
    await click('addNueva transacción');
    await fill('Descripción', 'Ya escrita');

    http.expectOne(`${BASE}/accounts?includeArchived=true`).flush([BCP]);
    await fixture.whenStable();

    expect(texts('app-transaction-form app-account-picker .trigger strong')).toEqual(['BCP']);
    expect(element.querySelector<HTMLInputElement>('app-transaction-form input[placeholder^="ej."]')?.value).toBe('Ya escrita');
  });

  it('registers a purchase priced in another currency: what the card charged counts, the price stays as a reference', async () => {
    await open();
    await click('addNueva transacción');
    await fill('Descripción', 'Netflix');
    await pick('Cuenta', 'BCP');
    Array.from(element.querySelectorAll<HTMLButtonElement>('app-transaction-form .quick button')).find((chip) => chip.textContent?.includes('Pagar en US$'))!.click();
    await settle();

    await fill('Precio', '15.49');
    // Until the statement arrives, the charge is estimated at the person's rate.
    expect(element.querySelector<HTMLInputElement>('app-transaction-form .foreign input')?.placeholder).toBe('58.09');
    await fill('Se cobra en tu cuenta', '58.71');
    expect(texts('app-transaction-form .foreign app-fx-breakdown dl div')).toEqual([
      'Tipo de cambio del banco1 US$ = S/ 3.7902', 'Mercado hoy1 US$ = S/ 3.750', 'Recargo por cambio−S/ 0.62 (1.1%)',
    ]);
    await fill('Fecha', '2026-10-13');
    await fill('Categoría', 'c-groceries');
    element.querySelector('app-transaction-form form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const request = http.expectOne({ method: 'POST', url: LIST_URL });
    expect(request.request.body).toMatchObject({ accountId: 'a-bcp', amount: 58.71, originalAmount: 15.49, originalCurrency: 'USD', fxRate: null });
    request.flush(movement('t-netflix-2', 'Netflix', -58.71, '2026-10-13'));
    await settle();
    listRequest().flush(page([WONG], TOTALS, null, IN_BASE));
    await settle();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Gasto de S/ 58.71 registrado.');
  });

  it('shows what an amount in another currency was worth, and lets its rate be adjusted', async () => {
    const converted = { ...NETFLIX, conversion: { baseCurrency: 'PEN', baseAmount: 48.06, rate: 3.7, rateDate: '2026-10-01', isManual: false } };
    await open([converted], [TOTALS[1]]);
    expect(texts('.row .figures small')).toEqual(['≈ −S/ 48.06']);

    const detail = element.querySelector('.detail')!;
    expect(texts('.detail app-fx-breakdown dl div')).toEqual([
      'Tipo de cambio usado1 US$ = S/ 3.700', 'FuenteTu tipo de cambio · desde el 1 oct', 'Equivale hoy−S/ 48.71',
    ]);
    await click('Ajustar tipo de cambio', detail);

    // The edit opens on the rate: the one the bank applied is written by hand.
    await fill('1 US$ = S/', '3.80');
    expect(texts('app-transaction-form .rate-line span')).toEqual(['currency_exchange≈ S/ 49.36 · 1 US$ = S/ 3.800']);
    element.querySelector('app-transaction-form form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const request = http.expectOne({ method: 'PATCH', url: `${LIST_URL}/t-netflix` });
    expect(request.request.body).toMatchObject({ amount: 12.99, fxRate: 3.8, originalAmount: null });
    request.flush({ ...converted, conversion: { ...converted.conversion, rate: 3.8, baseAmount: 49.36, isManual: true } });
    await settle();
    listRequest().flush(page([converted], [TOTALS[1]], null, IN_BASE));
    await settle();
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
    rates();
    await scoped.whenStable();
    await fixture.whenStable();

    expect(scoped.nativeElement.querySelector('#account-filter').value).toBe('a-usd');
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
    rates();
    await scoped.whenStable();
    await fixture.whenStable();

    const view = scoped.nativeElement as HTMLElement;
    const filter = view.querySelector<HTMLSelectElement>('select[aria-label^="Categoría"]')!;
    expect(filter.value).toBe('c-groceries');
    expect(filter.getAttribute('aria-label')).toBe('Categoría: Supermercado');
    expect(view.querySelector('app-page-header')!.textContent).toContain('Todas las fechas');
  });
});
