import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../errors/api-error';
import {
  IDEMPOTENCY_KEY,
  apiErrorInterceptor,
  correlationIdInterceptor,
  credentialsInterceptor,
  idempotencyKeyInterceptor,
  newIdempotencyKey,
} from './api-interceptors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('API interceptors', () => {
  let http: HttpClient;
  let server: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([credentialsInterceptor, correlationIdInterceptor, idempotencyKeyInterceptor, apiErrorInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    server = TestBed.inject(HttpTestingController);
  });

  afterEach(() => server.verify());

  it('sends API calls with the session cookie and a correlation id', () => {
    http.get('/api/v1/me').subscribe();

    const { request } = server.expectOne('/api/v1/me');
    expect(request.withCredentials).toBe(true);
    expect(request.headers.get('X-Correlation-Id')).toMatch(UUID);
  });

  it('leaves requests to other origins untouched', () => {
    http.get('https://fonts.example/css').subscribe();

    const { request } = server.expectOne('https://fonts.example/css');
    expect(request.withCredentials).toBe(false);
    expect(request.headers.has('X-Correlation-Id')).toBe(false);
  });

  it('sends the idempotency key of the form, and the same one on a retry', () => {
    const context = new HttpContext().set(IDEMPOTENCY_KEY, newIdempotencyKey());

    http.post('/api/v1/workspaces/w/transactions', {}, { context }).subscribe();
    http.post('/api/v1/workspaces/w/transactions', {}, { context }).subscribe();

    const [first, retry] = server.match('/api/v1/workspaces/w/transactions');
    expect(first.request.headers.get('Idempotency-Key')).toMatch(UUID);
    expect(retry.request.headers.get('Idempotency-Key')).toBe(first.request.headers.get('Idempotency-Key'));
  });

  it('does not invent an idempotency key for a request that did not ask for one', () => {
    http.post('/api/v1/workspaces/w/categories', {}).subscribe();

    expect(server.expectOne('/api/v1/workspaces/w/categories').request.headers.has('Idempotency-Key')).toBe(false);
  });

  it('turns a problem response into an ApiError with its code, trace id and field messages', () => {
    let failure: unknown;
    http.post('/api/v1/workspaces/w/accounts', {}).subscribe({ error: (error: unknown) => (failure = error) });

    server.expectOne('/api/v1/workspaces/w/accounts').flush(
      {
        title: 'The request is not valid.',
        detail: 'One or more fields are not valid.',
        status: 400,
        code: 'validation.failed',
        traceId: 'abc123',
        errors: { title: ['The Title field is required.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(failure).toBeInstanceOf(ApiError);
    const error = failure as ApiError;
    expect(error.status).toBe(400);
    expect(error.code).toBe('validation.failed');
    expect(error.message).toBe('One or more fields are not valid.');
    expect(error.traceId).toBe('abc123');
    expect(error.fieldErrors).toEqual({ title: ['The Title field is required.'] });
  });

  it('gives a stable code to a failure that carries no problem document', () => {
    let failure: unknown;
    http.get('/api/v1/me').subscribe({ error: (error: unknown) => (failure = error) });

    server.expectOne('/api/v1/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect((failure as ApiError).code).toBe('auth.unauthenticated');
  });
});
