import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormField, email, form, maxLength, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Invitation, Member, Workspace, WorkspaceRole } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { timeZonesWith } from '../../core/workspace/time-zones';
import { SessionStore } from '../../core/auth/session-store';
import { WorkspaceStore, workspaceLabel } from '../../core/workspace/workspace-store';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Field } from '../../shared/ui/field';
import { Skeleton } from '../../shared/ui/skeleton';

const ROLE_LABELS: Readonly<Record<WorkspaceRole, string>> = { owner: 'Propietario', admin: 'Administrador', member: 'Miembro' };

/** The workspace itself: its name, who belongs to it and who has been invited. Never anyone's finances. */
@Component({
  selector: 'app-settings-workspace',
  imports: [Field, FormField, EmptyState, ErrorState, Skeleton],
  templateUrl: './workspace.html',
  styleUrl: './panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsWorkspace {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly workspaces = inject(WorkspaceStore);
  private readonly session = inject(SessionStore);
  protected readonly label = workspaceLabel;

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly workspace = this.workspaces.current;
  protected readonly isOwner = computed(() => this.workspace()?.role === 'owner');
  protected readonly timeZones = computed(() => timeZonesWith(this.workspace()?.timeZone));

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspace()?.id}`);
  protected readonly members = httpResource<Member[]>(() => (this.workspace() ? `${this.base()}/members` : undefined));
  protected readonly invitations = httpResource<Invitation[]>(() =>
    this.workspace() && this.workspaces.canAdminister() ? `${this.base()}/invitations` : undefined,
  );

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly detailsModel = signal({ name: '', timeZone: '' });
  protected readonly detailsForm = form(this.detailsModel, (path) => {
    required(path.name, { message: 'Escribe un nombre.' });
    maxLength(path.name, 80, { message: 'Máximo 80 caracteres.' });
    required(path.timeZone);
  });

  protected readonly inviteModel = signal({ email: '', role: 'member' as WorkspaceRole });

  // The link of the invitation just created. The server answers it once and does not keep it, so it lives only here.
  protected readonly lastInvite = signal<{ email: string; link: string } | null>(null);
  protected readonly copied = signal(false);

  /** The workspace the person is being asked to confirm they want to leave. */
  protected readonly leaving = signal<string | null>(null);
  protected readonly inviteForm = form(this.inviteModel, (path) => {
    required(path.email, { message: 'Escribe el correo de la persona.' });
    email(path.email, { message: 'El correo no es válido.' });
  });

  protected readonly newWorkspaceModel = signal({ name: '' });
  protected readonly newWorkspaceForm = form(this.newWorkspaceModel, (path) => {
    required(path.name, { message: 'Escribe un nombre.' });
    maxLength(path.name, 80, { message: 'Máximo 80 caracteres.' });
  });

  constructor() {
    // The form follows the selected workspace: switching it in the top bar reloads these fields.
    effect(() => {
      const workspace = this.workspace();
      untracked(() => this.detailsModel.set({ name: workspace?.name ?? '', timeZone: workspace?.timeZone ?? '' }));
    });
  }

  protected saveDetails(): void {
    void submit(this.detailsForm, () => this.run('Espacio guardado.', () => this.workspaces.update(this.detailsModel().name.trim(), this.detailsModel().timeZone)));
  }

  protected invite(): void {
    void submit(this.inviteForm, () =>
      this.run(`Invitación creada para ${this.inviteModel().email}.`, async () => {
        const invitation = await firstValueFrom(this.http.post<Invitation>(`${this.base()}/invitations`, this.inviteModel()));
        this.copied.set(false);
        this.lastInvite.set(invitation.acceptLink ? { email: invitation.email, link: invitation.acceptLink } : null);
        this.inviteModel.set({ email: '', role: 'member' });
        this.inviteForm().reset();
        this.invitations.reload();
      }),
    );
  }

  /** Puts the link on the clipboard. Where the browser does not allow it, the person still selects it in the box. */
  protected async copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  /** Shows another of the person's workspaces. What is on screen belongs to this one, so it starts from the home page. */
  protected async open(workspace: Workspace): Promise<void> {
    this.workspaces.select(workspace.id);
    await this.router.navigateByUrl(this.workspaces.needsOnboarding() ? '/onboarding' : '/');
  }

  /** Leaves a workspace the person was invited to, whichever is on screen. Their own money in it stays theirs, out of reach until they are invited back. */
  protected leaveWorkspace(workspace: Workspace): Promise<void> {
    const me = this.session.user()?.id;
    return this.run(`Saliste de «${workspaceLabel(workspace)}».`, async () => {
      await firstValueFrom(this.http.delete(`/api/v1/workspaces/${workspace.id}/members/${me}`));
      this.leaving.set(null);
      await this.workspaces.refresh();
    });
  }

  protected revoke(invitation: Invitation): Promise<void> {
    // The link on screen may be the one being revoked.
    this.lastInvite.set(null);
    return this.run('Invitación revocada.', async () => {
      await firstValueFrom(this.http.delete(`${this.base()}/invitations/${invitation.id}`));
      this.invitations.reload();
    });
  }

  protected changeRole(member: Member, role: string): Promise<void> {
    return this.run(`${member.displayName} ahora es ${ROLE_LABELS[role as WorkspaceRole].toLowerCase()}.`, async () => {
      try {
        await firstValueFrom(this.http.patch(`${this.base()}/members/${member.userId}`, { role }));
      } finally {
        // Also after a refusal, so the selector goes back to the role the member really has.
        this.members.reload();
      }
    });
  }

  protected remove(member: Member): Promise<void> {
    return this.run(`${member.displayName} ya no es miembro.`, async () => {
      await firstValueFrom(this.http.delete(`${this.base()}/members/${member.userId}`));
      this.members.reload();
    });
  }

  protected transferTo(member: Member): Promise<void> {
    return this.run(`${member.displayName} es ahora el propietario.`, async () => {
      await firstValueFrom(this.http.post(`${this.base()}/ownership-transfer`, { userId: member.userId }));
      await this.workspaces.refresh();
      this.members.reload();
    });
  }

  protected leave(member: Member): Promise<void> {
    return this.run(null, async () => {
      await firstValueFrom(this.http.delete(`${this.base()}/members/${member.userId}`));
      await this.workspaces.refresh();
      await this.router.navigateByUrl('/');
    });
  }

  protected createWorkspace(): void {
    void submit(this.newWorkspaceForm, () =>
      this.run(null, async () => {
        await this.workspaces.create(this.newWorkspaceModel().name.trim());
        this.newWorkspaceModel.set({ name: '' });
        await this.router.navigateByUrl('/onboarding');
      }),
    );
  }

  /** Whether the signed-in person may change this member's role or remove them. Mirrors the API's rules. */
  protected canManage(member: Member): boolean {
    if (member.isYou || member.role === 'owner') {
      return false;
    }

    return this.isOwner() || (this.workspaces.canAdminister() && member.role === 'member');
  }

  private async run(success: string | null, action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      await action();
      this.notice.set(success);
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
