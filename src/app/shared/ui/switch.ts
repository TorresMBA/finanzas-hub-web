import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormCheckboxControl } from '@angular/forms/signals';

/**
 * An option that is on or off, with a title and a line saying what it does, as the mock draws it. A switch for
 * assistive technology. Bind it with `[formField]` like a checkbox.
 */
@Component({
  selector: 'app-switch',
  template: `
    <button type="button" role="switch" [attr.aria-checked]="checked()" [disabled]="disabled()" (click)="checked.set(!checked())" (blur)="touch.emit()">
      <span class="text">
        <strong>{{ title() }}</strong>
        @if (description(); as text) {
          <small>{{ text }}</small>
        }
      </span>
      <span class="track" aria-hidden="true"><span class="thumb"></span></span>
    </button>
  `,
  styles: `
    button {
      width: 100%;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--bd);
      background: var(--sf2);
      color: var(--tx);
      text-align: left;
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      strong {
        font-size: 13px;
        font-weight: 800;
      }
      small {
        font-size: 11.5px;
        color: var(--mu);
        text-wrap: pretty;
      }
    }
    .track {
      width: 36px;
      height: 20px;
      flex: none;
      margin-top: 2px;
      padding: 2px;
      display: flex;
      border-radius: 99px;
      background: var(--sf3);
      transition: background 0.12s ease;
    }
    .thumb {
      width: 16px;
      height: 16px;
      border-radius: 99px;
      background: var(--tx);
      transition: transform 0.12s ease;
    }
    [aria-checked='true'] {
      .track {
        background: var(--ac);
      }
      .thumb {
        transform: translateX(16px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Switch implements FormCheckboxControl {
  readonly checked = model(false);
  readonly title = input.required<string>();
  /** What turning it on does. It may change with the state, to say what will happen. */
  readonly description = input<string>();

  readonly disabled = input(false);
  readonly touch = output<void>();
}
