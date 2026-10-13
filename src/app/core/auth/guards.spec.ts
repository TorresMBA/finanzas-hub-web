import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { Me, Workspace } from '../api/api-types';
import { TEST_USER, TEST_WORKSPACE, provideSession } from '../testing/signed-in';

describe('route guards', () => {
  async function open(url: string, user: Me | null, workspaces: Workspace[] = [TEST_WORKSPACE]): Promise<string> {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), provideSession(user, workspaces)],
    });
    await RouterTestingHarness.create(url);
    return TestBed.inject(Router).url;
  }

  const pending: Workspace = { ...TEST_WORKSPACE, status: 'pendingSetup', baseCurrency: null };

  it('sends a visitor without a session to sign in and remembers where they were going', async () => {
    expect(await open('/goals', null)).toBe('/login?returnUrl=%2Fgoals');
  });

  it('does not add a return address for the home page', async () => {
    expect(await open('/', null)).toBe('/login');
  });

  it('lets a signed-in person into the application', async () => {
    expect(await open('/goals', TEST_USER)).toBe('/goals');
  });

  it('keeps a signed-in person out of the sign-in pages', async () => {
    expect(await open('/login', TEST_USER)).toBe('/');
    TestBed.resetTestingModule();
    expect(await open('/register', TEST_USER)).toBe('/');
  });

  it('takes the owner of a workspace that is not set up to the onboarding page, whatever they asked for', async () => {
    expect(await open('/accounts', TEST_USER, [pending])).toBe('/onboarding');
  });

  it('does not ask a member to set up a workspace they do not own', async () => {
    expect(await open('/accounts', TEST_USER, [{ ...pending, role: 'member' }])).toBe('/accounts');
  });

  it('has no onboarding page for a workspace that is already set up', async () => {
    expect(await open('/onboarding', TEST_USER)).toBe('/');
  });

  it('shows an invitation link with or without a session', async () => {
    expect(await open('/invite/abc', null)).toBe('/invite/abc');
    TestBed.resetTestingModule();
    expect(await open('/invite/abc', TEST_USER)).toBe('/invite/abc');
  });
});
