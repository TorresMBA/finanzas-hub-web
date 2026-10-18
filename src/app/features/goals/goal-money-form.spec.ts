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
  it('spends all of what was saved by default, from an account that holds money and under an expense category', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([idempotencyKeyInterceptor, apiErrorInterceptor])), provideHttpClientTesting(), provideSession()],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GoalMoneyForm);
    fixture.componentRef.setInput('target', { goal: TRIP, kind: 'spend', accounts: [BCP, FUND], categories: [LEISURE, SALARY] });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    // Only the bank is offered to pay, and only expense categories.
    const selects = Array.from(element.querySelectorAll('select'));
    expect(Array.from(selects[0].options).map((option) => option.text)).toEqual(['Elige una cuenta', 'BCP']);
    expect(Array.from(selects[1].options).map((option) => option.text)).toEqual(['Elige una categoría', 'Suscripciones y ocio']);
    expect(element.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value).toBe('1000.00');

    selects[1].value = 'c-leisure';
    selects[1].dispatchEvent(new Event('input'));
    selects[1].dispatchEvent(new Event('change'));
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();

    const request = http.expectOne(`${BASE}/goals/g-trip/spend`);
    expect(request.request.body).toEqual({ amount: 1000, accountId: 'a-bcp', categoryId: 'c-leisure', description: null });
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    request.flush({ ...TRIP, saved: 0, mySaved: 0 });
    http.verify();
  });
});
