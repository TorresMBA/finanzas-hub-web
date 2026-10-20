import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';
import { Icon } from './icon';

let nextId = 0;

/**
 * A modal dialog: a sheet from the bottom on mobile, a centred card from tablet up. Render it only while it is
 * open (inside an `@if`) and remove it on `closed`. It is a native dialog, so the browser keeps focus inside,
 * makes the page behind inert and closes it with Escape.
 */
@Component({
  selector: 'app-dialog',
  imports: [Icon],
  template: `
    <!-- The click only closes on the backdrop; from the keyboard that is Escape, which raises "cancel". -->
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
    <dialog #dialog [attr.aria-labelledby]="titleId" (cancel)="$event.preventDefault(); closed.emit()" (click)="closeIfBackdrop($event)">
      <header>
        <h2 [id]="titleId">{{ title() }}</h2>
        <button type="button" aria-label="Cerrar" (click)="closed.emit()"><app-icon name="close" /></button>
      </header>
      <ng-content />
    </dialog>
  `,
  styles: `
    @use 'mixins' as m;

    dialog {
      width: 100%;
      max-width: 100%;
      max-height: 92dvh;
      margin: auto 0 0;
      padding: 18px 16px 24px;
      border: 1px solid var(--bd);
      border-radius: 20px 20px 0 0;
      background: var(--sf);
      color: var(--tx);
      overflow-y: auto;

      @include m.tablet-up {
        width: 480px;
        margin: auto;
        padding: 22px;
        border-radius: 18px;
      }
    }
    dialog::backdrop {
      background: var(--ov);
    }
    /* It arrives from below on mobile, as a sheet does, and grows into place from tablet up. */
    dialog[open] {
      animation: sheet-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1);

      @include m.tablet-up {
        animation-name: card-in;
      }
    }
    dialog[open]::backdrop {
      animation: fade-in 220ms ease-out;
    }
    @keyframes sheet-in {
      from {
        transform: translateY(100%);
      }
    }
    @keyframes card-in {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.97);
      }
    }
    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      dialog[open],
      dialog[open]::backdrop {
        animation: none;
      }
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    h2 {
      font-size: 17px;
      font-weight: 800;
    }
    button {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: var(--sf2);
      color: var(--mu);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly title = input.required<string>();
  readonly closed = output<void>();

  protected readonly titleId = `dialog-title-${nextId++}`;

  constructor() {
    afterNextRender(() => {
      const element = this.dialog().nativeElement;
      // A DOM without the modal API (a unit test) still shows the content.
      if (typeof element.showModal === 'function') {
        element.showModal();
      } else {
        element.setAttribute('open', '');
      }
    });
  }

  /** A click on the backdrop is reported on the dialog element, but lands outside its box. */
  protected closeIfBackdrop(event: MouseEvent): void {
    const box = this.dialog().nativeElement.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (event.target === this.dialog().nativeElement && !inside) {
      this.closed.emit();
    }
  }
}
