import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength, pattern, required, submit } from '@angular/forms/signals';
import { SessionStore } from '../../core/auth/session-store';
import { errorMessage } from '../../core/errors/error-messages';
import { Field } from '../../shared/ui/field';

@Component({
  selector: 'app-settings-profile',
  imports: [Field, FormField],
  template: `
    <section class="card panel">
      <h2>Perfil</h2>
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (saved()) {
          <div class="alert alert--ok" role="status">Perfil guardado.</div>
        }
        <app-field label="Nombre" hint="Así te ven las personas con las que compartes." [state]="profileForm.displayName()">
          <input class="input" type="text" autocomplete="name" [formField]="profileForm.displayName" />
        </app-field>
        <app-field label="Celular" hint="Opcional. Con código de país, por ejemplo +51 999 111 222." [state]="profileForm.phone()">
          <input class="input" type="tel" autocomplete="tel" [formField]="profileForm.phone" />
        </app-field>
        <div class="readonly">
          <span class="label">Correo</span>
          <span>{{ session.user()?.email }}</span>
          <span class="badge" [class.badge--accent]="session.user()?.emailConfirmed" [class.badge--warn]="!session.user()?.emailConfirmed">
            {{ session.user()?.emailConfirmed ? 'Confirmado' : 'Sin confirmar' }}
          </span>
        </div>
        <button class="button button--primary" type="submit" [disabled]="busy()">Guardar</button>
      </form>
    </section>
  `,
  styleUrl: './panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsProfile {
  protected readonly session = inject(SessionStore);

  protected readonly model = signal({
    displayName: this.session.user()?.displayName ?? '',
    phone: this.session.user()?.phone ?? '',
  });
  protected readonly profileForm = form(this.model, (path) => {
    required(path.displayName, { message: 'Escribe tu nombre.' });
    maxLength(path.displayName, 80, { message: 'Máximo 80 caracteres.' });
    maxLength(path.phone, 20, { message: 'Máximo 20 caracteres.' });
    pattern(path.phone, /^[0-9+\- ]*$/, { message: 'Solo dígitos, espacios, «+» y «-».' });
  });
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected save(): void {
    void submit(this.profileForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      this.saved.set(false);
      try {
        const { displayName, phone } = this.model();
        await this.session.updateProfile(displayName.trim(), phone.trim());
        this.saved.set(true);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
