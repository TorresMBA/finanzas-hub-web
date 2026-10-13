import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormField, email, form, minLength, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/errors/api-error';
import { errorMessage } from '../../core/errors/error-messages';
import { Field } from '../../shared/ui/field';
import { AuthPage } from './auth-page';
import { PASSWORD_HINT } from './register';

@Component({
  selector: 'app-forgot-password',
  imports: [AuthPage, Field, FormField, RouterLink],
  template: `
    <app-auth-page heading="Recupera tu acceso" lead="Te enviaremos un enlace para elegir una contraseña nueva.">
      @if (sent()) {
        <div class="alert alert--ok" role="status">
          Si ese correo tiene una cuenta, en unos minutos recibirá un enlace. Revisa también la carpeta de spam.
        </div>
      } @else {
        <form class="form-stack" (submit)="$event.preventDefault(); send()" novalidate>
          @if (failure(); as text) {
            <div class="alert" role="alert">{{ text }}</div>
          }
          <app-field label="Correo" [state]="forgotForm.email()">
            <input class="input" type="email" autocomplete="username" [formField]="forgotForm.email" />
          </app-field>
          <button class="button button--primary button--block" type="submit" [disabled]="busy()">Enviar enlace</button>
        </form>
      }
      <span footer><a routerLink="/login">Volver a iniciar sesión</a></span>
    </app-auth-page>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPassword {
  private readonly http = inject(HttpClient);

  protected readonly model = signal({ email: '' });
  protected readonly forgotForm = form(this.model, (path) => {
    required(path.email, { message: 'Escribe tu correo.' });
    email(path.email, { message: 'El correo no es válido.' });
  });
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected send(): void {
    void submit(this.forgotForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        await firstValueFrom(this.http.post('/api/v1/auth/forgot-password', this.model()));
        this.sent.set(true);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}

@Component({
  selector: 'app-reset-password',
  imports: [AuthPage, Field, FormField, RouterLink],
  template: `
    <app-auth-page heading="Elige una contraseña nueva">
      @if (done()) {
        <div class="alert alert--ok" role="status">Tu contraseña cambió. Ya puedes iniciar sesión con ella.</div>
        <a class="button button--primary button--block" routerLink="/login">Iniciar sesión</a>
      } @else if (!email() || !token()) {
        <div class="alert" role="alert">Este enlace está incompleto. Pide uno nuevo.</div>
        <a class="button button--block" routerLink="/forgot-password">Pedir otro enlace</a>
      } @else {
        <form class="form-stack" (submit)="$event.preventDefault(); reset()" novalidate>
          @if (failure(); as text) {
            <div class="alert" role="alert">{{ text }}</div>
          }
          <app-field label="Contraseña nueva" [hint]="passwordHint" [state]="resetForm.newPassword()" [serverError]="rejected()">
            <input class="input" type="password" autocomplete="new-password" [formField]="resetForm.newPassword" />
          </app-field>
          <button class="button button--primary button--block" type="submit" [disabled]="busy()">Guardar contraseña</button>
        </form>
      }
    </app-auth-page>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPassword {
  private readonly http = inject(HttpClient);

  // Both come in the emailed link.
  readonly email = input<string>();
  readonly token = input<string>();

  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly model = signal({ newPassword: '' });
  protected readonly resetForm = form(this.model, (path) => {
    required(path.newPassword, { message: 'Elige una contraseña.' });
    minLength(path.newPassword, 12, { message: PASSWORD_HINT });
  });
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly rejected = signal<string | null>(null);

  protected reset(): void {
    void submit(this.resetForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      this.rejected.set(null);
      try {
        await firstValueFrom(
          this.http.post('/api/v1/auth/reset-password', { email: this.email(), token: this.token(), newPassword: this.model().newPassword }),
        );
        this.done.set(true);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'identity.invalid') {
          this.rejected.set(errorMessage(error));
        } else {
          this.failure.set(errorMessage(error));
        }
      } finally {
        this.busy.set(false);
      }
    });
  }
}

/** Landing page of the confirmation link. It confirms on arrival: there is nothing for the person to fill in. */
@Component({
  selector: 'app-confirm-email',
  imports: [AuthPage, RouterLink],
  template: `
    <app-auth-page heading="Confirmación de correo">
      @switch (state()) {
        @case ('working') {
          <p role="status">Confirmando tu correo…</p>
        }
        @case ('done') {
          <div class="alert alert--ok" role="status">Tu correo quedó confirmado.</div>
        }
        @case ('failed') {
          <div class="alert" role="alert">{{ failure() }}</div>
        }
      }
      <a class="button button--primary button--block" routerLink="/">Ir a FinanzasHub</a>
    </app-auth-page>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmEmail implements OnInit {
  private readonly http = inject(HttpClient);

  readonly userId = input<string>();
  readonly token = input<string>();

  protected readonly state = signal<'working' | 'done' | 'failed'>('working');
  protected readonly failure = signal('');

  // The inputs come from the query string and are bound before this runs.
  ngOnInit(): void {
    void this.confirm();
  }

  private async confirm(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/v1/auth/confirm-email', { userId: this.userId(), token: this.token() }));
      this.state.set('done');
    } catch (error) {
      this.failure.set(errorMessage(error));
      this.state.set('failed');
    }
  }
}
