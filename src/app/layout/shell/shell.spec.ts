import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QUICK_TRANSACTION_ROUTE, routes } from '../../app.routes';
import { Account } from '../../core/api/api-types';
import { MovementsFeed } from '../../core/movements/movements-feed';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { MOBILE_MORE, MOBILE_TABS, NAV_ITEMS } from '../navigation';
import { Shell } from './shell';

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

@Component({ template: '<p class="page">Calendario</p>' })
class SomePage {}

describe('Shell quick button', () => {
  it('opens a new movement over the page that is open, and says what was saved from it', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: Shell, children: [{ path: 'calendar', component: SomePage }, QUICK_TRANSACTION_ROUTE] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSession(),
      ],
    });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    const harness = await RouterTestingHarness.create('/calendar');
    const element = harness.fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    const base = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;
    const bcp: Account = {
      id: 'a-bcp', name: 'BCP', type: 'bank', currency: 'PEN', institution: null, balance: 1500, includeInNetWorth: true, creditCard: null, isArchived: false,
      createdAt: '2026-10-01T10:00:00Z', isFavorite: false,
    };

    element.querySelector<HTMLButtonElement>('.fab')!.click();
    // The form is loaded the first time it is asked for.
    for (let tick = 0; tick < 50 && !element.querySelector('app-quick-transaction'); tick++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      harness.fixture.detectChanges();
    }
    http.expectOne(`${base}/accounts?includeArchived=true`).flush([bcp]);
    http.expectOne(`${base}/categories?includeArchived=true`).flush([]);
    http.expectOne(`${base}/exchange-rates`).flush([]);
    await harness.fixture.whenStable();

    // Over the page, which stays, and without changing the address.
    expect(element.querySelector('app-transaction-form h2')?.textContent).toBe('Nueva transacción');
    expect(element.querySelector('.page')?.textContent).toBe('Calendario');
    expect(TestBed.inject(Location).path()).toBe('/calendar');
    // Its only account is already chosen, with its balance in sight.
    expect(element.querySelector('app-transaction-form [role="combobox"] small')?.textContent).toBe('Saldo S/ 1,500.00');

    element.querySelector<HTMLButtonElement>('app-transaction-form button[aria-label="Cerrar"]')!.click();
    await harness.fixture.whenStable();
    expect(element.querySelector('app-transaction-form')).toBeNull();

    TestBed.inject(MovementsFeed).saved('Gasto de S/ 20.00 registrado.');
    await harness.fixture.whenStable();
    expect(element.querySelector('.toast--saved')?.textContent).toContain('Gasto de S/ 20.00 registrado.');
    http.verify();
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
