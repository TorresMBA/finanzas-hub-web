import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Dashboard as DashboardData } from '../../core/api/api-types';
import { SessionStore } from '../../core/auth/session-store';
import { apiErrorInterceptor } from '../../core/http/api-interceptors';
import { PeriodStore, TODAY } from '../../core/period/period-store';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { AMOUNTS_HIDDEN } from '../../shared/ui/money';
import { Dashboard } from './dashboard';

const url = (month: string) => `/api/v1/workspaces/${TEST_WORKSPACE.id}/dashboard?month=${month}`;

const OCTOBER: DashboardData = {
  month: '2026-10',
  baseCurrency: 'PEN',
  netWorth: { amount: 6000, assets: 6400, debts: 400, previousAmount: 4000, change: 2000 },
  income: 4000,
  expense: 2000,
  previousIncome: 5000,
  previousExpense: 1000,
  savingsRate: 50,
  cashflow: [
    { month: '2026-05', income: 0, expense: 0 },
    { month: '2026-06', income: 0, expense: 0 },
    { month: '2026-07', income: 0, expense: 0 },
    { month: '2026-08', income: 0, expense: 0 },
    { month: '2026-09', income: 5000, expense: 1000 },
    { month: '2026-10', income: 4000, expense: 2000 },
  ],
  topCategories: [
    { categoryId: 'c-housing', name: 'Vivienda', icon: 'home', color: 'blue', amount: 1500, share: 75 },
    { categoryId: 'c-groceries', name: 'Supermercado', icon: 'shopping_cart', color: 'green', amount: 500, share: 25 },
  ],
  recentMovements: [
    {
      id: 'm-transfer', kind: 'transfer', occurredOn: '2026-10-06', description: 'Transferencia', signedAmount: -400, currency: 'PEN', accountName: 'BCP',
      counterAccountName: 'Dólares', categoryName: null, categoryIcon: null, categoryColor: null,
    },
    {
      id: 'm-wong', kind: 'expense', occurredOn: '2026-10-05', description: 'Wong', signedAmount: -400, currency: 'PEN', accountName: 'Visa',
      counterAccountName: null, categoryName: 'Supermercado', categoryIcon: 'shopping_cart', categoryColor: 'green',
    },
    {
      id: 'm-salary', kind: 'income', occurredOn: '2026-10-01', description: 'Sueldo', signedAmount: 4000, currency: 'PEN', accountName: 'BCP',
      counterAccountName: null, categoryName: 'Sueldo', categoryIcon: 'payments', categoryColor: 'green',
    },
  ],
  accounts: [
    { id: 'a-bcp', name: 'BCP', type: 'bank', currency: 'PEN', balance: 6100, isFavorite: false },
    { id: 'a-visa', name: 'Visa', type: 'creditCard', currency: 'PEN', balance: -400, isFavorite: false },
    { id: 'a-usd', name: 'Dólares', type: 'bank', currency: 'USD', balance: 75, isFavorite: false },
  ],
  budget: null,
  upcoming: [],
  goals: [],
  missingRates: [],
};
const NOTHING: DashboardData = {
  ...OCTOBER,
  netWorth: { amount: 0, assets: 0, debts: 0, previousAmount: 0, change: 0 },
  income: 0,
  expense: 0,
  previousIncome: 0,
  previousExpense: 0,
  savingsRate: null,
  cashflow: OCTOBER.cashflow.map((month) => ({ ...month, income: 0, expense: 0 })),
  topCategories: [],
  recentMovements: [],
  accounts: [],
};

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let element: HTMLElement;
  let http: HttpTestingController;
  const amountsHidden = signal(false);

  beforeEach(async () => {
    localStorage.clear();
    amountsHidden.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideSession(),
        { provide: TODAY, useValue: () => new Date(2026, 9, 13, 9) },
        { provide: AMOUNTS_HIDDEN, useValue: amountsHidden },
      ],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    await TestBed.inject(SessionStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Dashboard);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  /** Lets what a click or an answer started run and renders it; with a request waiting the application is not stable. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  async function load(data: DashboardData = OCTOBER): Promise<void> {
    http.expectOne(url('2026-10')).flush(data);
    await fixture.whenStable();
  }

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());

  /** Each figure as label, value and note; the icons are left out. */
  const kpis = () =>
    Array.from(element.querySelectorAll('.kpi')).map((kpi) =>
      ['.kpi-label', 'strong', '.kpi-note'].map((part) => kpi.querySelector(part)?.textContent?.trim()).join(' | '),
    );

  const click = async (selector: string, label: string) => {
    Array.from(element.querySelectorAll<HTMLButtonElement>(selector))
      .find((button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label)!
      .click();
    await fixture.whenStable();
  };

  it('shows placeholders while the month loads, and says so and retries when it cannot be loaded', async () => {
    expect(element.querySelectorAll('app-skeleton')).toHaveLength(3);

    http.expectOne(url('2026-10')).flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(element.querySelector('app-error-state')?.textContent).toContain('No se pudo cargar tu resumen');

    element.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await settle();
    await load();
    expect(element.querySelector('app-error-state')).toBeNull();
    expect(element.querySelector('.kpis')).not.toBeNull();
  });

  it('sends someone without accounts to create the first one', async () => {
    await load(NOTHING);

    expect(element.querySelector('app-empty-state')?.textContent).toContain('Tu resumen empieza con una cuenta');
    expect(element.querySelector('app-empty-state a')?.getAttribute('href')).toBe('/accounts');
    expect(element.querySelector('.kpis')).toBeNull();
  });

  it('greets the person and shows the figures of the month as the API computed them', async () => {
    await load();

    expect(element.querySelector('h1')?.textContent).toBe('Buenos días, Brian');
    expect(element.querySelector('.hello p')?.textContent).toBe('Este es el resumen de tu dinero del mes. Solo tú lo ves.');
    expect(element.querySelector('.eyebrow')?.textContent).toBe('wb_sunnyOctubre 2026 · Día 13 de 31');
    expect(texts('.insights li')).toEqual(['Ahorraste el 50% de tus ingresos', '18 días para cerrar el mes']);
    expect(kpis()).toEqual([
      'Patrimonio | S/ 6,000.00 | +S/ 2,000.00 vs. mes anterior',
      'Ingresos | S/ 4,000.00 | −S/ 1,000.00 vs. mes anterior',
      'Gastos | S/ 2,000.00 | +S/ 1,000.00 vs. mes anterior',
      'Tasa de ahorro | 50.0% | De lo que ingresó, lo que quedó',
    ]);
    expect(element.querySelector('.balance')?.textContent).toContain('Este mes te quedaron S/ 2,000.00 de lo que ingresaste.');
    expect(element.querySelector('.alert')).toBeNull();
  });

  it('lets the person choose and order the figures, and remembers it on this device', async () => {
    await load({ ...OCTOBER, budget: { limit: 1000, spent: 250, usedPercent: 25 } });
    expect(kpis().map((kpi) => kpi.split(' | ')[0])).toEqual(['Patrimonio', 'Ingresos', 'Gastos', 'Tasa de ahorro', 'Presupuesto']);

    await click('.customize', 'Personalizar');
    await click('.kpi-tools button', 'Quitar Patrimonio');
    await click('.kpi-tools button', 'Mover Presupuesto antes');
    await click('.kpi-add-options button', 'Gasto diario');
    await click('.customize', 'Listo');

    // Thirteen days of October gone, S/ 2,000.00 spent.
    expect(kpis()).toEqual([
      'Ingresos | S/ 4,000.00 | −S/ 1,000.00 vs. mes anterior',
      'Gastos | S/ 2,000.00 | +S/ 1,000.00 vs. mes anterior',
      'Presupuesto | 25% usado | S/ 250.00 de S/ 1,000.00',
      'Tasa de ahorro | 50.0% | De lo que ingresó, lo que quedó',
      'Gasto diario | S/ 153.85 | Promedio en 13 días',
    ]);
    expect(JSON.parse(localStorage.getItem('ph.home.kpis')!)).toEqual(['income', 'expense', 'budget', 'savings', 'daily']);
  });

  it('draws six months of income and expenses as bars against the tallest one', async () => {
    await load();

    const months = texts('.chart .month');
    expect(months).toHaveLength(6);
    expect([months[0], months[3], months[5]]).toEqual(['may', 'ago', 'oct']);
    const bars = Array.from(element.querySelectorAll<HTMLElement>('.chart li')).map((month) =>
      Array.from(month.querySelectorAll<HTMLElement>('.bar')).map((bar) => bar.style.height),
    );
    expect(bars.slice(4)).toEqual([['100%', '20%'], ['80%', '40%']]);
    expect(bars[0]).toEqual(['0%', '0%']);
    expect(element.querySelector('.chart li:last-child')?.getAttribute('aria-label')).toBe('oct: ingresos S/ 4,000.00, gastos S/ 2,000.00');
  });

  it('lists the top categories, the latest movements and the main accounts', async () => {
    await load();

    const within = (section: string, part: string) => texts(`[aria-labelledby="${section}-title"] ${part}`);
    expect(within('categories', '.share-name')).toEqual(['Vivienda', 'Supermercado']);
    expect(within('categories', '.figure')).toEqual(['S/ 1,500.00', 'S/ 500.00']);
    expect(within('categories', '.percent')).toEqual(['75%', '25%']);
    expect(within('recent', '.names')).toEqual(['Transferencia6 oct · BCP → Dólares', 'Wong5 oct · Supermercado · Visa', 'Sueldo1 oct · Sueldo · BCP']);
    // A transfer has no sign: seen from no account in particular, the money neither came nor went.
    expect(within('recent', '.figure')).toEqual(['S/ 400.00', '−S/ 400.00', '+S/ 4,000.00']);
    expect(within('accounts', '.names')).toEqual(['BCPPEN', 'VisaPEN', 'DólaresUSD']);
    expect(within('accounts', '.figure')).toEqual(['S/ 6,100.00', '−S/ 400.00', 'US$ 75.00']);
    expect(element.querySelector('[aria-labelledby="accounts-title"] .is-negative')?.textContent).toBe('−S/ 400.00');
  });

  it('hides every amount while balances are hidden, but keeps the bars of the cash flow', async () => {
    await load();
    amountsHidden.set(true);
    await fixture.whenStable();

    expect(kpis()).toEqual([
      'Patrimonio | S/ •••• | +S/ •••• vs. mes anterior',
      'Ingresos | S/ •••• | −S/ •••• vs. mes anterior',
      'Gastos | S/ •••• | +S/ •••• vs. mes anterior',
      'Tasa de ahorro | 50.0% | De lo que ingresó, lo que quedó',
    ]);
    expect(texts('.figure').every((figure) => !/[0-9]/.test(figure!))).toBe(true);
    expect(element.querySelector('.balance')?.textContent).toContain('te quedaron S/ •••• de lo que');
    expect(element.querySelector('.chart li:last-child')?.getAttribute('aria-label')).toBe('oct: ingresos S/ ••••, gastos S/ ••••');
    expect(element.querySelector<HTMLElement>('.chart li:last-child .bar')?.style.height).toBe('80%');

    amountsHidden.set(false);
    await fixture.whenStable();
    expect(kpis()[0]).toBe('Patrimonio | S/ 6,000.00 | +S/ 2,000.00 vs. mes anterior');
  });

  it('says so in a month with nothing in it instead of showing empty charts', async () => {
    await load({ ...NOTHING, accounts: OCTOBER.accounts, netWorth: OCTOBER.netWorth });

    expect(kpis()[3]).toBe('Tasa de ahorro | — | Sin ingresos este mes');
    expect(kpis()[1]).toBe('Ingresos | S/ 0.00 | Igual que el mes anterior');
    expect(element.querySelector('.chart')).toBeNull();
    expect(element.querySelector('.balance')).toBeNull();
    expect(texts('.none')).toEqual(['Todavía no hay ingresos ni gastos en estos meses.', 'Sin movimientos este mes.', 'Sin gastos este mes.']);
  });

  it('warns when a currency could not be converted', async () => {
    await load({ ...OCTOBER, missingRates: ['USD'] });

    expect(element.querySelector('.alert')?.textContent).toContain('no incluyen lo que tienes en USD');
    expect(element.querySelector('.alert a')?.getAttribute('href')).toBe('/accounts');
  });

  it('asks again when another month is chosen in the top bar', async () => {
    await load();

    TestBed.inject(PeriodStore).previous();
    await settle();

    http.expectOne(url('2026-09')).flush({ ...OCTOBER, month: '2026-09', income: 5000 });
    await fixture.whenStable();
    // A closed month has no days left to count.
    expect(element.querySelector('.eyebrow')?.textContent).toBe('wb_sunnySeptiembre 2026');
    expect(texts('.insights li')).toEqual(['Ahorraste el 50% de tus ingresos']);
    expect(kpis()[1]).toContain('S/ 5,000.00');
  });
});
