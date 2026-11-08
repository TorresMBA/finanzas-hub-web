import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { NAV_GROUPS, withoutCollaboration } from '../navigation';

/** Full sidebar on desktop; the same list collapses to an icon rail on tablet. Hidden on mobile. */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon, BrandMark],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  private readonly workspaces = inject(WorkspaceStore);

  protected readonly groups = computed(() =>
    NAV_GROUPS.map((group) => ({ ...group, items: this.workspaces.allowsCollaboration() ? group.items : withoutCollaboration(group.items) })),
  );
}
