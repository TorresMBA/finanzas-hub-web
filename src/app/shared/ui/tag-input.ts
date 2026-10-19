import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { parseTags } from './tags';

/**
 * Tags as chips: Enter or a comma adds what was typed, Backspace on an empty box takes the last one away, and the
 * suggestions add with a click. The value is the tags separated by commas, the same text a plain input would hold,
 * so the form validates it with `parseTags` as before.
 */
@Component({
  selector: 'app-tag-input',
  template: `
    <div class="box" [class.is-invalid]="invalid() && touched()">
      @for (tag of tags(); track tag) {
        <span class="chip">
          <span aria-hidden="true">#</span>{{ tag }}
          <button type="button" [attr.aria-label]="'Quitar ' + tag" (click)="remove(tag)">×</button>
        </span>
      }
      <input
        #box
        type="text"
        [attr.aria-label]="label()"
        [placeholder]="tags().length > 0 ? 'Agregar…' : 'Escribe y presiona Enter'"
        [value]="draft()"
        [disabled]="disabled()"
        (input)="type(box.value)"
        (keydown)="onKey($event)"
        (blur)="commit(); touch.emit()"
      />
    </div>
    @if (offered().length > 0) {
      <div class="suggested">
        <span>Sugeridas:</span>
        @for (tag of offered(); track tag) {
          <button type="button" class="tag tag--add" (click)="add(tag)">+ {{ tag }}</button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .box {
      min-height: 42px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 10px;
      border: 1px solid var(--bd);
      background: var(--sf2);

      &:focus-within {
        border-color: var(--ac);
      }
      &.is-invalid {
        border-color: var(--rd);
      }
    }
    .chip {
      height: 26px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0 4px 0 9px;
      border-radius: 99px;
      background: var(--sf3);
      font-size: 12px;
      font-weight: 800;

      button {
        width: 18px;
        height: 18px;
        border-radius: 99px;
        color: var(--mu);
        font-size: 14px;
        line-height: 1;

        &:hover {
          color: var(--tx);
        }
      }
    }
    input {
      flex: 1;
      min-width: 90px;
      height: 26px;
      border: 0;
      outline: 0;
      background: none;
      color: var(--tx);
      font-size: 13px;
    }
    .suggested {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: var(--mu);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagInput implements FormValueControl<string> {
  readonly value = model('');
  readonly label = input('Etiquetas');
  /** Tags to offer, like the ones of the chosen category. Those already added are not offered again. */
  readonly suggestions = input<readonly string[]>([]);

  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touch = output<void>();

  protected readonly draft = signal('');
  protected readonly tags = computed(() => parseTags(this.value()));
  protected readonly offered = computed(() => this.suggestions().filter((tag) => !this.tags().includes(tag)));

  protected type(text: string): void {
    if (text.endsWith(',')) {
      this.add(text.slice(0, -1));
    } else {
      this.draft.set(text);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commit();
    } else if (event.key === 'Backspace' && this.draft() === '' && this.tags().length > 0) {
      this.write(this.tags().slice(0, -1));
    }
  }

  /** What is still in the box becomes a tag. */
  protected commit(): void {
    if (this.draft().trim() !== '') {
      this.add(this.draft());
    }
  }

  protected add(text: string): void {
    const tag = text.trim().replace(/^#/, '');
    this.draft.set('');
    if (tag !== '' && !this.tags().includes(tag)) {
      this.write([...this.tags(), tag]);
    }
  }

  protected remove(tag: string): void {
    this.write(this.tags().filter((candidate) => candidate !== tag));
  }

  private write(tags: readonly string[]): void {
    this.value.set(tags.join(', '));
  }
}
