import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { WorkspaceStore } from '../workspace/workspace-store';
import { SessionStore } from './session-store';

// The router runs the guards of a route at the same time, not one after another. So each guard below is
// complete on its own: it loads what it needs before deciding, instead of relying on another guard having run.

/**
 * Loads the session and the workspaces. Resolves to the sign-in page when nobody is signed in.
 * Call it synchronously from a guard: it injects.
 */
function requireSession(returnUrl: string): Promise<UrlTree | null> {
  const router = inject(Router);
  const session = inject(SessionStore);
  const workspaces = inject(WorkspaceStore);
  return (async () => {
    if (!(await session.ensureLoaded())) {
      return router.createUrlTree(['/login'], { queryParams: returnUrl === '/' ? {} : { returnUrl } });
    }

    await workspaces.ensureLoaded();
    return null;
  })();
}

/**
 * The application itself: for signed-in people. Anyone else is sent to sign in and brought back afterwards,
 * and the owner of a workspace that is not set up yet is taken to set it up first.
 */
export const appGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const workspaces = inject(WorkspaceStore);
  return (await requireSession(state.url)) ?? (workspaces.needsOnboarding() ? router.createUrlTree(['/onboarding']) : true);
};

/** The onboarding page: only for the signed-in owner of a workspace that still needs it. */
export const onboardingGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const workspaces = inject(WorkspaceStore);
  return (await requireSession(state.url)) ?? (workspaces.needsOnboarding() ? true : router.createUrlTree(['/']));
};

/** Sign-in pages make no sense with a session: go to the application instead. */
export const guestGuard: CanActivateFn = async (route) => {
  // Injected before the await: afterwards there is no injection context any more.
  const router = inject(Router);
  if (!(await inject(SessionStore).ensureLoaded())) {
    return true;
  }

  // Someone already signed in who was sent here on the way somewhere, like an invitation, goes on to it.
  const returnUrl = route.queryParamMap.get('returnUrl');
  return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? router.parseUrl(returnUrl) : router.createUrlTree(['/']);
};
