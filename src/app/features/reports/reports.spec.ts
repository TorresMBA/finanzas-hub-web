import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ReportCategory, ReportSummary } from '../../core/api/api-types';
import { apiErrorInterceptor } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Reports } from './reports';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}/reports`;

const category = (name: string, amount: number, previousAmount: number, change: number | null): ReportCategory => ({
  categoryId: name, name, icon: 'sell', color: 'green', amount, share: 0, previousAmount, change,
});

const REPORT: ReportSummary = {
  period: 'month', label: '2026-10', from: '2026-10-01', to: '2026-10-31', previousFrom: '2026-09-01', previousTo: '2026-09-30', baseCurrency: 'PEN',
  current: { income: 2000, expense: 700, savings: 1300, savingsRate: 65, dailyExpense: 46.67, days: 15, goalFundedExpense: 0 },
  previous: { income: 2000, expense: 1000, savings: 1000, savingsRate: 50, dailyExpense: 33.33, days: 30, goalFundedExpense: 0 },
  categories: [
    category('Supermercado', 300, 200, 50),
    category('Transporte', 150, 150, 0),
    category('Salud', 100, 0, null),
    category('Hogar', 60, 100, -40),
    category('Ocio', 50, 50, 0),
    category('Educación', 40, 40, 0),
  ],
  merchants: [{ name: 'Wong', count: 3, amount: 160 }],
  months: [{ month: '2026-09', income: 2000, expense: 1000, savingsRate: 50 }, { month: '2026-10', income: 2000, expense: 700, savingsRate: 65 }],
  missingRates: [],
};

describe('Reports', () => {
  let fixture: ComponentFixture<Reports>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideSession(),
        { provide: TODAY, useValue: () => new Date(2026, 9, 15) },
      ],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Reports);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());

  it('compares the month with the one before, groups the small categories and downloads the same period', async () => {
    http.expectOne(`${BASE}/summary?period=month&anchor=2026-10`).flush(REPORT);
    await fixture.whenStable();

    expect(element.querySelector('.period')?.textContent).toContain('octubre 2026 frente a septiembre 2026');
    const kpis = texts('[aria-label="Cifras del periodo"] li');
    expect(kpis[1]).toContain('−30 % vs. anterior');
    expect(kpis[2]).toContain('65 % de tus ingresos');

    // Five categories and the rest: Educación goes into "Otros".
    expect(texts('[aria-label="Reparto del gasto"] li span')).toEqual(['Supermercado', 'Transporte', 'Salud', 'Hogar', 'Ocio', 'Otros']);
    // More spending is bad news, a new category says so, and less is good news.
    const changes = Array.from(element.querySelectorAll('[aria-label="Variación por categoría"] .delta')).map((node) => [node.textContent?.trim(), node.getAttribute('data-tone')]);
    expect(changes.slice(0, 4)).toEqual([['+50 %', 'bad'], ['0 %', ''], ['Nuevo', ''], ['−40 %', 'good']]);

    expect(element.querySelector<HTMLAnchorElement>('a[download]')!.getAttribute('href')).toBe(`${BASE}/export?period=month&anchor=2026-10&format=xlsx`);

    (Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Trimestre') as HTMLButtonElement).click();
    TestBed.tick();
    http.expectOne(`${BASE}/summary?period=quarter&anchor=2026-10`).flush({ ...REPORT, period: 'quarter', label: '2026-T4', from: '2026-10-01', previousFrom: '2026-07-01' });
    await fixture.whenStable();
    expect(element.querySelector('.period')?.textContent).toContain('4.º trimestre 2026 frente a 3.º trimestre 2026');
  });
});
