import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PeriodStore } from '../../core/period/period-store';
import { ThemeStore } from '../../core/theme/theme-store';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../brand-mark';

/**
 * Global context of the application: the selected month and the theme. The workspace switcher, the
 * search box and the unread badge of the mock are added with the modules that give them data.
 */
@Component({
  selector: 'app-topbar',
  imports: [RouterLink, Icon, BrandMark],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  protected readonly period = inject(PeriodStore);
  protected readonly theme = inject(ThemeStore);
}
