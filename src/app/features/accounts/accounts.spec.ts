import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account, AccountSummary, NetWorth, Transaction, TransactionPage } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Accounts } from './accounts';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;
const ACCOUNTS_URL = `${BASE}/accounts?includeArchived=true`;
const SUMMARY_URL = `${BASE}/accounts/summary`;
const NET_WORTH_URL = `${BASE}/net-worth`;
const movementsUrl = (accountId: string) => `${BASE}/transactions?accountId=${accountId}&limit=6`;

const account = (id: string, name: string, balance: number, extra: Partial<Account> = {}): Account => ({
  id,
  name,
  type: 'bank',
  currency: 'PEN',
  institution: null,
  balance,
  includeInNetWorth: true,
  creditCard: null,
  isArchived: false,
  createdAt: '2026-10-01T10:00:00Z',
  isFavorite: false,
  ...extra,
});
const BCP = account('a-bcp', 'BCP Sueldo', 946.1, { institution: 'BCP' });
const DOLLARS = account('a-usd', 'BCP Dólares', 820, { currency: 'USD' });
const CASH = account('a-cash', 'Efectivo', 180.2, { type: 'cash' });
const OLD = account('a-old', 'Vieja', 50, { isArchived: true });
const VISA = account('a-visa', 'Visa', -3600, {
  type: 'creditCard',
  creditCard: { creditLimit: 5000, used: 3600, available: 1400, paymentDay: 5, closingDay: null, nextPaymentDate: '2026-11-05' },
});
const FUND = account('a-fund', 'Fondo viaje', 400, { includeInNetWorth: false });

const SUMMARY: AccountSummary = {
  baseCurrency: 'PEN',
  netWorth: 4201.3,
  assets: 4201.3,
  debts: 0,
  missingRates: [],
  currencies: [
    { currency: 'PEN', assets: 1126.3, debts: 0, net: 1126.3, rate: null, rateDate: null },
    { currency: 'USD', assets: 820, debts: 0, net: 820, rate: 3.75, rateDate: '2026-01-01' },
  ],
};
/** What the API answers for net worth when the person has no investments: the ledger's figures as they are. */
const worthOf = (summary: AccountSummary): NetWorth => ({
  baseCurrency: summary.baseCurrency,
  amount: summary.netWorth,
  assets: summary.assets,
  debts: summary.debts,
  unrealizedGain: 0,
  missingRates: summary.missingRates,
});
const WITHOUT_RATE: AccountSummary = {
  ...SUMMARY,
  netWorth: 1126.3,
  assets: 1126.3,
  missingRates: ['USD'],
  currencies: [SUMMARY.currencies[0], { ...SUMMARY.currencies[1], rate: null, rateDate: null }],
};

const OPENING: Transaction = {
  id: 't-opening',
  kind: 'openingBalance',
  status: 'confirmed',
  occurredOn: '2026-10-01',
  description: 'Saldo inicial',
  merchant: null,
  note: null,
  amount: 1000,
  signedAmount: 1000,
  currency: 'PEN',
  accountId: 'a-bcp',
  accountName: 'BCP Sueldo',
  category: null,
  tags: [],
  isEditable: false,
  createdAt: '2026-10-01T10:00:00Z',
  voidReason: null,
  transfer: null,
  fundedByGoal: false,
};
const PAYMENT: Transaction = {
  ...OPENING,
  id: 't-payment',
  kind: 'transfer',
  description: 'Pago de tarjeta',
  occurredOn: '2026-10-08',
  amount: 500,
  signedAmount: -500,
  transfer: {
    fromAccountId: 'a-bcp', fromAccountName: 'BCP Sueldo', amountOut: 500, currencyOut: 'PEN',
    toAccountId: 'a-visa', toAccountName: 'Visa', amountIn: 500, currencyIn: 'PEN', isCardPayment: true,
  },
};
const page = (...items: Transaction[]): TransactionPage => ({ items, nextCursor: null, totals: [], baseTotals: null });

describe('Accounts', () => {
  let fixture: ComponentFixture<Accounts>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([idempotencyKeyInterceptor, apiErrorInterceptor])), provideHttpClientTesting(), provideSession()],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Accounts);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  /** Lets what a click or an answer started run and renders it; with a request waiting the application is not stable. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  /** Answers the list and the summary, and then the movements of the account the page selects. */
  async function load(accounts: Account[] = [BCP, DOLLARS, CASH, OLD], selected = 'a-bcp', summary = SUMMARY, movements = page(OPENING)): Promise<void> {
    http.expectOne(ACCOUNTS_URL).flush(accounts);
    http.expectOne(SUMMARY_URL).flush(summary);
    http.expectOne(NET_WORTH_URL).flush(worthOf(summary));
    await settle();
    if (accounts.some((candidate) => candidate.id === selected)) {
      http.expectOne(movementsUrl(selected)).flush(movements);
    }

    await fixture.whenStable();
  }

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
  const button = (name: string, within: ParentNode = element) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.replace(/\s+/g, ' ').trim() === name)!;

  async function click(name: string, within: ParentNode = element): Promise<void> {
    button(name, within).click();
    await settle();
  }

  /** Types into the field of the open dialog whose label contains `label`. */
  async function type(label: string, value: string, form = 'app-account-form'): Promise<void> {
    const field = Array.from(element.querySelectorAll(`${form} label`)).find((node) => node.textContent?.includes(label))!;
    const control = field.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
    control.value = value;
    control.dispatchEvent(new Event('input'));
    if (control instanceof HTMLSelectElement) {
      control.dispatchEvent(new Event('change'));
    }

    await settle();
  }

  async function submit(form = 'app-account-form'): Promise<void> {
    element.querySelector(`${form} form`)!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  it('shows placeholders while the accounts load and says so when they cannot be loaded', async () => {
    expect(element.querySelectorAll('app-skeleton')).toHaveLength(3);

    http.expectOne(ACCOUNTS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne(SUMMARY_URL).flush(SUMMARY);
    http.expectOne(NET_WORTH_URL).flush(worthOf(SUMMARY));
    await fixture.whenStable();
    expect(element.querySelector('app-error-state')?.textContent).toContain('No se pudieron cargar tus cuentas');

    button('Reintentar').click();
    await settle();
    await load();
    expect(texts('.account strong')).toEqual(['BCP Sueldo', 'BCP Dólares', 'Efectivo']);
  });

  it('invites someone without accounts to create the first one', async () => {
    await load([]);

    expect(element.querySelector('app-empty-state')?.textContent).toContain('Todavía no tienes cuentas');
    await click('Crear una cuenta');
    expect(element.querySelector('app-account-form h2')?.textContent).toBe('Nueva cuenta');
  });

  it('shows the net worth the API computed and groups the accounts without adding two currencies together', async () => {
    await load();

    expect(texts('app-stat-card .label')).toEqual(['Patrimonio', 'Tienes', 'Debes']);
    expect(texts('app-stat-card .value')).toEqual(['S/ 4,201.30', 'S/ 4,201.30', 'S/ 0.00']);
    expect(texts('.rates li')).toEqual(['1 USD = 3.75 PENCambiar']);
    expect(texts('h2')).toEqual(['Cuentas bancarias', 'Efectivo y billeteras']);
    expect(texts('.group-total')).toEqual(['S/ 946.10US$ 820.00', 'S/ 180.20']);
    expect(texts('.account .balance')).toEqual(['S/ 946.10', 'US$ 820.00', 'S/ 180.20']);
  });

  it('keeps archived accounts out of sight until asked', async () => {
    await load();

    await click('Archivadas (1)');

    expect(texts('.account strong')).toEqual(['BCP Sueldo', 'BCP Dólares', 'Vieja', 'Efectivo']);
    expect(texts('.group-total')[0]).toBe('S/ 946.10US$ 820.00');
  });

  it('shows the selected account with its last movements and changes it on click', async () => {
    await load();
    expect(element.querySelector('.detail .detail-balance')?.textContent).toBe('S/ 946.10');
    expect(texts('.movements li')).toEqual(['Saldo inicial1 oct+S/ 1,000.00']);

    element.querySelectorAll<HTMLButtonElement>('.account')[2].click();
    await settle();
    http.expectOne(movementsUrl('a-cash')).flush(page());
    await fixture.whenStable();

    expect(element.querySelector('.detail .detail-balance')?.textContent).toBe('S/ 180.20');
    expect(texts('.movements li')).toEqual(['Sin movimientos todavía.']);
  });

  it('shows a credit card by what it owes, how much of its line is used and when it is due', async () => {
    await load([BCP, VISA, FUND], 'a-bcp', SUMMARY, page(PAYMENT));

    expect(texts('h2')).toEqual(['Cuentas bancarias', 'Tarjetas de crédito']);
    const card = element.querySelectorAll<HTMLButtonElement>('.account')[2];
    expect(card.querySelector('.balance')?.textContent).toBe('S/ 3,600.00');
    expect(card.querySelector('.usage')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Disponible S/ 1,400.00 de S/ 5,000.00');
    expect(card.querySelector('.meter')?.getAttribute('data-level')).toBe('warn');
    expect(card.querySelector<HTMLElement>('.meter')?.style.getPropertyValue('--meter')).toBe('72');

    // Seen from the paying account, a card payment says where the money went.
    expect(texts('.movements li')).toEqual(['Pago de tarjeta8 oct · hacia Visa−S/ 500.00']);
    // An account the person took out of the net worth says so.
    expect(texts('.account .badge')).toEqual(['Aparte']);

    card.click();
    await settle();
    http.expectOne(movementsUrl('a-visa')).flush(page(PAYMENT));
    await fixture.whenStable();

    expect(element.querySelector('.detail .detail-label')?.textContent).toBe('Deuda');
    expect(element.querySelector('.detail .detail-balance')?.textContent).toBe('S/ 3,600.00');
    expect(texts('.facts div')).toEqual(['DisponibleS/ 1,400.00', 'LíneaS/ 5,000.00', 'Próximo pago5 nov']);
    expect(texts('.movements li')).toEqual(['Pago de tarjeta8 oct · desde BCP Sueldo−S/ 500.00']);
    expect(texts('.detail-actions button')).toEqual(['Pagar tarjeta', 'Editar', 'Mostrar en Inicio', 'Ajustar deuda', 'Archivar']);

    await click('Tarjetas');
    expect(texts('.account strong')).toEqual(['Visa']);
  });

  it('opens an account with its balance, sending a key that makes the request safe to repeat', async () => {
    await load();
    await click('addNueva cuenta');

    await submit();
    expect(texts('app-account-form [role="alert"]')).toEqual(['Escribe un nombre.']);

    await type('Nombre', ' Yape ');
    await click('Billetera');
    await type('Saldo actual', '64,5');
    await submit();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/accounts` });
    expect(request.request.body).toEqual({
      name: 'Yape', type: 'wallet', currency: 'PEN', institution: null, openingBalance: 64.5, includeInNetWorth: true, creditCard: null,
    });
    const key = request.request.headers.get('Idempotency-Key');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    // The API refuses; the person corrects and sends again from the same dialog, with the same key.
    request.flush({ code: 'ledger.account.name_taken', detail: 'Taken.' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(texts('app-account-form [role="alert"]')).toEqual(['Ya tienes una cuenta activa con ese nombre.']);
    await type('Nombre', 'Plin');
    await submit();
    const retry = http.expectOne({ method: 'POST', url: `${BASE}/accounts` });
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(account('a-plin', 'Plin', 64.5, { type: 'wallet' }));
    await settle();
    await load();

    expect(element.querySelector('app-account-form')).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Cuenta «Plin» creada.');
  });

  it('opens a credit card with its line and its days, and registers what it already owes as a debt', async () => {
    await load();
    await click('addNueva cuenta');
    await click('Tarjeta');
    await type('Nombre', 'Visa');

    await submit();
    expect(texts('app-account-form [role="alert"]')).toEqual(['Escribe la línea de la tarjeta, mayor que cero.', 'Un día del mes, del 1 al 31.']);

    await type('Línea de crédito', '5000');
    await type('Día de pago', '5');
    await type('Día de cierre', '40');
    await submit();
    expect(texts('app-account-form [role="alert"]')).toEqual(['Un día del mes, del 1 al 31.']);

    await type('Día de cierre', '');
    await type('Deuda actual', '450');
    await submit();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/accounts` });
    expect(request.request.body).toEqual({
      name: 'Visa', type: 'creditCard', currency: 'PEN', institution: null, openingBalance: -450, includeInNetWorth: true,
      creditCard: { creditLimit: 5000, paymentDay: 5, closingDay: null },
    });
    request.flush(VISA);
    await settle();
    await load();

    expect(element.querySelector('[role="status"]')?.textContent).toBe('Tarjeta «Visa» creada.');
  });

  it('refuses a balance that is not an amount before sending anything', async () => {
    await load();
    await click('addNueva cuenta');
    await type('Nombre', 'Yape');
    await type('Saldo actual', '1,234.50');

    await submit();

    expect(texts('app-account-form [role="alert"]')).toEqual(['Escribe un monto con hasta dos decimales, por ejemplo 1250.50.']);
  });

  it('lets the person take an account out of the net worth when editing it', async () => {
    await load();
    await click('Editar');
    const toggle = element.querySelector<HTMLInputElement>('app-account-form input[type="checkbox"]')!;
    expect(toggle.checked).toBe(true);

    toggle.click();
    await settle();
    await submit();

    const request = http.expectOne({ method: 'PATCH', url: `${BASE}/accounts/a-bcp` });
    expect(request.request.body).toEqual({ name: 'BCP Sueldo', institution: 'BCP', includeInNetWorth: false, creditCard: null });
    request.flush({ ...BCP, includeInNetWorth: false });
    await settle();
    await load([{ ...BCP, includeInNetWorth: false }, DOLLARS, CASH, OLD]);

    expect(element.querySelector('[role="status"]')?.textContent).toBe('Cuenta «BCP Sueldo» guardada.');
    expect(element.querySelector('.detail .lead')?.textContent).toBe('No cuenta en tu patrimonio. Puedes cambiarlo al editarla.');
  });

  it('states the real balance of an account and reports the adjustment', async () => {
    await load();
    await click('Ajustar saldo');
    expect(element.querySelector('app-account-form .form-note')?.textContent).toContain('S/ 946.10');

    await type('Saldo real', '900');
    await submit();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/accounts/a-bcp/adjust-balance` });
    expect(request.request.body).toEqual({ actualBalance: 900, occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    request.flush({ ...BCP, balance: 900 });
    await settle();
    await load([{ ...BCP, balance: 900 }, DOLLARS, CASH, OLD]);

    expect(element.querySelector('[role="status"]')?.textContent).toBe('Saldo de «BCP Sueldo» ajustado a S/ 900.00.');
    expect(element.querySelector('.detail .detail-balance')?.textContent).toBe('S/ 900.00');
  });

  it('pays a credit card from an account with money, in each one\'s currency', async () => {
    await load([VISA, BCP, DOLLARS]);
    element.querySelectorAll<HTMLButtonElement>('.account')[2].click();
    await settle();
    http.expectOne(movementsUrl('a-visa')).flush(page());
    await fixture.whenStable();
    await click('Pagar tarjeta');
    const form = 'app-card-payment-form';

    expect(element.querySelector(`${form} .form-note`)?.textContent).toContain('S/ 3,600.00');
    // Another card is not offered, and the amount starts at what is owed.
    expect(texts(`${form} option`)).toEqual(['Elige una cuenta', 'BCP Sueldo · S/ 946.10', 'BCP Dólares · US$ 820.00']);
    await submit(form);
    expect(texts(`${form} [role="alert"]`)).toEqual(['Elige la cuenta desde la que pagas.']);

    await type('Pagar desde', 'a-usd', form);
    await type('Monto del pago', '375', form);
    await submit(form);
    expect(texts(`${form} [role="alert"]`)).toEqual(['Un monto mayor que cero, con hasta dos decimales.']);

    await type('Sale de la cuenta', '100', form);
    await submit(form);

    const request = http.expectOne({ method: 'POST', url: `${BASE}/accounts/a-visa/payments` });
    expect(request.request.body).toEqual({ fromAccountId: 'a-usd', amount: 375, sourceAmount: 100, occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    request.flush(PAYMENT);
    await settle();
    await load([VISA, BCP, DOLLARS], 'a-visa', SUMMARY, page(PAYMENT));

    expect(element.querySelector(form)).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Pago de S/ 375.00 a «Visa» registrado.');
  });

  it('says which currency is missing its exchange rate and lets the person give it', async () => {
    await load(undefined, undefined, WITHOUT_RATE);
    expect(texts('.rates li')).toEqual(['Falta el tipo de cambio de USD: lo que tienes en esa moneda todavía no suma en tu patrimonio.Definir']);
    expect(texts('app-stat-card .value')[0]).toBe('S/ 1,126.30');

    await click('Definir');
    const form = 'app-exchange-rate-form';
    expect(element.querySelector(`${form} h2`)?.textContent).toBe('Tipo de cambio de USD');
    await type('1 USD equivale a', '0', form);
    await submit(form);
    expect(texts(`${form} [role="alert"]`)).toEqual(['Un número mayor que cero, con hasta seis decimales.']);

    await type('1 USD equivale a', '3,75', form);
    await submit(form);

    const request = http.expectOne({ method: 'PUT', url: `${BASE}/exchange-rates/USD` });
    expect(request.request.body).toEqual({ rate: 3.75 });
    request.flush({ currency: 'USD', baseCurrency: 'PEN', rate: 3.75, asOf: '2026-10-13' });
    await settle();
    await load();

    expect(element.querySelector('[role="status"]')?.textContent).toBe('Tipo de cambio guardado: 1 USD = 3.75 PEN.');
    expect(texts('.rates li')).toEqual(['1 USD = 3.75 PENCambiar']);
    expect(texts('app-stat-card .value')[0]).toBe('S/ 4,201.30');
  });

  it('archives an account and says what that means', async () => {
    await load();

    await click('Archivar');
    http.expectOne({ method: 'POST', url: `${BASE}/accounts/a-bcp/archive` }).flush({ ...BCP, isArchived: true });
    await settle();
    // The page reloads the movements of the account that is still selected, then learns it is gone from the list.
    http.expectOne(movementsUrl('a-bcp')).flush(page(OPENING));
    await load([{ ...BCP, isArchived: true }, DOLLARS, CASH, OLD], 'a-usd');

    expect(texts('.account strong')).toEqual(['BCP Dólares', 'Efectivo']);
    expect(element.querySelector('[role="status"]')?.textContent).toBe('«BCP Sueldo» archivada. Conserva su saldo y sus movimientos, pero ya no se ofrece.');
  });
});
