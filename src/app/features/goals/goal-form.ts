import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Goal, GoalMember } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { parseAmount } from '../../shared/ui/money';
import { GoalsApi } from './goals-api';

/** A new goal, with the other members who could save for it too, or a change to an existing one. */
export type GoalFormTarget =
  | { readonly mode: 'create'; readonly currency: string; readonly others: readonly GoalMember[] }
  | { readonly mode: 'edit'; readonly goal: Goal };

/**
 * Names a goal, its target and its date. When creating, the person can bring other members of the workspace
 * in: only they will see it.
 */
@Component({
  selector: 'app-goal-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog [title]="target().mode === 'create' ? 'Nueva meta' : 'Editar meta'" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        <app-field label="Nombre" [state]="goalForm.name()">
          <input class="input" type="text" placeholder="ej. Viaje a Japón" [formField]="goalForm.name" />
        </app-field>
        <div class="form-pair">
          <app-field [label]="'Objetivo (' + currency() + ')'" [state]="goalForm.target()">
            <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="goalForm.target" />
          </app-field>
          <app-field label="Fecha objetivo (opcional)">
            <input class="input" type="date" [formField]="goalForm.date" />
          </app-field>
        </div>
        @if (others().length > 0) {
          <fieldset class="people">
            <legend>¿Quién más ahorra para esta meta?</legend>
            @for (member of others(); track member.userId) {
              <label class="form-check">
                <input type="checkbox" [checked]="chosen().has(member.userId)" (change)="toggle(member.userId)" />
                <span>{{ member.displayName }}</span>
              </label>
            }
          </fieldset>
          <p class="form-note">Solo quienes participan ven la meta. Cada quien aporta desde sus cuentas y conserva lo suyo: nadie ve las cuentas de otro.</p>
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : target().mode === 'create' ? 'Crear meta' : 'Guardar' }}</button>
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalForm {
  private readonly api = inject(GoalsApi);

  readonly target = input.required<GoalFormTarget>();

  /** Emits the message to show once the goal is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly currency = computed(() => {
    const target = this.target();
    return target.mode === 'create' ? target.currency : target.goal.currency;
  });
  protected readonly others = computed(() => {
    const target = this.target();
    return target.mode === 'create' ? target.others : [];
  });
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());

  protected readonly model = linkedSignal(() => {
    const target = this.target();
    return target.mode === 'create'
      ? { name: '', target: '', date: '' }
      : { name: target.goal.name, target: Number(target.goal.targetAmount).toFixed(2), date: target.goal.targetDate ?? '' };
  });
  protected readonly goalForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => (value().trim() ? undefined : { kind: 'required', message: 'Ponle un nombre.' }));
    validate(path.target, ({ value }) => ((parseAmount(value()) ?? 0) > 0 ? undefined : { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' }));
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
    void submit(this.goalForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const target = this.target();
        const body = { name: this.model().name.trim(), targetAmount: parseAmount(this.model().target) ?? 0, targetDate: this.model().date || null };
        const goal =
          target.mode === 'create'
            ? await this.api.create({ ...body, currency: target.currency, participantUserIds: [...this.chosen()] })
            : await this.api.update(target.goal.id, body);
        this.saved.emit(target.mode === 'create' ? `Meta «${goal.name}» creada.` : `Meta «${goal.name}» guardada.`);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
