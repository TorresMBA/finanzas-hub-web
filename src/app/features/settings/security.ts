import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, minLength, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/errors/api-error';
import { errorMessage } from '../../core/errors/error-messages';
import { Field } from '../../shared/ui/field';

const PASSWORD_HINT = 'Mínimo 12 caracteres, con una minúscula, un número y un símbolo.';

@Component({
  selector: 'app-settings-security',
  imports: [Field, FormField],
  template: `
    <section class="card panel">
      <h2>Cambiar contraseña</h2>
      <form class="form-stack" (submit)="$event.preventDefault(); change()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (changed()) {
          <div class="alert alert--ok" role="status">Tu contraseña cambió.</div>
        }
        <app-field label="Contraseña actual" [state]="passwordForm.currentPassword()" [serverError]="currentRejected()">
          <input class="input" type="password" autocomplete="current-password" [formField]="passwordForm.currentPassword" />
        </app-field>
        <app-field label="Contraseña nueva" [hint]="passwordHint" [state]="passwordForm.newPassword()" [serverError]="newRejected()">
          <input class="input" type="password" autocomplete="new-password" [formField]="passwordForm.newPassword" />
        </app-field>
        <button class="button button--primary" type="submit" [disabled]="busy()">Cambiar contraseña</button>
      </form>
    </section>
  `,
  styleUrl: './panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSecurity {
  private readonly http = inject(HttpClient);

  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly model = signal({ currentPassword: '', newPassword: '' });
  protected readonly passwordForm = form(this.model, (path) => {
    required(path.currentPassword, { message: 'Escribe tu contraseña actual.' });
    required(path.newPassword, { message: 'Elige una contraseña nueva.' });
    minLength(path.newPassword, 12, { message: PASSWORD_HINT });
  });
  protected readonly busy = signal(false);
  protected readonly changed = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly currentRejected = signal<string | null>(null);
  protected readonly newRejected = signal<string | null>(null);

  protected change(): void {
    void submit(this.passwordForm, async () => {
      this.busy.set(true);
      this.changed.set(false);
      this.failure.set(null);
      this.currentRejected.set(null);
      this.newRejected.set(null);
      try {
        await firstValueFrom(this.http.post('/api/v1/auth/change-password', this.model()));
        this.model.set({ currentPassword: '', newPassword: '' });
        this.passwordForm().reset();
        this.changed.set(true);
      } catch (error) {
        const code = error instanceof ApiError ? error.code : '';
        if (code === 'identity.password_incorrect') {
          this.currentRejected.set(errorMessage(error));
        } else if (code === 'identity.invalid') {
          this.newRejected.set(errorMessage(error));
        } else {
          this.failure.set(errorMessage(error));
        }
      } finally {
        this.busy.set(false);
      }
    });
  }
}
