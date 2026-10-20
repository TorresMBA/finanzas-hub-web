import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Account, Category, Goal } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { newIdempotencyKey } from '../../core/http/api-interceptors';
import { AccountPicker, accountGroups } from '../../shared/ui/account-picker';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { formatMoney, parseAmount } from '../../shared/ui/money';
import { GoalsApi } from './goals-api';
import { isManagedAccount } from '../../core/api/managed-accounts';

/** What the dialog needs: the goal, what to do with the money and, to spend, the categories of the person. */
export interface GoalMoneyTarget {
  readonly goal: Goal;
  readonly kind: 'contribute' | 'withdraw' | 'spend';
  readonly categories?: readonly Category[];
}

const QUICK = [100, 250, 500];
const MAX_DESCRIPTION = 200;

const TITLES: Readonly<Record<GoalMoneyTarget['kind'], string>> = { contribute: 'Aportar a', withdraw: 'Retirar de', spend: 'Usar el dinero de' };
const ACTIONS: Readonly<Record<GoalMoneyTarget['kind'], string>> = { contribute: 'Aportar', withdraw: 'Retirar', spend: 'Registrar el gasto' };

/**
 * Puts money into a goal, takes it back or spends it. Putting in and taking back are transfers between an account of
 * the person and their own fund for the goal, never an expense. Spending is the moment it becomes one: the money comes
 * back to the account that pays and the expense is registered there, marked as paid with the goal.
 */
@Component({
  selector: 'app-goal-money-form',
  imports: [AccountPicker, Dialog, Field, FormField],
  template: `
    <app-dialog [title]="titles[target().kind] + ' «' + target().goal.name + '»'" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (usable().length === 0) {
          <p class="form-note">No tienes una cuenta en {{ target().goal.currency }} con la que mover este dinero. Créala en Cuentas.</p>
        } @else {
          <app-field [label]="'Monto (' + target().goal.currency + ')'" [hint]="hint()" [state]="moneyForm.amount()">
            <input class="input" type="text" inputmode="decimal" placeholder="0.00" [formField]="moneyForm.amount" />
          </app-field>
          @if (target().kind === 'contribute') {
            <div class="quick" role="group" aria-label="Montos rápidos">
              @for (amount of quick; track amount) {
                <button type="button" class="chip-toggle" (click)="setAmount(amount)">+{{ amount }}</button>
              }
            </div>
          }
          <app-field [label]="accountLabel()" [state]="moneyForm.accountId()">
            <app-account-picker [label]="accountLabel()" [groups]="accountGroups()" [formField]="moneyForm.accountId" />
          </app-field>
          @if (target().kind === 'spend') {
            <app-field label="Categoría del gasto" [state]="moneyForm.categoryId()">
              <select class="input" [formField]="moneyForm.categoryId">
                <option value="">Elige una categoría</option>
                @for (option of categoryOptions(); track option.id) {
                  <option [value]="option.id">{{ option.label }}</option>
                }
              </select>
            </app-field>
            <app-field label="Descripción" [hint]="'Si la dejas vacía: «' + target().goal.name + '».'" [state]="moneyForm.description()">
              <input class="input" type="text" [placeholder]="target().goal.name" [formField]="moneyForm.description" />
            </app-field>
          }
          <p class="form-note">{{ note() }}</p>
        }
        <div class="form-actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy() || usable().length === 0">
            {{ busy() ? 'Guardando…' : actions[target().kind] }}
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
  /** The person's accounts, bound live: a balance that changes while the dialog is open shows here. */
  readonly accounts = input.required<readonly Account[]>();

  /** Emits the message to show once the money moved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly quick = QUICK;
  protected readonly titles = TITLES;
  protected readonly actions = ACTIONS;

  /** The accounts that hold money in the currency of the goal: not a credit card, not the fund of a goal. */
  protected readonly usable = computed(() =>
    this.accounts().filter(
      (account) => !account.isArchived && account.currency === this.target().goal.currency && account.type !== 'creditCard' && !isManagedAccount(account.type),
    ),
  );
  protected readonly accountGroups = computed(() => accountGroups(this.usable()));

  /** The expense categories in use, each followed by its subcategories. */
  protected readonly categoryOptions = computed(() =>
    (this.target().categories ?? [])
      .filter((category) => category.kind === 'expense' && !category.isArchived)
      .flatMap((parent) => [
        { id: parent.id, label: parent.name },
        ...parent.subcategories.filter((child) => !child.isArchived).map((child) => ({ id: child.id, label: `${parent.name} › ${child.name}` })),
      ]),
  );

  protected readonly accountLabel = computed(() =>
    ({ contribute: 'Desde la cuenta', withdraw: 'Hacia la cuenta', spend: 'Pagas con la cuenta' })[this.target().kind],
  );
  protected readonly hint = computed(() =>
    this.target().kind === 'contribute'
      ? `Faltan ${formatMoney(this.target().goal.remaining, this.target().goal.currency)} para el objetivo.`
      : `Tienes ${formatMoney(this.target().goal.mySaved, this.target().goal.currency)} en esta meta.`,
  );
  protected readonly note = computed(
    () =>
      ({
        contribute: 'Es una transferencia a tu fondo de esta meta, no un gasto. El dinero sigue siendo tuyo y puedes retirarlo.',
        withdraw: 'Vuelve de tu fondo de la meta a tu cuenta. Solo puedes retirar lo que tú aportaste.',
        spend: 'El dinero vuelve a esa cuenta y se registra ahí como un gasto de hoy, marcado como pagado con esta meta. Ahorrar no fue gasto; usarlo sí.',
      })[this.target().kind],
  );

  protected readonly model = linkedSignal(() => ({
    // To spend, all of what is theirs by default: that is what reaching a goal is usually for.
    amount: this.target().kind === 'spend' ? Number(this.target().goal.mySaved).toFixed(2) : '',
    // Not tracked: balances arriving while the dialog is open must not clear what was typed.
    accountId: untracked(() => (this.usable().length === 1 ? this.usable()[0].id : '')),
    categoryId: '',
    description: '',
  }));
  protected readonly moneyForm = form(this.model, (path) => {
    validate(path.amount, ({ value }) => {
      const amount = parseAmount(value()) ?? 0;
      if (amount <= 0) {
        return { kind: 'amount', message: 'Un monto mayor que cero, con hasta dos decimales.' };
      }

      // The agreed target is not passed: a contribution is at most what is missing.
      if (this.target().kind === 'contribute') {
        return amount > Number(this.target().goal.remaining)
          ? { kind: 'max', message: `Solo faltan ${formatMoney(this.target().goal.remaining, this.target().goal.currency)} para el objetivo.` }
          : undefined;
      }

      return amount > Number(this.target().goal.mySaved) ? { kind: 'max', message: 'No puedes usar más de lo que aportaste.' } : undefined;
    });
    validate(path.accountId, ({ value }) => (value() ? undefined : { kind: 'required', message: 'Elige una cuenta.' }));
    validate(path.categoryId, ({ value }) =>
      this.target().kind !== 'spend' || value() ? undefined : { kind: 'required', message: 'Elige la categoría del gasto.' },
    );
    validate(path.description, ({ value }) =>
      value().trim().length > MAX_DESCRIPTION ? { kind: 'maxLength', message: `Hasta ${MAX_DESCRIPTION} caracteres.` } : undefined,
    );
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
        this.saved.emit(await this.send());
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  private async send(): Promise<string> {
    const { goal, kind } = this.target();
    const { accountId, categoryId, description } = this.model();
    const amount = parseAmount(this.model().amount) ?? 0;
    const money = formatMoney(amount, goal.currency);
    if (kind === 'spend') {
      await this.api.spend(goal.id, { amount, accountId, categoryId, description: description.trim() || null }, this.idempotencyKey);
      const all = amount >= Number(goal.mySaved);
      return `Registraste un gasto de ${money} pagado con «${goal.name}».${all && goal.isOwner ? ' Si ya terminaste con ella, puedes archivarla.' : ''}`;
    }

    await this.api.move(goal.id, kind === 'contribute' ? 'contributions' : 'withdrawals', amount, accountId, this.idempotencyKey);
    return kind === 'contribute' ? `Aportaste ${money} a «${goal.name}».` : `Retiraste ${money} de «${goal.name}».`;
  }
}
