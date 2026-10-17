import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Budget, BudgetDetail, BudgetMonth, Category, CategoryTotals } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Budgets } from './budgets';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;
const LIST_URL = `${BASE}/budgets?month=2026-10`;
const CATEGORIES_URL = `${BASE}/categories?kind=expense`;
const detailUrl = (budgetId: string) => `${BASE}/budgets/${budgetId}?month=2026-10`;
const TOTALS_URL = `${BASE}/transactions/category-totals?from=2026-10-01&to=2026-10-31`;

const EDUCATION: Category = { id: 'c-new', kind: 'expense', name: 'Educación', icon: 'school', color: 'blue', isArchived: false, tags: [], subcategories: [] };
const NO_TOTALS: CategoryTotals = { baseCurrency: 'PEN', categories: [], missingRates: [] };

const budget = (id: string, name: string, limit: number, spent: number, extra: Partial<Budget> = {}): Budget => ({
  id,
  categoryId: `c-${id}`,
  categoryName: name,
  categoryIcon: 'category',
  categoryColor: 'green',
  categoryIsArchived: false,
  limit,
  currency: 'PEN',
  alertThresholdPercent: 90,
  isFixed: false,
  effectiveFrom: '2026-10-01',
  isInForce: true,
  spent,
  remaining: limit - spent,
  usedPercent: Math.round((spent / limit) * 1000) / 10,
  status: 'onTrack',
  dailyAllowance: null,
  movementCount: 0,
  ...extra,
});
const FOOD = budget('food', 'Restaurantes', 450, 498, { status: 'exceeded', movementCount: 2 });
const GROCERIES = budget('groceries', 'Supermercado', 1000, 430, { dailyAllowance: 30 });
const RENT = budget('rent', 'Vivienda', 1800, 1800, { status: 'paid', isFixed: true });

const MONTH: BudgetMonth = {
  month: '2026-10',
  baseCurrency: 'PEN',
  day: 13,
  daysInMonth: 31,
  daysLeft: 19,
  pacePercent: 41.9,
  limit: 3250,
  spent: 2728,
  remaining: 522,
  dailyAllowance: 27.47,
  budgets: [FOOD, GROCERIES, RENT],
  missingRates: [],
};
const DETAIL: BudgetDetail = {
  budget: FOOD,
  movements: [
    { id: 't-2', occurredOn: '2026-10-12', description: 'Rappi', subcategoryName: 'Delivery', accountName: 'BCP', amount: 54, currency: 'PEN' },
    { id: 't-1', occurredOn: '2026-10-05', description: 'Cumpleaños', subcategoryName: null, accountName: 'BCP', amount: 444, currency: 'PEN' },
  ],
  daily: [
    { day: '2026-10-05', amount: 444 },
    { day: '2026-10-12', amount: 54 },
  ],
};

describe('Budgets', () => {
  let fixture: ComponentFixture<Budgets>;
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
    fixture = TestBed.createComponent(Budgets);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  /** Answers the list and the categories, and then the detail of the budget the page selects. */
  async function load(month: BudgetMonth = MONTH, categories: Category[] = [EDUCATION], totals: CategoryTotals = NO_TOTALS): Promise<void> {
    http.expectOne(LIST_URL).flush(month);
    http.expectOne(CATEGORIES_URL).flush(categories);
    http.expectOne(TOTALS_URL).flush(totals);
    await settle();
    if (month.budgets.length > 0) {
      http.expectOne(detailUrl(month.budgets[0].id)).flush(DETAIL);
    }

    await fixture.whenStable();
  }

  const text = (selector: string, within: ParentNode = element) => within.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  // What a button says, without the name of its icon.
  const label = (node: Element) =>
    Array.from(node.childNodes).filter((child) => child.nodeName !== 'APP-ICON').map((child) => child.textContent).join('').replace(/\s+/g, ' ').trim();
  const button = (name: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((node) => label(node).startsWith(name))!;

  it('shows what is left of the month, how it is going, each budget with its state and the detail of the selected one', async () => {
    await load();

    expect(text('.month-figure strong')).toBe('S/ 522.00');
    expect(text('.month-figure span')).toBe('de S/ 3,250.00 · gastaste S/ 2,728.00 (84%)');
    expect(text('.when span')).toBe('Día 13 de 31 · quedan 19 días');
    // The rent is paid, so only the two variable budgets run against the pace: 41.9% of 1,450 plus the 1,800 paid.
    expect(text('.month .note strong')).toBe('Vas S/ 320.45 por encima del ritmo ideal');
    expect(text('.month .note')).toContain('gasta como máximo S/ 27.47 por día');
    expect(Array.from(element.querySelectorAll('.month .figures dd.tabular')).map((node) => node.textContent?.trim())).toEqual([
      'S/ 3,250.00', 'S/ 0.00', 'S/ 522.00', 'S/ 27.47',
    ]);

    const rows = Array.from(element.querySelectorAll('.budget'));
    expect(rows.map((row) => `${text('.row-name', row)}: ${text('.chip', row)}`)).toEqual(['Restaurantes: Excedido', 'Supermercado: En ritmo', 'Vivienda: Pagado']);
    expect(rows.map((row) => text('.message', row))).toEqual(['111% usado · S/ 48.00 sobre el límite', 'Te quedan S/ 570.00', 'Todo pagado este mes']);

    const panel = element.querySelector('app-budget-detail')!;
    expect(text('h2', panel)).toBe('Restaurantes');
    expect(text('.note span', panel)).toBe('Superaste el límite el 12 oct, con 18 días aún por delante. El mayor gasto fue el 5 oct (S/ 444.00).');
    expect(Array.from(panel.querySelectorAll('.movements li')).map((node) => text('.lead', node))).toEqual(['Delivery · BCP', 'BCP']);

    // The panel offers to raise the limit to cover what was spent, keeping the rest of the budget.
    button('Subir límite a S/ 500.00').click();
    const request = http.expectOne({ method: 'PATCH', url: `${BASE}/budgets/food` });
    expect(request.request.body).toEqual({ amount: 500, alertThresholdPercent: 90, isFixed: false });
    request.flush({ ...FOOD, limit: 500 });
    await settle();
    http.expectOne(LIST_URL).flush(MONTH);
    await fixture.whenStable();
    expect(text('[role="status"].alert')).toBe('«Restaurantes» ahora tiene un límite de S/ 500.00 al mes.');

    // A filter narrows the list and the panel follows the first budget left.
    button('Fijos').click();
    await settle();
    http.expectOne(detailUrl('rent')).flush({ ...DETAIL, budget: RENT, movements: [], daily: [] });
    await fixture.whenStable();
    expect(Array.from(element.querySelectorAll('.row-name')).map((node) => node.textContent)).toEqual(['Vivienda']);
    expect(text('app-budget-detail .note span')).toBe('Todos los pagos fijos del mes están registrados.');
  });

  it('folds the subcategories of a budget, each with what it spent this month, and what went on the category itself apart', async () => {
    const groceries: Category = {
      ...EDUCATION, id: 'c-groceries', name: 'Supermercado',
      subcategories: [{ id: 's-pantry', name: 'Despensa', isArchived: false }, { id: 's-cleaning', name: 'Limpieza', isArchived: false }],
    };
    // 430 of Supermercado: 300 in Despensa, 100 on the category itself and nothing in Limpieza.
    await load(MONTH, [groceries], {
      ...NO_TOTALS,
      categories: [{ categoryId: 's-pantry', amount: 300, count: 4 }, { categoryId: 'c-groceries', amount: 130, count: 1 }],
    });

    // Only a budget with subcategories offers them.
    const toggles = Array.from(element.querySelectorAll<HTMLButtonElement>('.parts-toggle'));
    expect(toggles).toHaveLength(1);
    expect(toggles[0].textContent).toContain('Ver 3 subcategorías');
    expect(element.querySelector('.parts')).toBeNull();

    toggles[0].click();
    await settle();
    const parts = Array.from(element.querySelectorAll('.parts li')).map((node) => `${text('.part-name', node)} ${text('.part-line strong', node)}`);
    expect(parts).toEqual(['Despensa S/ 300.00', 'Sin subcategoría S/ 130.00', 'Limpieza S/ 0.00']);
    expect(element.querySelector('.parts-toggle')!.getAttribute('aria-expanded')).toBe('true');

    expect(toggles[0].textContent).toContain('Ocultar 3 subcategorías');
    toggles[0].click();
    await settle();
    expect(element.querySelector('.parts')).toBeNull();
  });

  it('creates a budget for a category that has none and reloads the month', async () => {
    await load({ ...MONTH, budgets: [], limit: 0, spent: 0, remaining: 0, dailyAllowance: null });
    expect(element.querySelector('app-empty-state')).not.toBeNull();

    button('Crear un presupuesto').click();
    await settle();
    const amount = element.querySelector<HTMLInputElement>('app-budget-form input[type="text"]')!;
    amount.value = '450';
    amount.dispatchEvent(new Event('input'));
    await settle();
    element.querySelector('app-budget-form form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/budgets` });
    expect(request.request.body).toEqual({ categoryId: 'c-new', amount: 450, alertThresholdPercent: 90, isFixed: false });
    request.flush(budget('new', 'Educación', 450, 0));
    await settle();
    http.expectOne(LIST_URL).flush(MONTH);
    await settle();
    http.expectOne(detailUrl('food')).flush(DETAIL);
    await fixture.whenStable();
    expect(text('[role="status"]')).toBe('Presupuesto de S/ 450.00 al mes para «Educación» creado.');
  });
});
