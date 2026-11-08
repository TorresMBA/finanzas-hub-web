import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionStore } from '../auth/session-store';
import { toApiError } from '../errors/api-error';

const API_PREFIX = '/api/';

function isApiRequest(url: string): boolean {
  return url.startsWith(API_PREFIX);
}

/** The session travels in an HttpOnly cookie, so API calls must be sent with credentials. */
export const credentialsInterceptor: HttpInterceptorFn = (request, next) =>
  next(isApiRequest(request.url) ? request.clone({ withCredentials: true }) : request);

/** Tags each API call so a problem reported by a person can be found in the server logs and traces. */
export const correlationIdInterceptor: HttpInterceptorFn = (request, next) =>
  next(isApiRequest(request.url) ? request.clone({ setHeaders: { 'X-Correlation-Id': crypto.randomUUID() } }) : request);

/**
 * Key that makes a command safe to retry. It must be created when the form is opened, not per request:
 * a second click or an automatic retry then repeats the same key and the API applies the effect once.
 */
export const IDEMPOTENCY_KEY = new HttpContextToken<string | null>(() => null);

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export const idempotencyKeyInterceptor: HttpInterceptorFn = (request, next) => {
  const key = request.context.get(IDEMPOTENCY_KEY);
  return next(key && isApiRequest(request.url) ? request.clone({ setHeaders: { 'Idempotency-Key': key } }) : request);
};

/** Every failed API call reaches the application as an `ApiError`, never as a raw HTTP response. */
export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse && isApiRequest(request.url) ? toApiError(error) : error)),
    ),
  );

/**
 * A session can end while the page is open: the cookie expired, or the password was changed on another device.
 * The first API call that answers 401 then forgets the person and sends them to sign in, back to where they were.
 * Calls to /auth are left alone: a wrong password is their own answer, not an ended session.
 */
export const sessionExpiredInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        isApiRequest(request.url) &&
        !request.url.startsWith('/api/v1/auth/') &&
        session.isSignedIn()
      ) {
        session.expire();
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url, expired: 1 } });
      }

      return throwError(() => error);
    }),
  );
};
