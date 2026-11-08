import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input } from '@angular/core';

let nextId = 0;

/** The part of a form field's state this component reads. A Signal Forms field state satisfies it. */
export interface FieldErrors {
  touched(): boolean;
  errors(): readonly { message?: string }[];
}

/**
 * Label, control and message of one form field. Project the control; it shows the first validation
 * message once the field was touched, or the message the API returned for the field.
 *
 * The label wraps the control, so the control needs no id. The message and the hint are tied to the control with
 * aria-describedby, and an error marks it aria-invalid, so a screen reader reads them when the control gets focus.
 */
@Component({
  selector: 'app-field',
  template: `
    <!-- The control is projected inside the label, which associates them; the rule cannot see through ng-content. -->
    <!-- eslint-disable-next-line @angular-eslint/template/label-has-associated-control -->
    <label>
      <span class="label">{{ label() }}</span>
      <ng-content />
    </label>
    @if (message(); as text) {
      <p class="error" role="alert" [id]="messageId">{{ text }}</p>
    } @else if (hint(); as text) {
      <p class="hint" [id]="messageId">{{ text }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .label {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--tx2);
    }
    p {
      margin-top: 5px;
      font-size: 12px;
      text-wrap: pretty;
    }
    .hint {
      color: var(--mu);
    }
    .error {
      color: var(--rd);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Field {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly state = input<FieldErrors>();

  /** Message from the server for this field, shown when the client-side rules passed. */
  readonly serverError = input<string | null>();

  protected readonly message = computed(() => {
    const state = this.state();
    const local = state?.touched() ? state.errors()[0] : undefined;
    return local ? (local.message ?? 'Valor no válido.') : (this.serverError() ?? null);
  });

  protected readonly messageId = `field-message-${nextId++}`;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterRenderEffect(() => {
      const control = host.querySelector('input, select, textarea');
      if (!control) {
        return;
      }

      const invalid = this.message() !== null;
      if (invalid) {
        control.setAttribute('aria-invalid', 'true');
      } else {
        control.removeAttribute('aria-invalid');
      }

      if (invalid || this.hint()) {
        control.setAttribute('aria-describedby', this.messageId);
      } else {
        control.removeAttribute('aria-describedby');
      }
    });
  }
}
