import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Placeholder with the shape of the content while it loads. */
@Component({
  selector: 'app-skeleton',
  template: ``,
  styles: `
    :host {
      display: block;
      border-radius: 8px;
      background: linear-gradient(90deg, var(--sf2) 25%, var(--sf3) 37%, var(--sf2) 63%);
      background-size: 400% 100%;
      animation: shimmer 1.4s ease infinite;
    }
    @keyframes shimmer {
      from {
        background-position: 100% 50%;
      }
      to {
        background-position: 0 50%;
      }
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  readonly width = input('100%');
  readonly height = input('16px');
}
