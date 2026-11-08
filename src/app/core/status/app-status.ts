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
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly status = inject(AppStatus);

  handleError(error: unknown): void {
    console.error(error);
    if (!(error instanceof ApiError)) {
      this.status.reportUnexpected();
    }
  }
}
