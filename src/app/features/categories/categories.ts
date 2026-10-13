import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Category, CategoryKind, Subcategory, Tag } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { IconTile } from '../../shared/ui/icon-tile';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatCard } from '../../shared/ui/stat-card';
import { CategoriesApi, KIND_LABELS, isValidTag } from './categories-api';
import { CategoryForm, CategoryFormTarget } from './category-form';

type KindTab = 'all' | CategoryKind;

const KIND_TABS: readonly { value: KindTab; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
];

/** Lower case and without accents, so "educacion" finds "Educación". */
function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * The person's own categories, subcategories and tags. Everything here is private: another member of the
 * workspace has a separate set.
 */
@Component({
  selector: 'app-categories',
  imports: [CategoryForm, EmptyState, ErrorState, Icon, IconTile, PageHeader, Skeleton, StatCard],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Categories {
  private readonly api = inject(CategoriesApi);
  private readonly tagInput = viewChild<ElementRef<HTMLInputElement>>('tagInput');

  protected readonly kindTabs = KIND_TABS;
  protected readonly kindLabels = KIND_LABELS;

  // Archived ones come too and are hidden here, so showing them is instant.
  protected readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());
  protected readonly tags = httpResource<Tag[]>(() => this.api.tagsUrl());

  protected readonly query = signal('');
  protected readonly kindTab = signal<KindTab>('all');
  protected readonly tagFilter = signal<string | null>(null);
  protected readonly showArchived = signal(false);
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly formTarget = signal<CategoryFormTarget | null>(null);
  protected readonly confirmingTagArchive = signal(false);
  protected readonly quickTag = signal('');
  private readonly chosenQuickCategory = signal('');

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly all = computed(() => this.categories.value() ?? []);
  protected readonly active = computed(() => this.all().filter((category) => !category.isArchived));
  protected readonly tagCloud = computed(() => this.tags.value() ?? []);

  protected readonly archivedCount = computed(
    () =>
      this.all().filter((category) => category.isArchived).length +
      this.active().reduce((count, category) => count + category.subcategories.filter((subcategory) => subcategory.isArchived).length, 0),
  );

  protected readonly stats = computed(() => [
    { label: 'Categorías', value: this.active().length, icon: 'category', color: 'green' as const },
    {
      label: 'Subcategorías',
      value: this.active().reduce((count, category) => count + category.subcategories.filter((subcategory) => !subcategory.isArchived).length, 0),
      icon: 'account_tree',
      color: 'blue' as const,
    },
    { label: 'Etiquetas', value: this.tagCloud().length, icon: 'sell', color: 'violet' as const },
  ]);

  protected readonly rows = computed(() => {
    const text = searchable(this.query().trim());
    const kind = this.kindTab();
    const tag = this.tagFilter();
    const withArchived = this.showArchived();
    return this.all()
      .filter((category) => withArchived || !category.isArchived)
      .filter((category) => kind === 'all' || category.kind === kind)
      .filter((category) => tag === null || category.tags.includes(tag))
      .filter(
        (category) =>
          text === '' ||
          [category.name, ...category.tags, ...category.subcategories.map((subcategory) => subcategory.name)].some((value) => searchable(value).includes(text)),
      )
      .map((category) => ({
        ...category,
        subcategories: category.subcategories.filter((subcategory) => withArchived || !subcategory.isArchived),
      }));
  });

  /** The category the quick tag goes to: the one the person chose while it still exists, otherwise the first. */
  protected readonly quickCategoryId = computed(() => {
    const chosen = this.chosenQuickCategory();
    return this.active().some((category) => category.id === chosen) ? chosen : (this.active()[0]?.id ?? '');
  });

  protected toggle(categoryId: string): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      return next.delete(categoryId) ? next : next.add(categoryId);
    });
  }

  protected describe(category: Category): string {
    const count = category.subcategories.length;
    const subcategories = count === 0 ? 'Sin subcategorías' : `${count} subcategoría${count > 1 ? 's' : ''}`;
    return `${subcategories} · ${KIND_LABELS[category.kind]}`;
  }

  protected filterByTag(tag: string): void {
    this.confirmingTagArchive.set(false);
    this.tagFilter.update((current) => (current === tag ? null : tag));
  }

  protected openCreate(parent?: Category): void {
    this.formTarget.set({ mode: 'create', parent });
  }

  protected openEdit(category: Category): void {
    this.formTarget.set({ mode: 'edit', category });
  }

  protected openRename(parent: Category, subcategory: Subcategory): void {
    this.formTarget.set({ mode: 'rename', parent, subcategory });
  }

  protected onSaved(message: string): void {
    // A new subcategory is shown right away: its category opens.
    const target = this.formTarget();
    const parent = target?.mode === 'create' ? target.parent : undefined;
    if (parent) {
      this.expanded.update((open) => new Set(open).add(parent.id));
    }

    this.formTarget.set(null);
    this.failure.set(null);
    this.notice.set(message);
    this.reload();
  }

  protected archive(item: Category | Subcategory): Promise<void> {
    return this.run(`«${item.name}» archivada. Ya no se ofrece al clasificar.`, () => this.api.archive(item.id));
  }

  protected restore(item: Category | Subcategory): Promise<void> {
    return this.run(`«${item.name}» restaurada.`, () => this.api.restore(item.id));
  }

  protected seedDefaults(): Promise<void> {
    return this.run('Categorías sugeridas cargadas. Cámbiales el nombre o archiva las que no uses.', () => this.api.seedDefaults());
  }

  /** The "+ etiqueta" button of a row: it takes the person to the quick form with that category chosen. */
  protected tagCategory(category: Category): void {
    this.chosenQuickCategory.set(category.id);
    this.tagInput()?.nativeElement.focus();
  }

  protected chooseQuickCategory(categoryId: string): void {
    this.chosenQuickCategory.set(categoryId);
  }

  protected addQuickTag(): Promise<void> {
    const name = this.quickTag().trim();
    const category = this.active().find((candidate) => candidate.id === this.quickCategoryId());
    if (!category || name === '') {
      return Promise.resolve();
    }

    if (!isValidTag(name)) {
      this.notice.set(null);
      this.failure.set('Una etiqueta tiene hasta 40 letras, números o guiones.');
      return Promise.resolve();
    }

    return this.run(`Etiqueta agregada a «${category.name}».`, async () => {
      await this.api.setTags(category.id, [...category.tags, name]);
      this.quickTag.set('');
    });
  }

  protected archiveTag(): Promise<void> {
    const tag = this.tagCloud().find((candidate) => candidate.name === this.tagFilter());
    if (!tag) {
      return Promise.resolve();
    }

    return this.run(`Etiqueta #${tag.name} archivada.`, async () => {
      await this.api.archiveTag(tag.id);
      this.tagFilter.set(null);
      this.confirmingTagArchive.set(false);
    });
  }

  protected reload(): void {
    this.categories.reload();
    this.tags.reload();
  }

  private async run(success: string, action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      await action();
      this.notice.set(success);
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
      // Also after a refusal: it usually means the list on screen is out of date.
      this.reload();
    }
  }
}
