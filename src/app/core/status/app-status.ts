import { DOCUMENT } from '@angular/common';
import { ErrorHandler, Injectable, inject, signal } from '@angular/core';
import { ApiError } from '../errors/api-error';

/**
 * What the frame tells the person about the application itself: that the network is gone, or that something
 * failed that no screen handled. Views still show their own error states; this is the last resort.
 */
@Injectable({ providedIn: 'root' })
export class AppStatus {
  private readonly window = inject(DOCUMENT).defaultView;

  readonly online = signal(this.window?.navigator.onLine ?? true);
  readonly failure = signal<string | null>(null);

  constructor() {
    this.window?.addEventListener('online', () => this.online.set(true));
    this.window?.addEventListener('offline', () => this.online.set(false));
  }

  reportUnexpected(): void {
    this.failure.set('Algo salió mal. Si vuelve a pasar, recarga la página.');
  }

  dismiss(): void {
    this.failure.set(null);
  }
}

/**
 * Errors nobody caught. They are logged as before, and the person hears about them instead of meeting a page that
 * silently stopped working. A failed API call is not one of them: the view that made it shows its own error state.
 * It also arrives wrapped: reading the value of a resource whose request failed throws Angular's ResourceValueError,
 * with the ApiError as its cause, so the whole chain of causes is looked at.
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly status = inject(AppStatus);

  handleError(error: unknown): void {
    console.error(error);
    if (!comesFromTheApi(error) && !isNoise(error)) {
      this.status.reportUnexpected();
    }
  }
}

function causes(error: unknown): unknown[] {
  const chain: unknown[] = [];
  for (let current = error; current && chain.length < 5; current = (current as { cause?: unknown }).cause) {
    chain.push(current);
  }

  return chain;
}

function comesFromTheApi(error: unknown): boolean {
  return causes(error).some((current) => current instanceof ApiError);
}

/**
 * What the window reports that is not a failure of this application:
 * - an error event that carries no error, like "ResizeObserver loop completed with undelivered notifications" (the
 *   browser's own warning, harmless) or the "Script error." of a script from another origin. Angular wraps it in an
 *   Error with the event as its cause;
 * - an error thrown by a browser extension, whose code runs in the page and reports to the same window.
 */
function isNoise(error: unknown): boolean {
  return causes(error).some(
    (current) =>
      (typeof ErrorEvent !== 'undefined' && current instanceof ErrorEvent && !current.error) ||
      (current instanceof Error && /\b(?:chrome|moz|safari-web)-extension:\/\//.test(current.stack ?? '')),
  );
}
