import { TestBed } from '@angular/core/testing';
import { ThemeStore } from './theme-store';

describe('ThemeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('is dark by default, as in the mock', () => {
    const store = TestBed.inject(ThemeStore);
    TestBed.tick();

    expect(store.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('switches the document theme and remembers the choice', () => {
    const store = TestBed.inject(ThemeStore);

    store.toggle();
    TestBed.tick();

    expect(store.isDark()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('ph.theme')).toBe('light');
  });

  it('starts with the remembered theme', () => {
    localStorage.setItem('ph.theme', 'light');

    const store = TestBed.inject(ThemeStore);

    expect(store.theme()).toBe('light');
  });
});
