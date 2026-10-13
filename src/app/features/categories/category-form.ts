import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Category, CategoryColor, CategoryKind, Subcategory } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { Dialog } from '../../shared/ui/dialog';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoriesApi, KIND_LABELS, isValidTag, parseTags } from './categories-api';

/** What the form is for: a new category or subcategory, a category being edited, or a subcategory being renamed. */
export type CategoryFormTarget =
  | { readonly mode: 'create'; readonly parent?: Category }
  | { readonly mode: 'edit'; readonly category: Category }
  | { readonly mode: 'rename'; readonly parent: Category; readonly subcategory: Subcategory };

interface CategoryFormModel {
  kind: CategoryKind;
  name: string;
  parentId: string;
  icon: string;
  color: CategoryColor;
  tags: string;
}

function initialModel(target: CategoryFormTarget): CategoryFormModel {
  switch (target.mode) {
    case 'create':
      return { kind: target.parent?.kind ?? 'expense', name: '', parentId: target.parent?.id ?? '', icon: 'category', color: 'green', tags: '' };
    case 'edit': {
      const { kind, name, icon, color, tags } = target.category;
      return { kind, name, parentId: '', icon, color, tags: tags.join(', ') };
    }
    case 'rename':
      return { kind: target.parent.kind, name: target.subcategory.name, parentId: target.parent.id, icon: 'category', color: 'green', tags: '' };
  }
}

/** The dialog that creates or edits a category. It saves by itself and reports what it did. */
@Component({
  selector: 'app-category-form',
  imports: [Dialog, Field, FormField, Icon],
  template: `
    <app-dialog [title]="title()" (closed)="closed.emit()">
      <form class="form-stack" (submit)="$event.preventDefault(); save()" novalidate>
        @if (failure(); as text) {
          <div class="alert" role="alert">{{ text }}</div>
        }
        @if (target().mode === 'create') {
          <div class="choice" role="group" aria-label="Tipo">
            <span class="label">Tipo</span>
            <div class="segmented segmented--block">
              @for (kind of kinds; track kind.value) {
                <button type="button" [attr.aria-pressed]="model().kind === kind.value" (click)="chooseKind(kind.value)">{{ kind.label }}</button>
              }
            </div>
          </div>
        }
        <app-field label="Nombre" [state]="categoryForm.name()">
          <input class="input" type="text" placeholder="ej. Hijos, Regalos" [formField]="categoryForm.name" />
        </app-field>
        @if (target().mode === 'create') {
          <app-field label="Ubicación">
            <select class="input" [formField]="categoryForm.parentId">
              <option value="">Categoría principal</option>
              @for (parent of parents(); track parent.id) {
                <option [value]="parent.id">Subcategoría de {{ parent.name }}</option>
              }
            </select>
          </app-field>
        }
        @if (isRoot()) {
          <div class="choice" role="group" aria-label="Ícono">
            <span class="label">Ícono</span>
            <div class="picker">
              @for (icon of icons; track icon.value) {
                <button type="button" class="pick" [attr.aria-label]="icon.label" [attr.aria-pressed]="model().icon === icon.value" (click)="choose({ icon: icon.value })">
                  <app-icon [name]="icon.value" />
                </button>
              }
            </div>
          </div>
          <div class="choice" role="group" aria-label="Color">
            <span class="label">Color</span>
            <div class="picker">
              @for (color of colors; track color.value) {
                <button
                  type="button"
                  class="pick swatch"
                  [attr.data-color]="color.value"
                  [attr.aria-label]="color.label"
                  [attr.aria-pressed]="model().color === color.value"
                  (click)="choose({ color: color.value })"
                ></button>
              }
            </div>
          </div>
          <app-field label="Etiquetas sugeridas (opcional)" hint="Separadas por coma: regalos, familia" [state]="categoryForm.tags()">
            <input class="input" type="text" [formField]="categoryForm.tags" />
          </app-field>
        } @else {
          <p class="note">Una subcategoría usa el tipo, el ícono, el color y las etiquetas de su categoría.</p>
        }
        <div class="actions">
          <button class="button" type="button" (click)="closed.emit()">Cancelar</button>
          <button class="button button--primary" type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : submitLabel() }}</button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: `
    .choice {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .label {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--tx2);
    }
    .picker {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pick {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      border: 1px solid var(--bd);
      background: var(--sf2);
      color: var(--mu);
    }
    .pick[aria-pressed='true'] {
      border-color: var(--ac);
      background: var(--acs);
      color: var(--ac);
    }
    .swatch::before {
      content: '';
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--swatch);
    }
    .swatch[aria-pressed='true'] {
      border-color: var(--swatch);
      background: var(--sf);
    }
    .swatch[data-color='green'] {
      --swatch: var(--ac);
    }
    .swatch[data-color='blue'] {
      --swatch: var(--bl);
    }
    .swatch[data-color='violet'] {
      --swatch: var(--vi);
    }
    .swatch[data-color='amber'] {
      --swatch: var(--am);
    }
    .swatch[data-color='red'] {
      --swatch: var(--rd);
    }
    .note {
      font-size: 12.5px;
      color: var(--mu);
      text-wrap: pretty;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryForm {
  private readonly api = inject(CategoriesApi);

  readonly target = input.required<CategoryFormTarget>();

  /** The person's categories, to offer them as the place of a new subcategory. */
  readonly categories = input.required<readonly Category[]>();

  /** Emits the message to show once the change is saved. */
  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly kinds = (['expense', 'income'] as const).map((value) => ({ value, label: KIND_LABELS[value] }));
  protected readonly icons = CATEGORY_ICONS;
  protected readonly colors = CATEGORY_COLORS;

  protected readonly model = linkedSignal(() => initialModel(this.target()));
  protected readonly categoryForm = form(this.model, (path) => {
    required(path.name, { message: 'Escribe un nombre.' });
    maxLength(path.name, 60, { message: 'Máximo 60 caracteres.' });
    validate(path.tags, ({ value }) => {
      const tags = parseTags(value());
      if (tags.length > 20) {
        return { kind: 'tooManyTags', message: 'Máximo 20 etiquetas.' };
      }

      return tags.every(isValidTag) ? undefined : { kind: 'tagName', message: 'Cada etiqueta tiene hasta 40 letras, números o guiones.' };
    });
  });

  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly parents = computed(() => this.categories().filter((category) => !category.isArchived && category.kind === this.model().kind));
  protected readonly isRoot = computed(() => this.target().mode === 'edit' || (this.target().mode === 'create' && this.model().parentId === ''));

  protected readonly title = computed(() => {
    switch (this.target().mode) {
      case 'create':
        return this.isRoot() ? 'Nueva categoría' : 'Nueva subcategoría';
      case 'edit':
        return 'Editar categoría';
      case 'rename':
        return 'Editar subcategoría';
    }
  });
  protected readonly submitLabel = computed(() => (this.target().mode !== 'create' ? 'Guardar' : this.isRoot() ? 'Crear categoría' : 'Crear subcategoría'));

  /** The places offered depend on the kind, so changing it goes back to a main category. */
  protected chooseKind(kind: CategoryKind): void {
    this.model.update((model) => ({ ...model, kind, parentId: '' }));
  }

  protected choose(look: Partial<Pick<CategoryFormModel, 'icon' | 'color'>>): void {
    this.model.update((model) => ({ ...model, ...look }));
  }

  protected save(): void {
    void submit(this.categoryForm, async () => {
      this.busy.set(true);
      this.failure.set(null);
      try {
        this.saved.emit(await this.persist());
      } catch (error) {
        this.failure.set(errorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  private async persist(): Promise<string> {
    const target = this.target();
    const { kind, parentId, icon, color } = this.model();
    const name = this.model().name.trim();
    const tags = parseTags(this.model().tags);
    switch (target.mode) {
      case 'rename':
        await this.api.update(target.subcategory.id, { name });
        return `Subcategoría «${name}» guardada.`;
      case 'edit':
        await this.api.update(target.category.id, { name, icon, color });
        if (tags.join() !== target.category.tags.join()) {
          await this.api.setTags(target.category.id, tags);
        }

        return `Categoría «${name}» guardada.`;
      case 'create':
        if (parentId) {
          await this.api.create({ name, parentId });
          return `Subcategoría «${name}» creada.`;
        }

        await this.api.create({ kind, name, icon, color, tags });
        return `Categoría «${name}» creada.`;
    }
  }
}
