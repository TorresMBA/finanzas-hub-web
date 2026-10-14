import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/errors/error-messages';
import { TIME_ZONES, browserTimeZone } from '../../core/workspace/time-zones';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { BrandMark } from '../../shared/ui/brand-mark';
import { Field } from '../../shared/ui/field';

const CURRENCIES = [
  { code: 'PEN', label: 'Sol peruano (S/)' },
  { code: 'USD', label: 'Dólar estadounidense (US$)' },
  { code: 'EUR', label: 'Euro (€)' },
] as const;

/** First visit to a new workspace: its owner chooses the currency of reports and the time zone. */
@Component({
  selector: 'app-onboarding',
  imports: [BrandMark, Field, FormField],
  template: `
    <main>
      <div class="brand"><app-brand-mark /><span>FinanzasHub</span></div>
      <section class="card">
        <h1>{{ workspaces.pendingSetup()?.isPersonal ? 'Configura tu espacio personal' : 'Configura «' + (workspaces.pendingSetup()?.name ?? '') + '»' }}</h1>
        <p class="lead">Dos datos antes de empezar. La moneda es la de tus reportes y presupuestos; tus cuentas pueden estar en otras.</p>
        <form class="form-stack" (submit)="$event.preventDefault(); finish()" novalidate>
          @if (failure(); as text) {
            <div class="alert" role="alert">{{ text }}</div>
          }
          <app-field label="Moneda principal" [state]="setupForm.baseCurrency()">
            <select class="input" [formField]="setupForm.baseCurrency">
              @for (currency of currencies; track currency.code) {
                <option [value]="currency.code">{{ currency.label }}</option>
              }
            </select>
          </app-field>
          <app-field label="Zona horaria" hint="Decide a qué día pertenece cada movimiento." [state]="setupForm.timeZone()">
            <select class="input" [formField]="setupForm.timeZone">
              @for (zone of timeZones; track zone) {
                <option [value]="zone">{{ zone }}</option>
              }
            </select>
          </app-field>
          <button class="button button--primary button--block" type="submit" [disabled]="busy()">
            {{ busy() ? 'Guardando…' : 'Empezar' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--bg);
      color: var(--tx);
    }
    main {
      max-width: 460px;
      margin: 0 auto;
      padding: 48px 16px 32px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 18px;
    }
    .card {
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .lead {
      margin-top: -8px;
      color: var(--mu);
      text-wrap: pretty;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Onboarding {
  private readonly router = inject(Router);
  protected readonly workspaces = inject(WorkspaceStore);

  protected readonly currencies = CURRENCIES;
  protected readonly timeZones = TIME_ZONES;
  protected readonly model = signal({ baseCurrency: 'PEN', timeZone: browserTimeZone() });
  protected readonly setupForm = form(this.model, (path) => {
    required(path.baseCurrency);
    required(path.timeZone);
  });
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected finish(): void {
    void submit(this.setupForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const { baseCurrency, timeZone } = this.model();
        await this.workspaces.completeOnboarding(baseCurrency, timeZone);
        await this.router.navigateByUrl('/');
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
