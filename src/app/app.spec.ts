import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
  });

  it('applies the theme to the document as soon as it starts', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
