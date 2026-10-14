import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { Notification, NotificationList, NotificationSettings } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { TODAY } from '../../core/period/period-store';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { toIsoDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Field } from '../../shared/ui/field';
import { IconTile, TileColor } from '../../shared/ui/icon-tile';
import { parseAmount } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { CATEGORY_LOOK, NotificationsApi } from './notifications-api';

const TIME = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' });
const DATE = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

const SEVERITY_COLOR: Readonly<Record<Notification['severity'], TileColor>> = { info: 'blue', warning: 'amber', critical: 'red' };

/**
 * The inbox of the signed-in person and how they want to be told. Both follow the person, not the workspace,
 * and nobody else reads them.
 */
@Component({
  selector: 'app-notifications',
  imports: [EmptyState, ErrorState, Field, FormField, IconTile, PageHeader, Skeleton],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Notifications {
  private readonly api = inject(NotificationsApi);
  private readonly center = inject(NotificationCenter);
  private readonly router = inject(Router);
  private readonly workspaces = inject(WorkspaceStore);
  private readonly today = inject(TODAY);

  protected readonly categoryLook = CATEGORY_LOOK;

  protected readonly unreadOnly = signal(false);
  protected readonly list = httpResource<NotificationList>(() => this.api.listUrl(this.unreadOnly()));
  protected readonly settings = httpResource<NotificationSettings>(() => this.api.settingsUrl);

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly unread = computed(() => Number(this.list.value()?.unreadCount ?? 0));

  /** Today, yesterday and everything before, each with its notices as they came: newest first. */
  protected readonly groups = computed(() => {
    const now = this.today();
    const today = toIsoDate(now);
    const yesterday = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const groups = [
      { label: 'Hoy', items: [] as { notification: Notification; when: string; color: TileColor; icon: string }[] },
      { label: 'Ayer', items: [] },
      { label: 'Anteriores', items: [] },
    ];
    for (const notification of this.list.value()?.items ?? []) {
      const created = new Date(notification.createdAt);
      const day = toIsoDate(created);
      const group = day === today ? groups[0] : day === yesterday ? groups[1] : groups[2];
      group.items.push({
        notification,
        when: group === groups[2] ? DATE.format(created).replace('.', '') : TIME.format(created),
        color: SEVERITY_COLOR[notification.severity],
        icon: CATEGORY_LOOK[notification.category].icon,
      });
    }

    return groups.filter((group) => group.items.length > 0);
  });

  protected readonly model = linkedSignal(() => {
    const settings = this.settings.value();
    const email = new Map((settings?.preferences ?? []).map((preference) => [preference.category, preference.emailEnabled]));
    return {
      emailBudget: email.get('budget') ?? true,
      emailLargeMovement: email.get('largeMovement') ?? false,
      emailBills: email.get('bills') ?? true,
      emailGoals: email.get('goals') ?? false,
      emailShared: email.get('shared') ?? false,
      quietHoursEnabled: settings?.quietHoursEnabled ?? true,
      quietFrom: (settings?.quietFrom ?? '22:00').slice(0, 5),
      quietTo: (settings?.quietTo ?? '07:00').slice(0, 5),
      largeMovementEnabled: settings ? settings.largeMovementThreshold !== null : true,
      largeMovementThreshold: settings?.largeMovementThreshold == null ? '500.00' : Number(settings.largeMovementThreshold).toFixed(2),
    };
  });
  protected readonly settingsForm = form(this.model, (path) => {
    validate(path.largeMovementThreshold, ({ value, valueOf }) =>
      !valueOf(path.largeMovementEnabled) || (parseAmount(value()) ?? 0) > 0
        ? undefined
        : { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' },
    );
  });

  constructor() {
    // A notice that arrives while the page is open shows up without the person asking.
    effect(() => {
      if (this.center.arrived() > 0) {
        this.list.reload();
      }
    });
  }

  /** Opening a notice reads it and takes the person where it points. */
  protected async open(notification: Notification): Promise<void> {
    if (!notification.isRead) {
      await this.run(() => this.api.markRead(notification.id));
    }

    if (notification.link) {
      // The inbox is of the person, the notice of one workspace: what it points to only exists there.
      const target = notification.workspaceId;
      if (target && target !== this.workspaces.current()?.id && this.workspaces.workspaces().some((workspace) => workspace.id === target)) {
        this.workspaces.select(target);
      }

      await this.router.navigateByUrl(notification.link);
    }
  }

  protected markAllRead(): Promise<void> {
    return this.run(() => this.api.markAllRead());
  }

  protected save(): void {
    void submit(this.settingsForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      this.notice.set(null);
      try {
        const model = this.model();
        await this.api.updateSettings({
          quietHoursEnabled: model.quietHoursEnabled,
          quietFrom: model.quietFrom,
          quietTo: model.quietTo,
          largeMovementThreshold: model.largeMovementEnabled ? parseAmount(model.largeMovementThreshold) : null,
          preferences: [
            { category: 'budget', emailEnabled: model.emailBudget },
            { category: 'largeMovement', emailEnabled: model.emailLargeMovement },
            { category: 'bills', emailEnabled: model.emailBills },
            { category: 'goals', emailEnabled: model.emailGoals },
            { category: 'shared', emailEnabled: model.emailShared },
          ],
        });
        this.notice.set('Preferencias guardadas.');
        this.settings.reload();
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.failure.set(null);
    try {
      await action();
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.list.reload();
      void this.center.refresh();
    }
  }
}
