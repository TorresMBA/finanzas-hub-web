import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconTile, TileColor } from './icon-tile';

/** One figure of a page's summary: a label, its value and an icon. The icon is dropped on mobile to fit three in a row. */
@Component({
  selector: 'app-stat-card',
  imports: [IconTile],
  template: `
    @if (icon(); as name) {
      <app-icon-tile [icon]="name" [color]="color()" />
    }
    <div class="text">
      <div class="label">{{ label() }}</div>
      <div class="value">{{ value() }}</div>
    </div>
  `,
  styles: `
    @use 'mixins' as m;

    :host {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      padding: 14px 16px;
      background: var(--sf);
      border: 1px solid var(--bd);
      border-radius: 14px;
      box-shadow: var(--sh);
    }
    app-icon-tile {
      @include m.mobile {
        display: none;
      }
    }
    .text {
      min-width: 0;
    }
    .label {
      font-size: 12px;
      font-weight: 600;
      color: var(--mu);
      @include m.truncate;
    }
    .value {
      font-size: 20px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<string>();
  readonly color = input<TileColor>('neutral');
}
