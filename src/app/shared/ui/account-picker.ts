import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { Icon } from './icon';
import { IconTile, TileColor } from './icon-tile';
import { Amount, MoneyPipe } from './money';

/** One account to choose: what the person recognises it by and what it holds. */
export interface PickerOption {
  readonly id: string;
  readonly name: string;
  /** A second line: its type, or why it cannot be chosen. */
  readonly hint: string;
  readonly currency: string;
  readonly balance: Amount;
  readonly icon: string;
  readonly color: TileColor;
  readonly disabled?: boolean;
}

/** Accounts shown together, like those of one currency, with what they hold between them. */
export interface PickerGroup {
  readonly label: string;
  /** Already written, since it is the group's business how to add its accounts up. */
  readonly total: string | null;
  readonly options: readonly PickerOption[];
}

let nextId = 0;

/**
 * Chooses one account from a list grouped by currency, each with its balance, as the mock draws it. A combobox: it
 * opens with the arrow keys, Enter or a click, moves with the arrows, Home and End, and closes with Escape. Bind it
 * with `[formField]` like an input. Project an action, like a link to open an account, to show it below the list.
 */
@Component({
  selector: 'app-account-picker',
  imports: [Icon, IconTile, MoneyPipe],
  host: { '(document:click)': 'closeIfOutside($event)' },
  template: `
    <button
      #trigger
      type="button"
      class="trigger"
      [class.is-open]="open()"
      [class.is-invalid]="invalid() && touched()"
      role="combobox"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
      (blur)="touch.emit()"
    >
      @if (selected(); as option) {
        <app-icon-tile [icon]="option.icon" [color]="option.color" [size]="34" />
        <span class="text">
          <strong>{{ option.name }}</strong>
          <small>Saldo {{ option.balance | money: option.currency }}</small>
        </span>
        <span class="code">{{ option.currency }}</span>
      } @else {
        <span class="text placeholder">{{ placeholder() }}</span>
      }
      <app-icon [name]="open() ? 'expand_less' : 'expand_more'" />
    </button>
    @if (open()) {
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <div class="panel" (click)="stopLabel($event)">
        <!-- The list keeps the focus and says which option is active, as a combobox list does. -->
        <div #list class="list" role="listbox" tabindex="-1" [id]="listId" [attr.aria-label]="label()" [attr.aria-activedescendant]="activeId()" (keydown)="onListKey($event)">
          @for (group of groups(); track group.label; let g = $index) {
            <div role="group" [attr.aria-labelledby]="listId + '-g' + g">
              <div class="group" [id]="listId + '-g' + g">
                <span>{{ group.label }}</span>
                @if (group.total) {
                  <span class="total">{{ group.total }}</span>
                }
              </div>
              @for (option of group.options; track option.id) {
                <!-- Focus stays on the list, which handles the keys; a click is the pointer's way of choosing. -->
                <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
                <div
                  class="option"
                  role="option"
                  [id]="optionId(option)"
                  [class.is-active]="active() === option.id"
                  [attr.aria-selected]="value() === option.id"
                  [attr.aria-disabled]="option.disabled ? true : null"
                  (click)="choose(option)"
                  (mouseenter)="option.disabled || active.set(option.id)"
                >
                  <app-icon-tile [icon]="option.icon" [color]="option.color" [size]="30" />
                  <span class="text">
                    <strong>{{ option.name }}</strong>
                    <small>{{ option.hint }}</small>
                  </span>
                  <span class="balance" [class.is-negative]="+option.balance < 0">{{ option.balance | money: option.currency }}</span>
                  <span class="check">
                    @if (value() === option.id) {
                      <app-icon name="check" [size]="18" />
                    }
                  </span>
                </div>
              }
            </div>
          } @empty {
            <p class="empty">No hay cuentas para elegir.</p>
          }
        </div>
        <ng-content />
      </div>
    }
  `,
  styles: `
    @use 'mixins' as m;

    :host {
      position: relative;
      display: block;
    }
    .trigger {
      width: 100%;
      min-height: 52px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid var(--bd);
      background: var(--sf2);
      color: var(--tx);
      text-align: left;

      &:hover {
        background: var(--sf3);
      }
      &.is-open {
        border-color: var(--ac);
        box-shadow: 0 0 0 3px var(--acs);
      }
      &.is-invalid {
        border-color: var(--rd);
      }
      app-icon {
        color: var(--mu);
      }
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;

      strong {
        font-size: 13.5px;
        font-weight: 800;
        @include m.truncate;
      }
      small {
        font-size: 11.5px;
        color: var(--mu);
        font-variant-numeric: tabular-nums;
        @include m.truncate;
      }
    }
    .placeholder {
      font-size: 13.5px;
      color: var(--mu);
    }
    .code {
      padding: 2px 7px;
      border-radius: 6px;
      background: var(--sf3);
      font-size: 10.5px;
      font-weight: 800;
      color: var(--tx2);
    }
    .panel {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 6px);
      z-index: 5;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      border-radius: 14px;
      border: 1px solid var(--bd);
      background: var(--sf);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    }
    .list {
      max-height: 300px;
      overflow-y: auto;
      outline: none;
    }
    .group {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 8px 4px;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mu);
    }
    .total {
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
    }
    .option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-radius: 10px;
      cursor: pointer;

      &.is-active,
      &[aria-selected='true'] {
        background: var(--sf2);
      }
      &[aria-disabled='true'] {
        opacity: 0.4;
        cursor: default;
      }
      .text strong {
        font-size: 13px;
        font-weight: 700;
      }
    }
    .list:focus-visible .is-active {
      outline: 2px solid var(--ac);
      outline-offset: -2px;
    }
    .balance {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--tx2);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .is-negative {
      color: var(--rd);
    }
    .check {
      width: 18px;
      color: var(--ac);
    }
    .empty {
      padding: 10px 8px;
      font-size: 12.5px;
      color: var(--mu);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPicker implements FormValueControl<string> {
  readonly groups = input.required<readonly PickerGroup[]>();
  /** What the control is for, read by assistive technology: "Cuenta", "Desde". */
  readonly label = input.required<string>();
  readonly placeholder = input('Elige una cuenta');

  readonly value = model('');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touch = output<void>();

  protected readonly listId = `account-picker-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly active = signal<string | null>(null);

  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  private readonly options = computed(() => this.groups().flatMap((group) => group.options));
  private readonly choosable = computed(() => this.options().filter((option) => !option.disabled));
  protected readonly selected = computed(() => this.options().find((option) => option.id === this.value()) ?? null);
  protected readonly activeId = computed(() => (this.active() ? this.optionId({ id: this.active()! }) : null));

  protected optionId(option: Pick<PickerOption, 'id'>): string {
    return `${this.listId}-${option.id}`;
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
    } else {
      this.show();
    }
  }

  protected choose(option: PickerOption): void {
    if (option.disabled) {
      return;
    }

    this.value.set(option.id);
    this.close(true);
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && !this.open()) {
      event.preventDefault();
      this.show();
    }
  }

  protected onListKey(event: KeyboardEvent): void {
    const choosable = this.choosable();
    const index = choosable.findIndex((option) => option.id === this.active());
    const moveTo = (next: number) => {
      event.preventDefault();
      const option = choosable[Math.max(0, Math.min(choosable.length - 1, next))];
      if (option) {
        this.active.set(option.id);
        this.list()?.nativeElement.querySelector(`#${CSS.escape(this.optionId(option))}`)?.scrollIntoView?.({ block: 'nearest' });
      }
    };

    switch (event.key) {
      case 'ArrowDown':
        return moveTo(index + 1);
      case 'ArrowUp':
        return moveTo(index - 1);
      case 'Home':
        return moveTo(0);
      case 'End':
        return moveTo(choosable.length - 1);
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const option = choosable[index];
        if (option) {
          this.choose(option);
        }

        return;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        return this.close(true);
      case 'Tab':
        return this.close(false);
    }
  }

  /**
   * Inside a `<label>`, as in a form field, a click on the list would also click the trigger, which opens the list
   * again. Cancelling the click stops that, except on links and buttons projected below the list, which a label leaves alone.
   */
  protected stopLabel(event: MouseEvent): void {
    if (!(event.target as Element | null)?.closest('a, button')) {
      event.preventDefault();
    }
  }

  protected closeIfOutside(event: MouseEvent): void {
    const trigger = this.trigger().nativeElement;
    const panel = this.list()?.nativeElement.parentElement;
    const target = event.target as Node | null;
    if (this.open() && target && !trigger.contains(target) && !panel?.contains(target)) {
      this.close(false);
    }
  }

  private show(): void {
    this.active.set(this.value() && this.choosable().some((option) => option.id === this.value()) ? this.value() : (this.choosable()[0]?.id ?? null));
    this.open.set(true);
    // The list is rendered by the change above: focus it once it is there.
    afterNextRender(() => this.list()?.nativeElement.focus(), { injector: this.injector });
  }

  private close(returnFocus: boolean): void {
    this.open.set(false);
    this.touch.emit();
    if (returnFocus) {
      this.trigger().nativeElement.focus();
    }
  }
}
