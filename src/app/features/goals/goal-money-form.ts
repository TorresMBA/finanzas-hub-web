import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Account, Goal } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { GoalsApi } from './goals-api';
import { isManagedAccount } from '../../core/api/managed-accounts';

/** What the dialog needs: the goal, the direction of the money and the accounts of the person it can move with. */
export interface GoalMoneyTarget {
  readonly goal: Goal;
  readonly kind: 'contribute' | 'withdraw';
  readonly accounts: readonly Account[];
}

const QUICK = [100, 250, 500];

/**
 * Puts money into a goal or takes it back. Either way it is a transfer between an account of the person and
 * their own fund for the goal: never an expense, and never someone else's money.
 */
@Component({
  selector: 'app-goal-money-form',
  imports: [Dialog, Field, FormField],
  template: `
    <app-dialog [title]="(isContribution() ? 'Aportar a «' : 'Retirar de «') + target().goal.name + '»'" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (accounts().length === 0) {
          <p class="form-note">No tienes una cuenta en {{ target().goal.currency }} con la que mover este dinero. Créala en Cuentas.</p>
        } @else {
          <app-field [label]="'Monto (' + target().goal.currency + ')'" [hint]="hint()" [state]="moneyForm.amount()">
            <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="moneyForm.amount" />
          </app-field>
          @if (isContribution()) {
            <div class="quick" role="group" aria-label="Montos rápidos">
              @for (amount of quick; track amount) {
                <button type="button" class="chip-toggle" (click)="setAmount(amount)">+{{ amount }}</button>
              }
            </div>
          }
          <app-field [label]="isContribution() ? 'Desde la cuenta' : 'Hacia la cuenta'" [state]="moneyForm.accountId()">
            <select class="input" [formField]="moneyForm.accountId">
              <option value="">Elige una cuenta</option>
              @for (account of accounts(); track account.id) {
                <option [value]="account.id">{{ account.name }}</option>
              }
            </select>
          </app-field>
          <p class="form-note">
            @if (isContribution()) {
              Es una transferencia a tu fondo de esta meta, no un gasto. El dinero sigue siendo tuyo y puedes retirarlo.
            } @else {
              Vuelve de tu fondo de la meta a tu cuenta. Solo puedes retirar lo que tú aportaste.
            }
          </p>
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy() || accounts().length === 0">
            {{ busy() ? 'Guardando…' : isContribution() ? 'Aportar' : 'Retirar' }}
          </button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: `
    .quick {
      display: flex;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalMoneyForm {
  private readonly api = inject(GoalsApi);

  // Created with the form, so sending it twice moves the money once.
  private readonly idempotencyKey = newIdempotencyKey();

  readonly target = input.required<GoalMoneyTarget>();

  /** Emits the message to show once the money moved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly quick = QUICK;
  protected readonly isContribution = computed(() => this.target().kind === 'contribute');

  /** The accounts that hold money in the currency of the goal: not a credit card, not the fund of a goal. */
  protected readonly accounts = computed(() =>
    this.target().accounts.filter(
      (account) => !account.isArchived && account.currency === this.target().goal.currency && account.type !== 'creditCard' && !isManagedAccount(account.type),
    ),
  );
  protected readonly hint = computed(() =>
    this.isContribution() ? '' : `Tienes ${formatMoney(this.target().goal.mySaved, this.target().goal.currency)} en esta meta.`,
  );

  protected readonly model = linkedSignal(() => ({ amount: '', accountId: this.accounts().length === 1 ? this.accounts()[0].id : '' }));
  protected readonly moneyForm = form(this.model, (path) => {
    validate(path.amount, ({ value }) => {
      const amount = parseAmount(value()) ?? 0;
      if (amount <= 0) {
        return { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' };
      }

      return !this.isContribution() && amount > Number(this.target().goal.mySaved)
        ? { kind: 'max', message: 'No puedes retirar más de lo que aportaste.' }
        : undefined;
    });
    validate(path.accountId, ({ value }) => (value() ? undefined : { kind: 'required', message: 'Elige una cuenta.' }));
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected setAmount(amount: number): void {
    this.model.update((model) => ({ ...model, amount: amount.toFixed(2) }));
  }

  protected save(): void {
    void submit(this.moneyForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        const { goal } = this.target();
        const amount = parseAmount(this.model().amount) ?? 0;
        await this.api.move(goal.id, this.isContribution() ? 'contributions' : 'withdrawals', amount, this.model().accountId, this.idempotencyKey);
        const money = formatMoney(amount, goal.currency);
        this.saved.emit(this.isContribution() ? `Aportaste ${money} a «${goal.name}».` : `Retiraste ${money} de «${goal.name}».`);
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }
}
