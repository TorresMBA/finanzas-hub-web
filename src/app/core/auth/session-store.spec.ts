import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../errors/api-error';
import { apiErrorInterceptor } from '../http/api-interceptors';
import { TEST_USER } from '../testing/signed-in';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  let store: SessionStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiErrorInterceptor])), provideHttpClientTesting()],
    });
    store = TestBed.inject(SessionStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const unauthorized = { status: 401, statusText: 'Unauthorized' };

  it('asks the API who is signed in only once', async () => {
    const first = store.ensureLoaded();
    const second = store.ensureLoaded();
    http.expectOne('/api/v1/me').flush(TEST_USER);

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(store.user()?.displayName).toBe('Brian Quispe');
    expect(store.isSignedIn()).toBe(true);
  });

  it('treats a 401 as "nobody is signed in", not as an error', async () => {
    const loaded = store.ensureLoaded();
    http.expectOne('/api/v1/me').flush({ code: 'auth.unauthenticated' }, unauthorized);

    expect(await loaded).toBe(false);
    expect(store.user()).toBeNull();
  });

  it('lets any other failure through and asks again next time', async () => {
    const loaded = store.ensureLoaded();
    http.expectOne('/api/v1/me').flush({ code: 'unexpected' }, { status: 500, statusText: 'Server Error' });
    await expect(loaded).rejects.toBeInstanceOf(ApiError);

    const retried = store.ensureLoaded();
    http.expectOne('/api/v1/me').flush(TEST_USER);
    expect(await retried).toBe(true);
  });

  it('signs in and then loads the account', async () => {
    const signingIn = store.login('brian@example.com', 'secret');
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.body).toEqual({ email: 'brian@example.com', password: 'secret' });
    login.flush({ userId: TEST_USER.id });
    await Promise.resolve();
    http.expectOne('/api/v1/me').flush(TEST_USER);
    await signingIn;

    expect(store.isSignedIn()).toBe(true);
    expect(await store.ensureLoaded()).toBe(true);
  });

  it('keeps nobody signed in when the password is wrong', async () => {
    const signingIn = store.login('brian@example.com', 'wrong');
    http.expectOne('/api/v1/auth/login').flush({ code: 'auth.invalid_credentials' }, unauthorized);

    await expect(signingIn).rejects.toMatchObject({ code: 'auth.invalid_credentials' });
    expect(store.isSignedIn()).toBe(false);
  });

  it('forgets the account when the session ends', async () => {
    const loaded = store.ensureLoaded();
    http.expectOne('/api/v1/me').flush(TEST_USER);
    await loaded;

    const signingOut = store.logout();
    http.expectOne('/api/v1/auth/logout').flush(null);
    await signingOut;

    expect(store.user()).toBeNull();
    expect(await store.ensureLoaded()).toBe(false);
  });
});
