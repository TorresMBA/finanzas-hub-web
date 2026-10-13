import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Category, CategoryColor, CreateCategoryRequest, SeededCategories, UpdateCategoryRequest } from '../../core/api/api-types';
import { WorkspaceStore } from '../../core/workspace/workspace-store';

export const KIND_LABELS = { expense: 'Gasto', income: 'Ingreso' } as const;

export const CATEGORY_COLORS: readonly { value: CategoryColor; label: string }[] = [
  { value: 'green', label: 'Verde' },
  { value: 'blue', label: 'Azul' },
  { value: 'violet', label: 'Violeta' },
  { value: 'amber', label: 'Ámbar' },
  { value: 'red', label: 'Rojo' },
];

/** The icons offered for a category: glyph name of the icon font and what to call it. */
export const CATEGORY_ICONS: readonly { value: string; label: string }[] = [
  { value: 'category', label: 'General' },
  { value: 'home', label: 'Casa' },
  { value: 'shopping_cart', label: 'Supermercado' },
  { value: 'shopping_bag', label: 'Compras' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'local_cafe', label: 'Café' },
  { value: 'directions_car', label: 'Auto' },
  { value: 'flight', label: 'Viajes' },
  { value: 'bolt', label: 'Servicios' },
  { value: 'favorite', label: 'Salud' },
  { value: 'school', label: 'Educación' },
  { value: 'movie', label: 'Ocio' },
  { value: 'sports_esports', label: 'Juegos' },
  { value: 'fitness_center', label: 'Deporte' },
  { value: 'pets', label: 'Mascotas' },
  { value: 'child_care', label: 'Hijos' },
  { value: 'card_giftcard', label: 'Regalos' },
  { value: 'payments', label: 'Sueldo' },
  { value: 'work', label: 'Trabajo' },
  { value: 'group', label: 'Compartido' },
];

/** The calls that change the categories and tags of the signed-in person in the selected workspace. */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly http = inject(HttpClient);
  private readonly workspaces = inject(WorkspaceStore);

  private readonly base = computed(() => `/api/v1/workspaces/${this.workspaces.current()?.id}`);

  /** Undefined until a workspace is selected, which is how a resource knows to wait. */
  readonly categoriesUrl = computed(() => (this.workspaces.current() ? `${this.base()}/categories?includeArchived=true` : undefined));
  readonly tagsUrl = computed(() => (this.workspaces.current() ? `${this.base()}/tags` : undefined));

  /** What each category moved between two days, in the base currency. Undefined until a workspace is selected. */
  totalsUrl(range: { from: string; to: string }): string | undefined {
    return this.workspaces.current() ? `${this.base()}/transactions/category-totals?from=${range.from}&to=${range.to}` : undefined;
  }

  create(request: CreateCategoryRequest): Promise<Category> {
    return firstValueFrom(this.http.post<Category>(`${this.base()}/categories`, request));
  }

  update(categoryId: string, request: UpdateCategoryRequest): Promise<Category> {
    return firstValueFrom(this.http.patch<Category>(`${this.base()}/categories/${categoryId}`, request));
  }

  setTags(categoryId: string, tags: readonly string[]): Promise<Category> {
    return firstValueFrom(this.http.put<Category>(`${this.base()}/categories/${categoryId}/tags`, { tags }));
  }

  archive(categoryId: string): Promise<Category> {
    return firstValueFrom(this.http.post<Category>(`${this.base()}/categories/${categoryId}/archive`, null));
  }

  restore(categoryId: string): Promise<Category> {
    return firstValueFrom(this.http.post<Category>(`${this.base()}/categories/${categoryId}/restore`, null));
  }

  seedDefaults(): Promise<SeededCategories> {
    return firstValueFrom(this.http.post<SeededCategories>(`${this.base()}/categories/defaults`, null));
  }

  archiveTag(tagId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.base()}/tags/${tagId}/archive`, null));
  }
}
