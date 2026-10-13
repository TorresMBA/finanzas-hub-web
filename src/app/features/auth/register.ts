import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FormField, email, form, maxLength, minLength, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session-store';
import { ApiError } from '../../core/errors/api-error';
import { errorMessage } from '../../core/errors/error-messages';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Field } from '../../shared/ui/field';
import { AuthPage } from './auth-page';

export const PASSWORD_HINT = 'Mínimo 12 caracteres, con una minúscula, un número y un símbolo.';

@Component({
  selector: 'app-register',
  imports: [AuthPage, Field, FormField, RouterLink],
  template: `
    <app-auth-page heading="Crea tu cuenta" [lead]="lead()">
      <form class="form-stack" (submit)="$event.preventDefault(); register()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <app-field label="Tu nombre" [state]="registerForm.displayName()">
          <input class="input" type="text" autocomplete="name" [formField]="registerForm.displayName" />
        </app-field>
        <app-field label="Correo" [state]="registerForm.email()" [serverError]="emailTaken()">
          <input class="input" type="email" autocomplete="username" [formField]="registerForm.email" />
        </app-field>
        <app-field label="Contraseña" [hint]="passwordHint" [state]="registerForm.password()" [serverError]="passwordRejected()">
          <input class="input" type="password" autocomplete="new-password" [formField]="registerForm.password" />
        </app-field>
        <button class="button button--primary button--block" type="submit" [disabled]="busy()">
          {{ busy() ? 'Creando…' : 'Crear cuenta' }}
        </button>
      </form>
      <span footer>¿Ya tienes cuenta? <a routerLink="/login" [queryParams]="loginParams()">Inicia sesión</a></span>
    </app-auth-page>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly session = inject(SessionStore);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly router = inject(Router);

  /** Token of the invitation the person came from, if any. Bound from the query string. */
  readonly invitation = input<string>();

  /** Email the invitation was sent to, to save typing it. Bound from the query string. */
  readonly invitedEmail = input<string>();

  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly model = signal({ displayName: '', email: '', password: '' });
  protected readonly registerForm = form(this.model, (path) => {
    required(path.displayName, { message: 'Escribe tu nombre.' });
    maxLength(path.displayName, 80, { message: 'Máximo 80 caracteres.' });
    required(path.email, { message: 'Escribe tu correo.' });
    email(path.email, { message: 'El correo no es válido.' });
    required(path.password, { message: 'Elige una contraseña.' });
    minLength(path.password, 12, { message: PASSWORD_HINT });
  });
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly emailTaken = signal<string | null>(null);
  protected readonly passwordRejected = signal<string | null>(null);

  constructor() {
    // The invited email arrives with the route; it fills the field unless the person already typed one.
    effect(() => {
      const invited = this.invitedEmail();
      if (invited && !untracked(this.model).email) {
        this.model.update((value) => ({ ...value, email: invited }));
      }
    });
  }

  protected lead(): string {
    return this.invitation()
      ? 'Crea tu cuenta para aceptar la invitación. También tendrás tu propio espacio personal.'
      : 'Empieza con tu espacio personal. Podrás invitar a otras personas después.';
  }

  protected loginParams(): Record<string, string> {
    const token = this.invitation();
    return token ? { returnUrl: `/invite/${token}` } : {};
  }

  protected register(): void {
    void submit(this.registerForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      this.emailTaken.set(null);
      this.passwordRejected.set(null);
      try {
        await this.session.register({ ...this.model(), invitationToken: this.invitation() ?? null });
        await this.workspaces.refresh();
        await this.router.navigateByUrl('/');
      } catch (error) {
        const code = error instanceof ApiError ? error.code : '';
        if (code === 'identity.email_taken') {
          this.emailTaken.set(errorMessage(error));
        } else if (code === 'identity.invalid') {
          this.passwordRejected.set(errorMessage(error));
        } else {
          this.failure.set(errorMessage(error));
        }
      } finally {
        this.busy.set(false);
      }
    });
  }
}
