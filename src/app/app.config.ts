import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import {
  apiErrorInterceptor,
  correlationIdInterceptor,
  credentialsInterceptor,
  idempotencyKeyInterceptor,
} from './core/http/api-interceptors';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withInterceptors([credentialsInterceptor, correlationIdInterceptor, idempotencyKeyInterceptor, apiErrorInterceptor]),
    ),
  ],
};
