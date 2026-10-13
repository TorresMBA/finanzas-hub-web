import { TestBed } from '@angular/core/testing';
import { PeriodStore, TODAY } from './period-store';

function storeOn(today: Date): PeriodStore {
  TestBed.configureTestingModule({ providers: [{ provide: TODAY, useValue: () => today }] });
  return TestBed.inject(PeriodStore);
}

describe('PeriodStore', () => {
  it('starts on the current month, labelled as in the top bar', () => {
    const store = storeOn(new Date(2026, 9, 12));

    expect(store.label()).toBe('Octubre 2026');
    expect(store.isoMonth()).toBe('2026-10');
    expect(store.isCurrent()).toBe(true);
  });

  it('moves forward across the end of the year', () => {
    const store = storeOn(new Date(2026, 11, 31));

    store.next();

    expect(store.month()).toEqual({ year: 2027, month: 1 });
    expect(store.label()).toBe('Enero 2027');
    expect(store.isCurrent()).toBe(false);
  });

  it('moves backward across the start of the year', () => {
    const store = storeOn(new Date(2026, 0, 1));

    store.previous();

    expect(store.isoMonth()).toBe('2025-12');
  });

  it('returns to the current month', () => {
    const store = storeOn(new Date(2026, 9, 12));
    store.previous();
    store.previous();

    store.goToCurrent();

    expect(store.isoMonth()).toBe('2026-10');
  });
});
