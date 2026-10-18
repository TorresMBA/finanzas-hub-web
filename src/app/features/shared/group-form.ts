import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { errorMessage } from '../../core/errors/error-messages';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { GROUP_ICONS, SharedApi } from './shared-api';

/** The members of the workspace other than the person, to choose who is in the group. */
export interface GroupFormTarget {
  readonly others: readonly { userId: string; displayName: string }[];
  readonly currency: string;
}

/** Names a group and chooses who is in it. Only they will see it and what is split in it. */
@Component({
  selector: 'app-group-form',
  imports: [Dialog, Field, FormField, Icon],
  template: `
    <app-dialog title="Nuevo grupo" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <app-field label="Nombre" [state]="groupForm.name()">
          <input class="input" type="text" placeholder="ej. Depa" [formField]="groupForm.name" />
        </app-field>
        <fieldset class="people">
          <legend>Ícono</legend>
          <div class="icons" role="radiogroup" aria-label="Ícono del grupo">
            @for (option of icons; track option.value) {
              <button type="button" role="radio" class="icon-choice" [attr.aria-checked]="icon() === option.value" [attr.aria-label]="option.label" (click)="icon.set(option.value)">
                <app-icon [name]="option.value" [size]="20" />
              </button>
            }
          </div>
        </fieldset>
        <fieldset class="people">
          <legend>¿Con quién divides?</legend>
          @for (member of target().others; track member.userId) {
            <label class="form-check">
              <input type="checkbox" [checked]="chosen().has(member.userId)" (change)="toggle(member.userId)" />
              <span>{{ member.displayName }}</span>
            </label>
          } @empty {
            <p class="form-note">Todavía no hay nadie más en este espacio. Invita a alguien desde Configuración → Espacio.</p>
          }
        </fieldset>
        <p class="form-note">Los gastos del grupo se llevan en {{ target().currency }}. Solo quienes están en el grupo lo ven.</p>
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Crear grupo' }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: `
    .people {
      margin: 0;
      padding: 0;
      border: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    legend {
      margin-bottom: 8px;
      padding: 0;
      font-size: 13px;
      font-weight: 700;
      color: var(--tx2);
    }
    .icons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .icon-choice {
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      border: 1px solid var(--bd);
      background: var(--sf2);
      color: var(--tx2);
    }
    .icon-choice[aria-checked='true'] {
      border-color: var(--ac);
      background: var(--acs);
      color: var(--ac);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupForm {
  private readonly api = inject(SharedApi);

  readonly target = input.required<GroupFormTarget>();

  /** Emits the id of the new group and the message to show. */
  readonly saved = output<{ groupId: string; message: string }>();
  readonly closed = output<void>();

  protected readonly icons = GROUP_ICONS;
  protected readonly icon = signal(GROUP_ICONS[0].value);
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  protected readonly model = signal({ name: '' });
  protected readonly groupForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => (value().trim() ? undefined : { kind: 'required', message: 'Ponle un nombre.' }));
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected toggle(userId: string): void {
    this.chosen.update((chosen) => {
      const next = new Set(chosen);
      return next.delete(userId) ? next : next.add(userId);
    });
  }

  protected save(): void {
    void submit(this.groupForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const detail = await this.api.createGroup(this.model().name.trim(), [...this.chosen()], this.icon());
        this.saved.emit({ groupId: detail.group.id, message: `Grupo «${detail.group.name}» creado.` });
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
