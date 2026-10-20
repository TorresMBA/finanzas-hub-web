import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Account } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { HoldingForm } from './holding-form';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;

const SCOTIA: Account = {
  id: 'a-usd',
  name: 'Scotiabank Dólares',
  type: 'bank',
  currency: 'USD',
  institution: null,
  balance: 2000,
  includeInNetWorth: true,
  creditCard: null,
  isArchived: false,
  createdAt: '2026-10-01T10:00:00Z',
  isFavorite: false,
};

describe('HoldingForm', () => {
  it('registers an ETF as a broker does: units times price plus the fee, then writes down the price paid', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([idempotencyKeyInterceptor, apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideSession(),
        { provide: TODAY, useValue: () => new Date(2026, 9, 15) },
      ],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HoldingForm);
    fixture.componentRef.setInput('target', { mode: 'open' });
    fixture.componentRef.setInput('accounts', [SCOTIA]);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const type = (text: string, value: string) => {
      const input = Array.from(element.querySelectorAll<HTMLInputElement>('app-field'))
        .find((field) => field.textContent?.includes(text))!
        .querySelector('input')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };

    // First, what it is: each type says in one line what it means.
    const etf = Array.from(element.querySelectorAll<HTMLButtonElement>('.type')).find((button) =>
      button.textContent?.includes('ETF'),
    )!;
    expect(etf.textContent).toContain('Compras unidades a un precio');
    etf.click();
    await fixture.whenStable();

    // Then only what an ETF has: symbol, units, price and fee. The summary adds them up before confirming.
    type('Símbolo', 'voo');
    type('Unidades', '2.5');
    type('Precio por unidad', '500');
    type('Comisión', '1.25');
    await fixture.whenStable();
    expect(
      Array.from(element.querySelectorAll('.receipt div')).map(
        (row) => `${row.querySelector('dt')?.textContent?.trim()} ${row.querySelector('dd')?.textContent?.trim()}`,
      ),
    ).toEqual([
      '2.5 × US$ 500.00 US$ 1,250.00',
      'Comisión US$ 1.25',
      'Sale de tu cuenta US$ 1,251.25',
    ]);

    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    const opened = http.expectOne(`${BASE}/holdings`);
    expect(opened.request.body).toEqual({
      type: 'etf',
      name: 'VOO',
      ticker: 'VOO',
      institution: null,
      amount: 1251.25,
      quantity: 2.5,
      openedOn: '2026-10-15',
      fromAccountId: 'a-usd',
      annualRate: null,
      termDays: null,
    });
    opened.flush({ holding: { id: 'h-voo' }, accountId: 'a-inv', movements: [], valuations: [] });
    await new Promise((resolve) => setTimeout(resolve));

    // What each unit is worth is the price paid; the fee is what it cost on top.
    const valued = http.expectOne(`${BASE}/holdings/h-voo/valuations`);
    expect(valued.request.body).toEqual({ onDate: '2026-10-15', value: null, unitPrice: 500 });
    valued.flush({});
    http.verify();
  });
});
