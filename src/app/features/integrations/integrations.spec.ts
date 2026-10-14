import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ImportDetail } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Integrations } from './integrations';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;

const DETAIL: ImportDetail = {
  import: {
    id: 'i-1', fileName: 'transactions_list.csv', format: 'bluecoins', status: 'review', recordCount: 3, importedCount: 0, createdAt: '2026-10-13T10:00:00Z',
    committedAt: null,
  },
  counts: { ready: 1, pending: 1, duplicates: 1, excluded: 0, invalid: 0, imported: 0 },
  accounts: [
    { id: 'm-bcp', sourceName: 'BCP', currency: 'PEN', accountId: 'a-bcp', createAs: null, recordCount: 2 },
    { id: 'm-cash', sourceName: 'Efectivo', currency: 'PEN', accountId: null, createAs: null, recordCount: 1 },
  ],
  categories: [{ id: 'c-1', isIncome: false, sourceGroup: 'Comida', sourceName: 'Restaurantes', categoryId: null, create: true, recordCount: 2 }],
  records: [
    {
      id: 'r-1', line: 2, kind: 'expense', occurredOn: '2026-10-01', amount: 42.5, currency: 'PEN', description: 'Almuerzo', sourceAccount: 'Efectivo',
      sourceCounterAccount: null, sourceCategory: 'Comida / Restaurantes', categoryId: null, state: 'needsAccount', isDuplicate: false, error: null,
    },
    {
      id: 'r-2', line: 3, kind: 'expense', occurredOn: '2026-10-02', amount: 80, currency: 'PEN', description: 'Mercado', sourceAccount: 'BCP',
      sourceCounterAccount: null, sourceCategory: 'Comida / Restaurantes', categoryId: null, state: 'duplicate', isDuplicate: true, error: null,
    },
  ],
  matchingRecords: 2,
};

describe('Integrations', () => {
  let fixture: ComponentFixture<Integrations>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([idempotencyKeyInterceptor, apiErrorInterceptor])), provideHttpClientTesting(), provideSession()],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Integrations);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  it('does not import while a line has nowhere to go, and offers to open the account the file names', async () => {
    http.expectOne(`${BASE}/imports`).flush([DETAIL.import]);
    http.expectOne(`${BASE}/categorization-rules`).flush([]);
    http.expectOne(`${BASE}/accounts`).flush([{ id: 'a-bcp', name: 'BCP', currency: 'PEN', type: 'bank', isArchived: false }]);
    http.expectOne(`${BASE}/categories`).flush([]);
    await fixture.whenStable();

    (Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Revisar') as HTMLButtonElement).click();
    TestBed.tick();
    http.expectOne(`${BASE}/imports/i-1?offset=0`).flush(DETAIL);
    await fixture.whenStable();

    const text = (selector: string) => element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const commit = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Importar 1 movimiento')) as HTMLButtonElement;
    expect(commit.disabled).toBe(true);
    expect(text('[aria-label="Resumen de la importación"]')).toContain('1 por resolver');

    // Efectivo is not one of the person's accounts: it can become one.
    const cash = element.querySelector('[aria-label="Cuenta para Efectivo"]') as HTMLSelectElement;
    expect(Array.from(cash.options).map((option) => option.textContent?.trim())).toEqual([
      'Elige una cuenta',
      'BCP · PEN',
      'Crear «Efectivo» (banco)',
      'Crear «Efectivo» (efectivo)',
      'Crear «Efectivo» (billetera)',
    ]);

    // What the ledger already has says so, and can be brought in if it is another movement.
    const lines = Array.from(element.querySelectorAll('[aria-label="Movimientos del archivo"] li')).map((line) => line.textContent?.replace(/\s+/g, ' ') ?? '');
    expect(lines[0]).toContain('Sin cuenta');
    expect(lines[1]).toContain('Ya registrado');
    expect(lines[1]).toContain('Incluir');
  });
});
