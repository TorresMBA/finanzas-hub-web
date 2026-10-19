import { TestBed } from '@angular/core/testing';
import { PrivacyStore } from './privacy-store';

describe('PrivacyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows the balances by default, hides them on toggle and remembers it on this device', () => {
    const store = TestBed.inject(PrivacyStore);
    expect(store.amountsHidden()).toBe(false);

    store.toggle();
    TestBed.tick();

    expect(store.amountsHidden()).toBe(true);
    expect(localStorage.getItem('ph.amounts-hidden')).toBe('true');
  });

  it('starts with the remembered choice', () => {
    localStorage.setItem('ph.amounts-hidden', 'true');

    expect(TestBed.inject(PrivacyStore).amountsHidden()).toBe(true);
  });
});
