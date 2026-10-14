import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AcceptedInvitation, InvitationPreview } from '../../core/api/api-types';
import { SessionStore } from '../../core/auth/session-store';
import { errorMessage } from '../../core/errors/error-messages';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { AuthPage } from './auth-page';

const ROLE_LABELS = { member: 'miembro', admin: 'administrador', owner: 'propietario' } as const;

/**
 * Landing page of an invitation link. It shows what the invitation offers to anyone holding the link,
 * and lets them accept it with the account it was sent to, creating that account if needed.
 */
@Component({
  selector: 'app-invite',
  imports: [AuthPage, RouterLink],
  template: `
    <app-auth-page heading="Invitación">
      @if (preview.isLoading() || !sessionChecked()) {
        <p role="status">Buscando la invitación…</p>
      } @else if (preview.error()) {
        <div class="alert" role="alert">No encontramos esta invitación. Pide a quien te invitó que te envíe otra.</div>
      } @else if (preview.value(); as invitation) {
        <p>
          <strong>{{ invitation.invitedBy ?? 'Alguien' }}</strong> te invitó a unirte a
          <strong>{{ invitation.workspaceName }}</strong> como {{ roleLabel() }}.
        </p>
        <p class="note">
          Unirte no da acceso a tus finanzas personales a nadie: solo se comparte lo que decidas compartir.
        </p>

        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }

        @if (!invitation.available) {
          <div class="alert" role="alert">Esta invitación caducó, fue revocada o ya se usó.</div>
        } @else if (!session.isSignedIn()) {
          <a class="button button--primary button--block" routerLink="/register" [queryParams]="{ invitation: token(), invitedEmail: invitation.email }">
            Crear mi cuenta y unirme
          </a>
          <a class="button button--block" routerLink="/login" [queryParams]="{ returnUrl: '/invite/' + token() }">Ya tengo cuenta</a>
        } @else if (wrongAccount()) {
          <div class="alert alert--info" role="status">
            La invitación se envió a {{ invitation.email }} y has iniciado sesión como {{ session.user()?.email }}.
          </div>
          <button class="button button--block" type="button" (click)="switchAccount()">Cambiar de cuenta</button>
        } @else {
          <button class="button button--primary button--block" type="button" [disabled]="busy()" (click)="accept()">
            {{ busy() ? 'Uniéndote…' : 'Unirme a ' + invitation.workspaceName }}
          </button>
        }
      }
    </app-auth-page>
  `,
  styles: `
    .note {
      font-size: 13px;
      color: var(--mu);
      text-wrap: pretty;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Invite {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly workspaces = inject(WorkspaceStore);
  protected readonly session = inject(SessionStore);

  /** Bound from the route. */
  readonly token = input.required<string>();

  protected readonly preview = httpResource<InvitationPreview>(() => `/api/v1/invitations/${encodeURIComponent(this.token())}`);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  // The link is opened cold, with no guard before it: without asking, a signed-in person would look signed out.
  protected readonly sessionChecked = signal(false);

  constructor() {
    void this.session.ensureLoaded().finally(() => this.sessionChecked.set(true));
  }

  protected readonly roleLabel = computed(() => ROLE_LABELS[this.preview.value()?.role ?? 'member']);
  protected readonly wrongAccount = computed(
    () => this.preview.value()?.email.toLowerCase() !== this.session.user()?.email.toLowerCase(),
  );

  protected async accept(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      const accepted = await firstValueFrom(
        this.http.post<AcceptedInvitation>(`/api/v1/invitations/${encodeURIComponent(this.token())}/accept`, null),
      );
      await this.workspaces.refresh();
      this.workspaces.select(accepted.workspaceId);
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.failure.set(errorMessage(error));
      this.preview.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected async switchAccount(): Promise<void> {
    await this.session.logout();
    this.workspaces.clear();
    await this.router.navigate(['/login'], { queryParams: { returnUrl: `/invite/${this.token()}` } });
  }
}
