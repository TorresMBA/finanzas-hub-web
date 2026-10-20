import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Account, Category, Goal } from '../../core/api/api-types';
import { apiErrorInterceptor, idempotencyKeyInterceptor } from '../../core/http/api-interceptors';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { GoalMoneyForm } from './goal-money-form';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;

const TRIP: Goal = {
  id: 'g-trip', name: 'Viaje Cusco', targetAmount: 1000, currency: 'PEN', targetDate: null, status: 'active', isShared: false, isOwner: true,
  saved: 1000, mySaved: 1000, remaining: 0, percent: 100, requiredMonthly: null, averageMonthly: 500, health: 'completed', participants: [],
  myFundAccountId: 'a-fund',
};
const BCP: Account = {
  id: 'a-bcp', name: 'BCP', type: 'bank', currency: 'PEN', institution: null, balance: 1000, includeInNetWorth: true, creditCard: null, isArchived: false,
  createdAt: '2026-10-01T10:00:00Z',
  isFavorite: false,
};
const FUND: Account = { ...BCP, id: 'a-fund', name: 'Meta: Viaje Cusco', type: 'goalFund' };
const LEISURE: Category = {
  id: 'c-leisure', kind: 'expense', name: 'Suscripciones y ocio', icon: 'movie', color: 'violet', isArchived: false, tags: [], subcategories: [],
};
const SALARY: Category = { ...LEISURE, id: 'c-salary', kind: 'income', name: 'Sueldo', subcategories: [] };

describe('GoalMoneyForm', () => {
  it('spends all of what was saved by default, from an account that holds money and under an expense category, with live balances', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([idempotencyKeyInterceptor, apiErrorInterceptor])), provideHttpClientTesting(), provideSession()],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GoalMoneyForm);
    fixture.componentRef.setInput('target', { goal: TRIP, kind: 'spend', categories: [LEISURE, SALARY] });
    fixture.componentRef.setInput('accounts', [BCP, FUND]);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    // Only the bank is offered to pay, already chosen with its balance, and only expense categories.
    expect(element.querySelector('[role="combobox"] strong')?.textContent).toBe('BCP');
    expect(element.querySelector('[role="combobox"] small')?.textContent).toBe('Saldo S/ 1,000.00');
    const selects = Array.from(element.querySelectorAll('select'));
    expect(Array.from(selects[0].options).map((option) => option.text)).toEqual(['Elige una categoría', 'Suscripciones y ocio']);
    const amount = element.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    expect(amount.value).toBe('1000.00');

    // The balances arrive again while the dialog is open: the new one shows, and what was typed stays.
    amount.value = '600';
    amount.dispatchEvent(new Event('input'));
    fixture.componentRef.setInput('accounts', [{ ...BCP, balance: 750 }, FUND]);
    await fixture.whenStable();
    expect(element.querySelector('[role="combobox"] small')?.textContent).toBe('Saldo S/ 750.00');
    expect(amount.value).toBe('600');

    selects[0].value = 'c-leisure';
    selects[0].dispatchEvent(new Event('input'));
    selects[0].dispatchEvent(new Event('change'));
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();

    const request = http.expectOne(`${BASE}/goals/g-trip/spend`);
    expect(request.request.body).toEqual({ amount: 600, accountId: 'a-bcp', categoryId: 'c-leisure', description: null });
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    request.flush({ ...TRIP, saved: 0, mySaved: 0 });
    http.verify();
  });
});
