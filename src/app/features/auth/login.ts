import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session-store';
import { errorMessage } from '../../core/errors/error-messages';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Field } from '../../shared/ui/field';
import { AuthPage } from './auth-page';

@Component({
  selector: 'app-login',
  imports: [AuthPage, Field, FormField, RouterLink],
  template: `
    <app-auth-page heading="Inicia sesión" lead="Tus finanzas, donde las dejaste.">
      <form class="form-stack" (submit)="$event.preventDefault(); signIn()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <app-field label="Correo" [state]="loginForm.email()">
          <input class="input" type="email" autocomplete="username" [formField]="loginForm.email" />
        </app-field>
        <app-field label="Contraseña" [state]="loginForm.password()">
          <input class="input" type="password" autocomplete="current-password" [formField]="loginForm.password" />
        </app-field>
        <button class="button button--primary button--block" type="submit" [disabled]="busy()">
          {{ busy() ? 'Entrando…' : 'Entrar' }}
        </button>
        <a class="forgot" routerLink="/forgot-password">Olvidé mi contraseña</a>
      </form>
      <span footer>¿No tienes cuenta? <a routerLink="/register">Crea una</a></span>
    </app-auth-page>
  `,
  styles: `
    .forgot {
      align-self: center;
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly session = inject(SessionStore);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly router = inject(Router);

  /** Where the person was going when they were asked to sign in. Bound from the query string. */
  readonly returnUrl = input<string>();

  protected readonly model = signal({ email: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.email, { message: 'Escribe tu correo.' });
    email(path.email, { message: 'El correo no es válido.' });
    required(path.password, { message: 'Escribe tu contraseña.' });
  });
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected signIn(): void {
    void submit(this.loginForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const { email, password } = this.model();
        await this.session.login(email, password);
        await this.workspaces.refresh();

        // Only paths inside the application: a link must not be able to send the person elsewhere.
        const target = this.returnUrl();
        await this.router.navigateByUrl(target?.startsWith('/') && !target.startsWith('//') ? target : '/');
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
