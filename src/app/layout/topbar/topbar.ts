import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session-store';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { PeriodStore } from '../../core/period/period-store';
import { ThemeStore } from '../../core/theme/theme-store';
import { WorkspaceStore, workspaceLabel } from '../../core/workspace/workspace-store';
import { BrandMark } from '../../shared/ui/brand-mark';
import { Icon } from '../../shared/ui/icon';
import { Search } from '../search/search';

/**
 * Global context of the application: the workspace being shown, the selected month, the theme and who is
 * signed in, the global search and the unread notices.
 */
@Component({
  selector: 'app-topbar',
  imports: [RouterLink, Icon, BrandMark, Search],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  private readonly router = inject(Router);
  protected readonly period = inject(PeriodStore);
  protected readonly center = inject(NotificationCenter);
  protected readonly label = workspaceLabel;
  protected readonly theme = inject(ThemeStore);
  protected readonly session = inject(SessionStore);
  protected readonly workspaces = inject(WorkspaceStore);

  protected readonly initials = computed(() =>
    (this.session.user()?.displayName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join(''),
  );

  protected async switchWorkspace(workspaceId: string): Promise<void> {
    this.workspaces.select(workspaceId);

    // Back to the start: what was on screen belonged to the other workspace. A workspace that still
    // needs its setup sends its owner to the onboarding page from there.
    await this.router.navigateByUrl(this.workspaces.needsOnboarding() ? '/onboarding' : '/');
  }

  protected async signOut(): Promise<void> {
    await this.session.logout();
    this.workspaces.clear();
    await this.router.navigateByUrl('/login');
  }
}
