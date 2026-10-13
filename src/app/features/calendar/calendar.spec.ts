import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CalendarItem, CalendarPeriod } from '../../core/api/api-types';
import { apiErrorInterceptor } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Calendar } from './calendar';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;
const CALENDAR_URL = `${BASE}/calendar?from=2026-10-01&to=2026-10-31`;

const item = (id: string, date: string, description: string, extra: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  date,
  kind: 'expense',
  status: 'confirmed',
  description,
  amount: 100,
  currency: 'PEN',
  accountName: 'BCP',
  ruleId: null,
  isRecurring: false,
  ...extra,
});
const OCTOBER: CalendarPeriod = {
  from: '2026-10-01',
  to: '2026-10-31',
  today: '2026-10-13',
  baseCurrency: 'PEN',
  incomeReceived: 4000,
  pendingIncome: 0,
  pendingExpenses: 380,
  projectedBalance: 2620,
  items: [
    item('op:1', '2026-10-05', 'Wong'),
    item('rule:r1:2026-10-10', '2026-10-10', 'Seguro', { status: 'pending', ruleId: 'r1', amount: 80 }),
    item('op:2', '2026-10-13', 'Sueldo', { kind: 'income', amount: 4000 }),
    item('rule:r2:2026-10-20', '2026-10-20', 'Alquiler', { status: 'scheduled', ruleId: 'r2', amount: 300, isRecurring: true }),
  ],
  missingRates: [],
};

describe('Calendar', () => {
  let fixture: ComponentFixture<Calendar>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideSession(),
        { provide: TODAY, useValue: () => new Date(2026, 9, 13) },
      ],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Calendar);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  async function load(): Promise<void> {
    http.expectOne(CALENDAR_URL).flush(OCTOBER);
    http.expectOne(`${BASE}/recurring-rules`).flush([]);
    http.expectOne(`${BASE}/accounts`).flush([]);
    http.expectOne(`${BASE}/categories`).flush([]);
    await fixture.whenStable();
  }

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());

  it('lays the month out from Monday, opens on today and registers a date that was waiting', async () => {
    await load();

    // October 2026 starts on a Thursday: three empty cells before the 1st.
    const firstWeek = Array.from(element.querySelector('.week')!.children);
    expect(firstWeek.map((cell) => cell.classList.contains('day--empty'))).toEqual([true, true, true, false, false, false, false]);
    expect(element.querySelectorAll('.day:not(.day--empty)').length).toBe(31);
    expect(texts('#day-title')).toEqual(['Martes, 13 de octubre']);
    expect(texts('.panel:first-child .items strong:first-child')).toContain('Sueldo');
    expect(texts('.panel:last-child .items .names strong')).toEqual(['Alquiler']);

    // The 10th has a date of a rule nobody settled: it can be registered from its day.
    Array.from(element.querySelectorAll<HTMLButtonElement>('.day')).find((day) => day.querySelector('.day-number')?.textContent === '10')!.click();
    await settle();
    Array.from(element.querySelectorAll<HTMLButtonElement>('.item-actions button')).find((button) => button.textContent?.trim() === 'Registrar')!.click();
    await settle();
    http.expectOne({ method: 'POST', url: `${BASE}/recurring-rules/r1/occurrences/2026-10-10/confirm` }).flush(null);
    await settle();
    http.expectOne(CALENDAR_URL).flush(OCTOBER);
    http.expectOne(`${BASE}/recurring-rules`).flush([]);
    await fixture.whenStable();
    expect(texts('[role="status"]')).toEqual(['«Seguro» registrado.']);
  });
});
