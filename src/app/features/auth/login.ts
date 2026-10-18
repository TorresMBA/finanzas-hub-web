import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session-store';
import { errorMessage } from '../../core/errors/error-messages';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { AuthPage } from './auth-page';

@Component({
  selector: 'app-login',
  imports: [AuthPage, Field, FormField, Icon, RouterLink],
  template: `
    <app-auth-page heading="Hola de nuevo" lead="Inicia sesión en tu cuenta.">
      <form class="form-stack" (submit)="$event.preventDefault(); signIn()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <app-field label="Correo electrónico" [state]="loginForm.email()">
          <span class="control">
            <app-icon name="mail" [size]="19" />
            <input class="input" type="email" autocomplete="username" placeholder="tu@correo.com" [formField]="loginForm.email" />
          </span>
        </app-field>
        <!-- The link and the eye sit over the field, not inside its label: a label holds only its control. -->
        <div class="password">
          <app-field label="Contraseña" [state]="loginForm.password()">
            <span class="control">
              <app-icon name="lock" [size]="19" />
              <input
                class="input"
                [type]="revealed() ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="Tu contraseña"
                [formField]="loginForm.password"
              />
            </span>
          </app-field>
          <a class="forgot" routerLink="/forgot-password">¿La olvidaste?</a>
          <button
            type="button"
            class="reveal"
            [attr.aria-label]="revealed() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            [attr.aria-pressed]="revealed()"
            (click)="revealed.set(!revealed())"
          >
            <app-icon [name]="revealed() ? 'visibility_off' : 'visibility'" [size]="19" />
          </button>
        </div>
        <button class="button button--primary button--block submit" type="submit" [disabled]="busy()">
          {{ busy() ? 'Ingresando…' : 'Ingresar' }}
          <app-icon [name]="busy() ? 'progress_activity' : 'arrow_forward'" [size]="19" />
        </button>
      </form>
      <span footer>¿No tienes cuenta? <a routerLink="/register">Regístrate gratis</a></span>
    </app-auth-page>
  `,
  styles: `
    .control {
      position: relative;
      display: block;

      app-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--mu);
        pointer-events: none;
      }
      .input {
        height: 48px;
        padding-left: 42px;
        border-radius: 12px;
      }
    }
    .password {
      position: relative;

      .input {
        padding-right: 48px;
      }
    }
    .forgot {
      position: absolute;
      top: 0;
      right: 0;
      font-size: 12.5px;
    }
    // Below the label (12.5px at 1.4, then 6px of gap) and centred in the 48px control.
    .reveal {
      position: absolute;
      top: 29.5px;
      right: 6px;
      width: 36px;
      height: 36px;
      border-radius: 9px;
      display: grid;
      place-items: center;
      color: var(--mu);

      &:hover {
        background: var(--sf3);
      }
    }
    .submit {
      height: 50px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 800;
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
  protected readonly revealed = signal(false);
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
