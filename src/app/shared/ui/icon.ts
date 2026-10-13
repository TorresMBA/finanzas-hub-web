import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A Material Symbols Rounded glyph. Decorative: the control that contains it carries the accessible name. */
@Component({
  selector: 'app-icon',
  template: `{{ name() }}`,
  styles: `
    :host {
      display: inline-block;
      font-family: 'Material Symbols Rounded';
      font-weight: 400;
      font-style: normal;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      white-space: nowrap;
      direction: ltr;
      user-select: none;
      flex: none;
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[style.font-size.px]': 'size()',
    '[style.font-variation-settings]': 'variation()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(20);
  readonly filled = input(false);

  protected readonly variation = computed(() => `'FILL' ${this.filled() ? 1 : 0}`);
}
