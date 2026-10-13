import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { provideSession } from '../../core/testing/signed-in';
import { MOBILE_MORE, MOBILE_TABS, NAV_ITEMS } from '../navigation';

describe('Shell', () => {
  let element: HTMLElement;
  let fixture: ComponentFixture<unknown>;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    localStorage.clear();
    // Same router features as app.config.ts: the placeholder page receives its inputs from route data.
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), provideSession()] });
    harness = await RouterTestingHarness.create('/');
    fixture = harness.fixture;
    element = fixture.nativeElement;
  });

  const text = (selector: string) => Array.from(element.querySelectorAll(selector)).map((node) => node.textContent?.trim());

  it('offers every section of the mock in the sidebar', () => {
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('app-sidebar a.link'));

    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual(NAV_ITEMS.map((item) => item.label));
    expect(links).toHaveLength(13);
  });

  it('marks the section being shown as the current page', () => {
    const current = element.querySelector('app-sidebar a[aria-current="page"]');

    expect(current?.getAttribute('aria-label')).toBe('Inicio');
  });

  it('shows the placeholder of the section with the phase that delivers it', async () => {
    await harness.navigateByUrl('/goals');

    const page = element.querySelector('app-feature-placeholder');
    expect(document.title).toBe('Metas · FinanzasHub');
    expect(page?.querySelector('h1')?.textContent).toBe('Metas');
    expect(page?.textContent).toContain('Llega en la fase 8');
    expect(element.querySelector('app-sidebar a[aria-current="page"]')?.getAttribute('aria-label')).toBe('Metas');
  });

  it('opens the sheet with the remaining sections from the mobile tab bar and closes it again', async () => {
    expect(text('app-mobile-tab-bar a span')).toEqual(MOBILE_TABS.map((tab) => tab.shortLabel));
    expect(element.querySelector('app-more-sheet')).toBeNull();

    element.querySelector<HTMLButtonElement>('app-mobile-tab-bar button')!.click();
    await fixture.whenStable();

    expect(text('app-more-sheet nav a span')).toEqual(MOBILE_MORE.map((item) => item.label));

    element.querySelector<HTMLButtonElement>('app-more-sheet .backdrop')!.click();
    await fixture.whenStable();

    expect(element.querySelector('app-more-sheet')).toBeNull();
  });

  it('changes the selected month from the top bar', async () => {
    const label = () => element.querySelector('app-topbar .month span')?.textContent;
    const before = label();

    element.querySelector<HTMLButtonElement>('app-topbar .month button[aria-label="Mes siguiente"]')!.click();
    await fixture.whenStable();

    expect(label()).not.toBe(before);
  });
});

describe('navigation', () => {
  it('gives every section a unique id and path', () => {
    expect(new Set(NAV_ITEMS.map((item) => item.id)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((item) => item.path)).size).toBe(NAV_ITEMS.length);
  });

  it('reaches every section on mobile, through a tab or through "Más"', () => {
    expect([...MOBILE_TABS, ...MOBILE_MORE].map((item) => item.id).sort()).toEqual(NAV_ITEMS.map((item) => item.id).sort());
  });
});
