import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Heading block of every page. Project the page's primary action into it. */
@Component({
  selector: 'app-page-header',
  template: `
    <div class="text">
      @if (eyebrow(); as text) {
        <div class="eyebrow">{{ text }}</div>
      }
      <h1>{{ title() }}</h1>
      @if (subtitle(); as text) {
        <p>{{ text }}</p>
      }
    </div>
    <ng-content />
  `,
  styles: `
    @use 'mixins' as m;

    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 22px;
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1 1 260px;
    }
    .eyebrow {
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--mu);
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.15;

      @include m.desktop {
        font-size: 26px;
      }
    }
    p {
      color: var(--mu);
      text-wrap: pretty;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly eyebrow = input<string>();
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
