import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, max, min, submit } from '@angular/forms/signals';
import { SessionStore } from '../../core/auth/session-store';
import { errorMessage } from '../../core/errors/error-messages';
import { ThemeStore } from '../../core/theme/theme-store';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Field } from '../../shared/ui/field';

type WeekStart = 'monday' | 'sunday';
type Theme = 'dark' | 'light';

@Component({
  selector: 'app-settings-preferences',
  imports: [Field, FormField],
  template: `
    <section class="card panel">
      <h2>Preferencias</h2>
      <p class="lead">Son tuyas: no cambian nada para las demás personas del espacio.</p>
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (saved()) {
          <div class="alert alert--ok" role="status">Preferencias guardadas.</div>
        }
        <div class="row">
          <app-field label="Idioma y región">
            <select class="input" [formField]="preferencesForm.locale">
              <option value="es-PE">Español (Perú)</option>
              <option value="en-US">English (US)</option>
            </select>
          </app-field>
          <app-field label="Formato de fecha">
            <select class="input" [formField]="preferencesForm.dateFormat">
              <option value="dd/MM/yyyy">31/12/2026</option>
              <option value="MM/dd/yyyy">12/31/2026</option>
              <option value="yyyy-MM-dd">2026-12-31</option>
            </select>
          </app-field>
        </div>
        <div class="row">
          <app-field label="La semana empieza el">
            <select class="input" [formField]="preferencesForm.weekStart">
              <option value="monday">Lunes</option>
              <option value="sunday">Domingo</option>
            </select>
          </app-field>
          <app-field label="Tema">
            <select class="input" [formField]="preferencesForm.theme">
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
            </select>
          </app-field>
        </div>
        <div class="row">
          <app-field label="Espacio al abrir la aplicación">
            <select class="input" [formField]="preferencesForm.defaultWorkspaceId">
              @for (workspace of workspaces.workspaces(); track workspace.id) {
                <option [value]="workspace.id">{{ workspace.name }}</option>
              }
            </select>
          </app-field>
          <app-field label="Meta de ahorro (% del ingreso)" hint="0 para no fijar una meta." [state]="preferencesForm.savingsRateTarget()">
            <input class="input" type="number" inputmode="numeric" [formField]="preferencesForm.savingsRateTarget" />
          </app-field>
        </div>
        <label class="check">
          <input type="checkbox" [formField]="preferencesForm.hideBalances" />
          <span>Ocultar los saldos hasta que yo los muestre</span>
        </label>
        <button class="button button--primary" type="submit" [disabled]="busy()">Guardar</button>
      </form>
    </section>
  `,
  styleUrl: './panel.scss',
  styles: `
    .check {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13.5px;
    }
    .check input {
      width: 18px;
      height: 18px;
      accent-color: var(--ac);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPreferences {
  private readonly session = inject(SessionStore);
  private readonly theme = inject(ThemeStore);
  protected readonly workspaces = inject(WorkspaceStore);

  protected readonly model = signal(this.initial());
  protected readonly preferencesForm = form(this.model, (path) => {
    min(path.savingsRateTarget, 0, { message: 'Entre 0 y 100.' });
    max(path.savingsRateTarget, 100, { message: 'Entre 0 y 100.' });
  });
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected save(): void {
    void submit(this.preferencesForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      this.saved.set(false);
      try {
        const value = this.model();
        await this.session.updatePreferences({
          ...value,
          defaultWorkspaceId: value.defaultWorkspaceId || null,
          savingsRateTarget: value.savingsRateTarget > 0 ? value.savingsRateTarget : null,
        });
        this.theme.set(value.theme);
        this.saved.set(true);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  private initial() {
    const preferences = this.session.user()?.preferences;
    return {
      locale: preferences?.locale ?? 'es-PE',
      dateFormat: preferences?.dateFormat ?? 'dd/MM/yyyy',
      weekStart: (preferences?.weekStart ?? 'monday') as WeekStart,
      theme: (preferences?.theme ?? this.theme.theme()) as Theme,
      hideBalances: preferences?.hideBalances ?? false,
      defaultWorkspaceId: preferences?.defaultWorkspaceId ?? this.workspaces.current()?.id ?? '',
      savingsRateTarget: Number(preferences?.savingsRateTarget ?? 0),
    };
  }
}
