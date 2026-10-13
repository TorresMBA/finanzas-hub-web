import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../brand-mark';
import { NAV_GROUPS } from '../navigation';

/** Full sidebar on desktop; the same list collapses to an icon rail on tablet. Hidden on mobile. */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon, BrandMark],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  protected readonly groups = NAV_GROUPS;
}
