import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SessionStore } from '../../core/auth/session-store';
import { ApiError } from '../../core/errors/api-error';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let element: HTMLElement;
  let navigatedTo: string | null;
  let login: (email: string, password: string) => Promise<void>;
  const attempts: [string, string][] = [];

  beforeEach(async () => {
    attempts.length = 0;
    navigatedTo = null;
    login = () => Promise.resolve();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: SessionStore,
          useValue: {
            login: (email: string, password: string) => {
              attempts.push([email, password]);
              return login(email, password);
            },
          },
        },
        { provide: WorkspaceStore, useValue: { refresh: () => Promise.resolve() } },
      ],
    });
    fixture = TestBed.createComponent(Login);
    element = fixture.nativeElement;
    const router = TestBed.inject(Router);
    router.navigateByUrl = (url) => {
      navigatedTo = url.toString();
      return Promise.resolve(true);
    };
    await fixture.whenStable();
  });

  async function fill(email: string, password: string): Promise<void> {
    const [emailInput, passwordInput] = Array.from(element.querySelectorAll('input'));
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit(): Promise<void> {
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  }

  const alerts = () => Array.from(element.querySelectorAll('[role="alert"]')).map((node) => node.textContent?.trim());

  it('asks for the email and the password before calling the API', async () => {
    await submit();

    expect(alerts()).toEqual(['Escribe tu correo.', 'Escribe tu contraseña.']);
    expect(attempts).toEqual([]);
  });

  it('rejects an email that is not one', async () => {
    await fill('not-an-email', 'whatever');
    await submit();

    expect(alerts()).toEqual(['El correo no es válido.']);
    expect(attempts).toEqual([]);
  });

  it('signs in and goes to the home page', async () => {
    await fill('brian@example.com', 'Correcta-Bateria-9');
    await submit();

    expect(attempts).toEqual([['brian@example.com', 'Correcta-Bateria-9']]);
    expect(navigatedTo).toBe('/');
  });

  it('goes back to the page the person was sent from', async () => {
    fixture.componentRef.setInput('returnUrl', '/invite/abc');
    await fill('brian@example.com', 'Correcta-Bateria-9');
    await submit();

    expect(navigatedTo).toBe('/invite/abc');
  });

  it.each(['https://evil.example', '//evil.example'])('never follows a return address outside the application (%s)', async (returnUrl) => {
    fixture.componentRef.setInput('returnUrl', returnUrl);
    await fill('brian@example.com', 'Correcta-Bateria-9');
    await submit();

    expect(navigatedTo).toBe('/');
  });

  it('explains a wrong password in plain words and stays on the page', async () => {
    login = () => Promise.reject(new ApiError(401, 'auth.invalid_credentials', 'The email or the password is not correct.', null, {}));
    await fill('brian@example.com', 'Otra-Clave-Larga-1');
    await submit();

    expect(alerts()).toEqual(['El correo o la contraseña no son correctos.']);
    expect(navigatedTo).toBeNull();
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });
});
