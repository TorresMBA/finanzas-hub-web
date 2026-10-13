import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BrandMark } from '../../shared/ui/brand-mark';

/** Frame of every page a person sees without a session: the brand and one card. */
@Component({
  selector: 'app-auth-page',
  imports: [BrandMark],
  template: `
    <main>
      <div class="brand">
        <app-brand-mark />
        <span>FinanzasHub</span>
      </div>
      <section class="card">
        <h1>{{ heading() }}</h1>
        @if (lead(); as text) {
          <p class="lead">{{ text }}</p>
        }
        <ng-content />
      </section>
      <footer><ng-content select="[footer]" /></footer>
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
      max-width: 420px;
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
    footer {
      text-align: center;
      font-size: 13px;
      color: var(--mu);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  readonly heading = input.required<string>();
  readonly lead = input<string>();
}
