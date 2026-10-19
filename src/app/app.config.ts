import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import {
  apiErrorInterceptor,
  correlationIdInterceptor,
  credentialsInterceptor,
  idempotencyKeyInterceptor,
} from './core/http/api-interceptors';
import { PrivacyStore } from './core/privacy/privacy-store';
import { AMOUNTS_HIDDEN } from './shared/ui/money';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, correlationIdInterceptor, idempotencyKeyInterceptor, apiErrorInterceptor]),
    ),
    { provide: AMOUNTS_HIDDEN, useFactory: () => inject(PrivacyStore).amountsHidden },
  ],
};
