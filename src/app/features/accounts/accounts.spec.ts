import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account, Transaction, TransactionPage } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Accounts } from './accounts';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;
const ACCOUNTS_URL = `${BASE}/accounts?includeArchived=true`;
const movementsUrl = (accountId: string) => `${BASE}/transactions?accountId=${accountId}&limit=6`;

const account = (id: string, name: string, balance: number, extra: Partial<Account> = {}): Account => ({
  id,
  name,
  type: 'bank',
  currency: 'PEN',
  institution: null,
  balance,
  isArchived: false,
  createdAt: '2026-10-01T10:00:00Z',
  ...extra,
});
const BCP = account('a-bcp', 'BCP Sueldo', 946.1, { institution: 'BCP' });
const DOLLARS = account('a-usd', 'BCP Dólares', 820, { currency: 'USD' });
const CASH = account('a-cash', 'Efectivo', 180.2, { type: 'cash' });
const OLD = account('a-old', 'Vieja', 50, { isArchived: true });

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
};
const page = (...items: Transaction[]): TransactionPage => ({ items, nextCursor: null, totals: [] });

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

  /** Answers the list and then the movements of the account the page selects. */
  async function load(accounts: Account[] = [BCP, DOLLARS, CASH, OLD], selected = 'a-bcp'): Promise<void> {
    http.expectOne(ACCOUNTS_URL).flush(accounts);
    await settle();
    if (accounts.some((candidate) => candidate.id === selected)) {
      http.expectOne(movementsUrl(selected)).flush(page(OPENING));
    }

    await fixture.whenStable();
  }

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
  const button = (name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.replace(/\s+/g, ' ').trim() === name)!;

  async function type(label: string, value: string): Promise<void> {
    const field = Array.from(element.querySelectorAll('app-account-form label')).find((node) => node.textContent?.includes(label))!;
    const input = field.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function submit(): Promise<void> {
    element.querySelector('app-account-form form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  it('shows placeholders while the accounts load and says so when they cannot be loaded', async () => {
    expect(element.querySelectorAll('app-skeleton')).toHaveLength(3);

    http.expectOne(ACCOUNTS_URL).flush(null, { status: 500, statusText: 'Server Error' });
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
    button('Crear una cuenta').click();
    await settle();
    expect(element.querySelector('app-account-form h2')?.textContent).toBe('Nueva cuenta');
  });

  it('groups the accounts and never adds two currencies together', async () => {
    await load();

    expect(texts('app-stat-card .label')).toEqual(['Total en soles', 'Total en dólares']);
    expect(texts('app-stat-card .value')).toEqual(['S/ 1,126.30', 'US$ 820.00']);
    expect(texts('h2')).toEqual(['Cuentas bancarias', 'Efectivo y billeteras']);
    expect(texts('.group-total')).toEqual(['S/ 946.10US$ 820.00', 'S/ 180.20']);
    expect(texts('.account .balance')).toEqual(['S/ 946.10', 'US$ 820.00', 'S/ 180.20']);
  });

  it('keeps archived accounts out of sight and out of the totals until asked', async () => {
    await load();

    button('Archivadas (1)').click();
    await settle();

    expect(texts('.account strong')).toEqual(['BCP Sueldo', 'BCP Dólares', 'Vieja', 'Efectivo']);
    expect(texts('app-stat-card .value')).toEqual(['S/ 1,126.30', 'US$ 820.00']);
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

  it('opens an account with its balance, sending a key that makes the request safe to repeat', async () => {
    await load();
    button('addNueva cuenta').click();
    await settle();

    await submit();
    expect(texts('app-account-form [role="alert"]')).toEqual(['Escribe un nombre.']);

    await type('Nombre', ' Yape ');
    button('Billetera').click();
    await type('Saldo actual', '64,5');
    await submit();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/accounts` });
    expect(request.request.body).toEqual({ name: 'Yape', type: 'wallet', currency: 'PEN', institution: null, openingBalance: 64.5 });
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

  it('refuses a balance that is not an amount before sending anything', async () => {
    await load();
    button('addNueva cuenta').click();
    await settle();
    await type('Nombre', 'Yape');
    await type('Saldo actual', '1,234.50');

    await submit();

    expect(texts('app-account-form [role="alert"]')).toEqual(['Escribe un monto con hasta dos decimales, por ejemplo 1250.50.']);
  });

  it('states the real balance of an account and reports the adjustment', async () => {
    await load();
    button('Ajustar saldo').click();
    await settle();
    expect(element.querySelector('app-account-form .note')?.textContent).toContain('S/ 946.10');

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

  it('archives an account and says what that means', async () => {
    await load();

    button('Archivar').click();
    await settle();
    http.expectOne({ method: 'POST', url: `${BASE}/accounts/a-bcp/archive` }).flush({ ...BCP, isArchived: true });
    await settle();
    // The page reloads the movements of the account that is still selected, then learns it is gone from the list.
    http.expectOne(movementsUrl('a-bcp')).flush(page(OPENING));
    await load([{ ...BCP, isArchived: true }, DOLLARS, CASH, OLD], 'a-usd');

    expect(texts('.account strong')).toEqual(['BCP Dólares', 'Efectivo']);
    expect(element.querySelector('[role="status"]')?.textContent).toBe('«BCP Sueldo» archivada. Conserva su saldo y sus movimientos, pero ya no se ofrece.');
  });
});
