import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HoldingSummary, InvestmentSummary } from '../../core/api/api-types';
import { apiErrorInterceptor } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Investments } from './investments';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;

const holding = (overrides: Partial<HoldingSummary>): HoldingSummary => ({
  id: 'h', type: 'mutualFund', name: 'Fondo', ticker: null, institution: null, currency: 'PEN', invested: 1000, value: 1000, gain: 0, gainPercent: 0,
  weight: 0, quantity: null, openedOn: '2026-01-10', closedOn: null, maturesOn: null, annualRate: null, termDays: null, projectedValue: null,
  lastValuedOn: null, trend: Array.from({ length: 12 }, () => 1000), realized: 0, ...overrides,
});

const DEPOSIT = holding({
  id: 'h-deposit', type: 'termDeposit', name: 'Plazo fijo', institution: 'BCP', invested: 15000, value: 15200, gain: 200, gainPercent: 1.3, weight: 92.6,
  maturesOn: '2027-01-05', annualRate: 6, termDays: 360, projectedValue: 15900,
});
const ETF = holding({ id: 'h-etf', type: 'etf', name: 'Vanguard S&P 500', ticker: 'VOO', invested: 1000, value: 1200, gain: 200, gainPercent: 20, weight: 7.4, quantity: 2 });

const SUMMARY: InvestmentSummary = {
  baseCurrency: 'PEN', value: 16400, invested: 16000, gain: 400, gainPercent: 2.5,
  distribution: [{ type: 'termDeposit', value: 15200, share: 92.6 }, { type: 'etf', value: 1200, share: 7.4 }],
  holdings: [DEPOSIT, ETF], missingRates: [], closed: [],
};

describe('Investments', () => {
  let fixture: ComponentFixture<Investments>;
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
    fixture = TestBed.createComponent(Investments);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  const texts = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
  const facts = () => Array.from(element.querySelectorAll('.detail dl div')).map((row) => `${row.querySelector('dt')?.textContent?.trim()} ${row.querySelector('dd')?.textContent?.trim()}`);
  const buttons = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.actions button')).map((button) => button.textContent?.trim());

  it('shows the portfolio, a deposit with what it will be worth and, by type, the ETF that can be valued', async () => {
    http.expectOne(`${BASE}/investments/summary`).flush(SUMMARY);
    http.expectOne(`${BASE}/accounts`).flush([]);
    await settle();
    http.expectOne(`${BASE}/holdings/h-deposit`).flush({ holding: DEPOSIT, accountId: 'a', movements: [], valuations: [] });
    await fixture.whenStable();

    expect(texts('[aria-label="Tu portafolio"] li')[1]).toContain('+2.5 % sobre lo invertido');
    expect(texts('[aria-label="Distribución por tipo"] li')).toEqual(['Depósitos a plazo 92.6%', 'ETFs 7.4%']);

    // A term deposit keeps its amount and is valued by its rate: it can only be redeemed.
    expect(facts()).toContain('Valor al vencer S/ 15,900.00');
    expect(facts()).toContain('Antigüedad 9 meses');
    expect(buttons()).toEqual(['Rescatar']);

    (Array.from(element.querySelectorAll<HTMLButtonElement>('.filters button')).find((button) => button.textContent?.trim() === 'Acciones y ETFs'))!.click();
    await settle();
    http.expectOne(`${BASE}/holdings/h-etf`).flush({ holding: ETF, accountId: 'b', movements: [], valuations: [] });
    await fixture.whenStable();

    expect(texts('[aria-label="Posiciones"] .name strong')).toEqual(['Vanguard S&P 500 · VOO']);
    expect(buttons()).toEqual(['Aportar', 'Rescatar', 'Actualizar valor']);
    expect(facts()).toContain('Unidades 2');
  });
});
