import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from './icon';

export type TileColor = 'green' | 'blue' | 'violet' | 'amber' | 'red' | 'neutral';

/** The rounded square with an icon that identifies a category, an account or a goal across the application. */
@Component({
  selector: 'app-icon-tile',
  imports: [Icon],
  template: `<app-icon [name]="icon()" [size]="size() * 0.52" />`,
  styles: `
    :host {
      flex: none;
      display: grid;
      place-items: center;
      border-radius: 29%;
      background: var(--sf3);
      color: var(--mu);
    }
    :host([data-color='green']) {
      background: var(--acs);
      color: var(--ac);
    }
    :host([data-color='blue']) {
      background: var(--bls);
      color: var(--bl);
    }
    :host([data-color='violet']) {
      background: var(--vis);
      color: var(--vi);
    }
    :host([data-color='amber']) {
      background: var(--ams);
      color: var(--am);
    }
    :host([data-color='red']) {
      background: var(--rds);
      color: var(--rd);
    }
  `,
  host: {
    '[attr.data-color]': 'color()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconTile {
  readonly icon = input.required<string>();
  readonly color = input<TileColor>('neutral');
  readonly size = input(38);
}
