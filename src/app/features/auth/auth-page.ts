import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ThemeStore } from '../../core/theme/theme-store';
import { BrandMark } from '../../shared/ui/brand-mark';
import { Icon } from '../../shared/ui/icon';
import { IconTile, TileColor } from '../../shared/ui/icon-tile';

const FEATURES: readonly { icon: string; color: TileColor; title: string; text: string }[] = [
  { icon: 'account_balance_wallet', color: 'green', title: 'Control total', text: 'Todas tus cuentas en un solo lugar' },
  { icon: 'monitoring', color: 'blue', title: 'Visualiza tu progreso', text: 'Mira cómo va tu mes de un vistazo' },
  { icon: 'flag', color: 'red', title: 'Alcanza tus metas', text: 'Ahorra para lo que realmente importa' },
  { icon: 'calendar_month', color: 'amber', title: 'Planifica tu mes', text: 'Presupuestos y recordatorios' },
  { icon: 'group', color: 'violet', title: 'Juntos es mejor', text: 'Comparte gastos, viajes y más' },
  { icon: 'shield_lock', color: 'green', title: 'Tus datos, siempre tuyos', text: 'Lo tuyo solo lo ves tú' },
];

/**
 * Frame of every page a person sees without a session: the brand, the card with the form and what
 * FinanzasHub offers. The card comes first in the document, so on a phone it is the first thing seen
 * and the pitch follows; from tablet up the pitch sits on the left.
 */
@Component({
  selector: 'app-auth-page',
  imports: [BrandMark, Icon, IconTile],
  template: `
    <svg class="art" viewBox="0 0 800 800" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="auth-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="area-top" />
          <stop offset="1" class="area-bottom" />
        </linearGradient>
      </defs>
      <g class="columns">
        <rect x="250" y="500" width="40" height="300" rx="14" />
        <rect x="340" y="430" width="40" height="370" rx="14" />
        <rect x="430" y="470" width="40" height="330" rx="14" />
        <rect x="520" y="330" width="40" height="470" rx="14" />
        <rect x="610" y="250" width="40" height="550" rx="14" />
        <rect x="700" y="160" width="40" height="640" rx="14" />
      </g>
      <path d="M0 720 C 160 660, 260 600, 380 500 S 600 300, 690 250 S 780 130, 800 60 L 800 800 L 0 800 Z" fill="url(#auth-area)" />
      <path class="line" d="M0 720 C 160 660, 260 600, 380 500 S 600 300, 690 250 S 780 130, 800 60" />
    </svg>

    <header class="top">
      <div class="brand">
        <app-brand-mark />
        <span>FinanzasHub</span>
      </div>
      <button
        type="button"
        class="theme"
        [attr.aria-label]="theme.isDark() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
        (click)="theme.toggle()"
      >
        <span [class.on]="!theme.isDark()"><app-icon name="light_mode" [size]="18" /></span>
        <span [class.on]="theme.isDark()"><app-icon name="dark_mode" [size]="18" /></span>
      </button>
    </header>

    <main class="layout">
      <section class="card">
        <div class="heading">
          <h1>{{ heading() }}</h1>
          @if (lead(); as text) {
            <p class="lead">{{ text }}</p>
          }
        </div>
        <ng-content />
        <p class="switch"><ng-content select="[footer]" /></p>
      </section>

      <section class="pitch" aria-labelledby="auth-pitch">
        <span class="badge-line">Finanzas más simples, mejores decisiones</span>
        <h2 id="auth-pitch">Tu vida financiera <span>en un solo lugar</span></h2>
        <p class="pitch-lead">Gestiona, planifica y construye el futuro que quieres.</p>
        <ul class="features">
          @for (feature of features; track feature.title) {
            <li>
              <app-icon-tile [icon]="feature.icon" [color]="feature.color" [size]="40" />
              <span>
                <strong>{{ feature.title }}</strong>
                <span class="feature-text">{{ feature.text }}</span>
              </span>
            </li>
          }
        </ul>
        <p class="quote">“Pequeñas decisiones, grandes resultados.”</p>
      </section>
    </main>

    <footer class="bottom">
      <span class="motto"><strong>FinanzasHub</strong><i aria-hidden="true"></i>Tu historia financiera, un mejor mañana.</span>
      <ul>
        <li><app-icon name="verified_user" [size]="16" />Lo tuyo es privado</li>
        <li><app-icon name="group" [size]="16" />Espacios compartidos</li>
        <li><app-icon name="devices" [size]="16" />Web y móvil</li>
      </ul>
    </footer>
  `,
  styles: `
    @use 'mixins' as m;

    :host {
      position: relative;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--tx);
      background:
        radial-gradient(900px 600px at 18% 8%, color-mix(in srgb, var(--ac) 10%, transparent), transparent 70%),
        radial-gradient(800px 600px at 85% 90%, color-mix(in srgb, var(--bl) 7%, transparent), transparent 70%),
        var(--bg);
    }

    .art {
      position: absolute;
      right: 0;
      bottom: 56px;
      width: 48%;
      height: 78%;
      pointer-events: none;
    }
    .columns rect {
      fill: var(--mu);
      fill-opacity: 0.06;
    }
    .area-top {
      stop-color: var(--ac);
      stop-opacity: 0.16;
    }
    .area-bottom {
      stop-color: var(--ac);
      stop-opacity: 0;
    }
    .line {
      fill: none;
      stroke: var(--ac);
      stroke-width: 5;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
      opacity: 0.8;
    }

    .top,
    .layout,
    .bottom {
      position: relative;
      padding-inline: clamp(16px, 4vw, 48px);
    }

    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-block: 20px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .theme {
      display: flex;
      gap: 2px;
      padding: 3px;
      border-radius: 99px;
      background: var(--sf);
      border: 1px solid var(--bd);

      span {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        color: var(--mu);
      }
      .on {
        background: var(--ac);
        color: var(--onac);
      }
    }

    .layout {
      flex: 1;
      width: 100%;
      max-width: 1276px;
      margin: 0 auto;
      padding-block: 8px 40px;
      display: grid;
      gap: 40px;
      align-content: center;
      align-items: center;
    }

    .card {
      width: 100%;
      max-width: 440px;
      justify-self: center;
      padding: 32px 30px 26px;
      border-radius: 22px;
      border: 1px solid var(--bd);
      box-shadow: var(--sh);
      background: color-mix(in srgb, var(--sf) 88%, transparent);
      backdrop-filter: blur(14px);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .heading {
      display: flex;
      flex-direction: column;
      gap: 6px;
      text-align: center;
    }
    h1 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-wrap: balance;
    }
    .lead {
      font-size: 14px;
      color: var(--mu);
      text-wrap: pretty;
    }
    .switch {
      text-align: center;
      font-size: 13.5px;
      color: var(--mu);

      &:empty {
        display: none;
      }
    }

    .pitch {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 18px;
    }
    .badge-line {
      padding: 6px 14px;
      border-radius: 99px;
      border: 1px solid var(--ac);
      background: var(--acs);
      color: var(--ac);
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h2 {
      font-size: clamp(30px, 4.4vw, 54px);
      line-height: 1.05;
      font-weight: 800;
      letter-spacing: -0.035em;
      text-wrap: balance;

      span {
        display: block;
        color: var(--ac);
      }
    }
    .pitch-lead {
      font-size: 17px;
      line-height: 1.5;
      color: var(--tx2);
      max-width: 460px;
      text-wrap: pretty;
    }
    .features {
      list-style: none;
      margin: 10px 0 0;
      padding: 0;
      width: 100%;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 12px;

      li {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--sf) 82%, transparent);
        border: 1px solid var(--bd);
      }
      strong {
        display: block;
        font-size: 14px;
        font-weight: 800;
      }
    }
    .feature-text {
      display: block;
      margin-top: 2px;
      font-size: 12.5px;
      line-height: 1.4;
      color: var(--mu);
    }
    .quote {
      position: relative;
      margin-top: 10px;
      padding-bottom: 8px;
      font-family: Caveat, cursive;
      font-size: 30px;
      font-weight: 700;
      line-height: 1;

      &::after {
        content: '';
        position: absolute;
        right: 0;
        bottom: 0;
        width: 150px;
        height: 3px;
        border-radius: 3px;
        background: var(--ac);
        transform: rotate(-1.5deg);
      }
    }

    .bottom {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px 24px;
      padding-block: 16px;
      border-top: 1px solid var(--bd);
      font-size: 12.5px;
      color: var(--mu);

      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px 20px;
        font-weight: 600;
      }
      li {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      app-icon {
        color: var(--ac);
      }
    }
    .motto {
      display: flex;
      align-items: center;
      gap: 10px;

      strong {
        color: var(--tx);
      }
      i {
        width: 1px;
        height: 12px;
        background: var(--bd);
      }
    }

    // Tablet and up: the pitch on the left, the card on the right.
    @media (min-width: 900px) {
      .layout {
        grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
        gap: clamp(40px, 6vw, 96px);
      }
      .card {
        grid-column: 2;
        grid-row: 1;
        padding: 36px 34px 30px;
      }
      .pitch {
        grid-column: 1;
        grid-row: 1;
      }
    }

    // Phone: the card first and the pitch short, without the chart behind it.
    @include m.mobile {
      .art {
        display: none;
      }
      .top {
        padding-block: 14px;
      }
      .layout {
        align-content: start;
        padding-block: 4px 32px;
        gap: 32px;
      }
      .card {
        padding: 26px 20px 22px;
        border-radius: 18px;
      }
      h1 {
        font-size: 23px;
      }
      .pitch {
        gap: 14px;
      }
      .pitch-lead {
        font-size: 15px;
      }
      .features {
        margin-top: 4px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;

        li {
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
        }
        strong {
          font-size: 13px;
        }
      }
      .feature-text {
        display: none;
      }
      .quote {
        font-size: 26px;
        align-self: center;
      }
      .bottom {
        justify-content: center;
        text-align: center;

        ul {
          justify-content: center;
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  protected readonly theme = inject(ThemeStore);
  protected readonly features = FEATURES;

  readonly heading = input.required<string>();
  readonly lead = input<string>();
}
