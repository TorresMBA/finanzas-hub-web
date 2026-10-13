import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Budget, BudgetDetail, BudgetMonth } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Budgets } from './budgets';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;
const LIST_URL = `${BASE}/budgets?month=2026-10`;
const CATEGORIES_URL = `${BASE}/categories?kind=expense`;
const detailUrl = (budgetId: string) => `${BASE}/budgets/${budgetId}?month=2026-10`;

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
  movements: [{ id: 't-1', occurredOn: '2026-10-12', description: 'Rappi', accountName: 'BCP', amount: 54, currency: 'PEN' }],
  daily: [{ day: '2026-10-12', amount: 54 }],
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
  async function load(month: BudgetMonth = MONTH): Promise<void> {
    http.expectOne(LIST_URL).flush(month);
    http.expectOne(CATEGORIES_URL).flush([{ id: 'c-new', name: 'Educación', isArchived: false }]);
    await settle();
    if (month.budgets.length > 0) {
      http.expectOne(detailUrl(month.budgets[0].id)).flush(DETAIL);
    }

    await fixture.whenStable();
  }

  const text = (selector: string, within: ParentNode = element) => within.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const button = (name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.replace(/\s+/g, ' ').trim().startsWith(name))!;

  it('shows what is left of the month, each budget with its state and the detail of the selected one', async () => {
    await load();

    expect(text('.summary .headline')).toBe('S/ 522.00');
    expect(text('.summary .badge')).toBe('Día 13 de 31');
    const rows = Array.from(element.querySelectorAll('.row'));
    expect(rows.map((row) => `${text('strong', row)}: ${text('.badge', row)}`)).toEqual(['Restaurantes: Excedido', 'Supermercado: En ritmo', 'Vivienda: Pagado']);
    expect(text('.row-note', rows[1])).toContain('S/ 30.00/día');
    expect(text('.left-line')).toBe('Excediste el límite por S/ 48.00');
    expect(text('.movements li')).toContain('Rappi');

    // A filter narrows the list and the panel follows the first budget left.
    button('Fijos').click();
    await settle();
    http.expectOne(detailUrl('rent')).flush({ ...DETAIL, budget: RENT, movements: [] });
    await fixture.whenStable();
    expect(Array.from(element.querySelectorAll('.row strong')).map((node) => node.textContent)).toEqual(['Vivienda']);
    expect(text('.left-line')).toBe('Pagado completo');
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
