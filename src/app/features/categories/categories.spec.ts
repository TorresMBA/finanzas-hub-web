import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Category, Tag } from '../../core/api/api-types';
import { apiErrorInterceptor } from '../../core/http/api-interceptors';
import { TEST_WORKSPACE, provideSession } from '../../core/testing/signed-in';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { Categories } from './categories';

const BASE = `/api/v1/workspaces/${TEST_WORKSPACE.id}`;
const CATEGORIES_URL = `${BASE}/categories?includeArchived=true`;
const TAGS_URL = `${BASE}/tags`;

const HOUSING: Category = {
  id: 'c-housing',
  kind: 'expense',
  name: 'Vivienda',
  icon: 'home',
  color: 'blue',
  isArchived: false,
  tags: ['fijo', 'hogar'],
  subcategories: [
    { id: 's-rent', name: 'Alquiler', isArchived: false },
    { id: 's-old', name: 'Cochera', isArchived: true },
  ],
};
const EDUCATION: Category = { id: 'c-education', kind: 'expense', name: 'Educación', icon: 'school', color: 'blue', isArchived: false, tags: ['deducible'], subcategories: [] };
const SALARY: Category = { id: 'c-salary', kind: 'income', name: 'Sueldo', icon: 'payments', color: 'green', isArchived: false, tags: ['fijo'], subcategories: [] };
const OLD: Category = { id: 'c-old', kind: 'expense', name: 'Gimnasio', icon: 'fitness_center', color: 'red', isArchived: true, tags: [], subcategories: [] };
const TAGS: Tag[] = [
  { id: 't-deducible', name: 'deducible', categoryCount: 1 },
  { id: 't-fijo', name: 'fijo', categoryCount: 2 },
  { id: 't-hogar', name: 'hogar', categoryCount: 1 },
];

describe('Categories', () => {
  let fixture: ComponentFixture<Categories>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([apiErrorInterceptor])), provideHttpClientTesting(), provideSession()] });
    await TestBed.inject(WorkspaceStore).ensureLoaded();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Categories);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  /** Answers the two requests the page makes when it opens and every time it reloads. */
  async function load(categories: Category[] = [HOUSING, EDUCATION, SALARY, OLD], tags: Tag[] = TAGS): Promise<void> {
    http.expectOne(CATEGORIES_URL).flush(categories);
    http.expectOne(TAGS_URL).flush(tags);
    await fixture.whenStable();
  }

  /**
   * Lets what a click or an answer started run and renders it. While a request is waiting for its answer the
   * application is not stable, so this cannot be whenStable.
   */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  const names = () => Array.from(element.querySelectorAll('.rows .names strong')).map((node) => node.textContent?.trim());
  const button = (name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((node) => (node.getAttribute('aria-label') ?? node.textContent?.trim()) === name)!;

  async function click(name: string): Promise<void> {
    button(name).click();
    await settle();
  }

  /** Opens the first category, Vivienda, to show its subcategories. */
  async function expandFirst(): Promise<void> {
    element.querySelector<HTMLButtonElement>('.rows .toggle')!.click();
    await settle();
  }

  async function type(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  it('shows placeholders while the categories load', async () => {
    expect(element.querySelectorAll('app-skeleton')).toHaveLength(5);
    expect(element.querySelector('.rows')).toBeNull();

    await load();
    expect(element.querySelector('app-skeleton')).toBeNull();
  });

  it('lists the active categories with their tags and counts what the person has', async () => {
    await load();

    expect(names()).toEqual(['Vivienda', 'Educación', 'Sueldo']);
    expect(Array.from(element.querySelectorAll('app-stat-card .value')).map((node) => node.textContent)).toEqual(['3', '1', '3']);
    expect(element.querySelector('.rows .names span')?.textContent).toBe('1 subcategoría · Gasto');
    expect(Array.from(element.querySelectorAll('.rows li:first-child .tags .tag')).map((node) => node.textContent?.trim())).toEqual(['#fijo', '#hogar', 'addEtiqueta']);
  });

  it('offers the suggested categories to someone who has none, and loads them', async () => {
    await load([], []);
    expect(element.querySelector('app-empty-state')?.textContent).toContain('Todavía no tienes categorías');

    await click('Usar las sugeridas');
    http.expectOne({ method: 'POST', url: `${BASE}/categories/defaults` }).flush({ created: 12 });
    await settle();
    await load();

    expect(names()).toHaveLength(3);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Categorías sugeridas cargadas');
  });

  it('says so when the categories cannot be loaded and retries', async () => {
    http.expectOne(CATEGORIES_URL).flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne(TAGS_URL).flush([]);
    await settle();
    expect(element.querySelector('app-error-state')?.textContent).toContain('No se pudieron cargar tus categorías');

    await click('Reintentar');
    await load();

    expect(names()).toHaveLength(3);
  });

  it('filters by kind, by text without minding accents, and by tag', async () => {
    await load();

    await click('Ingresos');
    expect(names()).toEqual(['Sueldo']);

    await click('Todas');
    await type(element.querySelector<HTMLInputElement>('input[type="search"]')!, 'educacion');
    expect(names()).toEqual(['Educación']);

    await type(element.querySelector<HTMLInputElement>('input[type="search"]')!, 'alquiler');
    expect(names()).toEqual(['Vivienda']);

    await type(element.querySelector<HTMLInputElement>('input[type="search"]')!, 'nada');
    expect(element.querySelector('.no-match')?.textContent).toBe('Ninguna categoría coincide con el filtro.');

    await type(element.querySelector<HTMLInputElement>('input[type="search"]')!, '');
    element.querySelector<HTMLButtonElement>('.cloud .tag:nth-child(2)')!.click();
    await settle();
    expect(names()).toEqual(['Vivienda', 'Sueldo']);
    expect(element.querySelector('.tag-filter')?.textContent).toContain('#fijo');
  });

  it('keeps archived categories and subcategories out of sight until asked', async () => {
    await load();
    await expandFirst();
    expect(Array.from(element.querySelectorAll('.sub-name')).map((node) => node.textContent)).toEqual(['Alquiler']);

    await click('Archivadas (2)');

    expect(names()).toEqual(['Vivienda', 'Educación', 'Sueldo', 'Gimnasio']);
    expect(Array.from(element.querySelectorAll('.sub-name')).map((node) => node.textContent)).toEqual(['Alquiler', 'Cochera']);
    expect(button('Restaurar Gimnasio')).toBeDefined();
    expect(button('Editar Gimnasio')).toBeUndefined();
  });

  it('archives a category and tells the person what that means', async () => {
    await load();

    await click('Archivar Educación');
    http.expectOne({ method: 'POST', url: `${BASE}/categories/c-education/archive` }).flush({ ...EDUCATION, isArchived: true });
    await settle();
    await load([HOUSING, { ...EDUCATION, isArchived: true }, SALARY, OLD]);

    expect(names()).toEqual(['Vivienda', 'Sueldo']);
    expect(element.querySelector('[role="status"]')?.textContent).toBe('«Educación» archivada. Ya no se ofrece al clasificar.');
  });

  it('adds a quick tag to the chosen category without losing the ones it had', async () => {
    await load();
    await click('Agregar etiqueta a Educación');
    await type(element.querySelector<HTMLInputElement>('.hash-input input')!, 'Colegio');

    await click('Crear etiqueta');

    const request = http.expectOne({ method: 'PUT', url: `${BASE}/categories/c-education/tags` });
    expect(request.request.body).toEqual({ tags: ['deducible', 'Colegio'] });
    request.flush(EDUCATION);
    await settle();
    await load();
    expect(element.querySelector<HTMLInputElement>('.hash-input input')?.value).toBe('');
  });

  it('refuses a tag the API would reject, before sending anything', async () => {
    await load();
    await type(element.querySelector<HTMLInputElement>('.hash-input input')!, 'a,b');

    await click('Crear etiqueta');

    expect(element.querySelector('[role="alert"]')?.textContent).toBe('Una etiqueta tiene hasta 40 letras, números o guiones.');
  });

  it('creates a category from the form, after asking for the name', async () => {
    await load();
    await click('addNueva categoría');
    const form = element.querySelector('app-category-form')!;
    expect(form.querySelector('h2')?.textContent).toBe('Nueva categoría');

    form.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(form.querySelector('[role="alert"]')?.textContent).toBe('Escribe un nombre.');

    const [name, tags] = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    await type(name, ' Hijos ');
    await type(tags, 'familia, colegio');
    await click('Ingreso');
    await click('Hijos');
    await click('Violeta');
    form.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/categories` });
    expect(request.request.body).toEqual({ kind: 'income', name: 'Hijos', icon: 'child_care', color: 'violet', tags: ['familia', 'colegio'] });
    request.flush({ ...SALARY, id: 'c-new', name: 'Hijos' });
    await settle();
    await load();

    expect(element.querySelector('app-category-form')).toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Categoría «Hijos» creada.');
  });

  it('creates a subcategory inside the category it was opened from, and keeps the form open when the API refuses', async () => {
    await load();
    await expandFirst();
    await click('addAgregar subcategoría');
    const form = element.querySelector('app-category-form')!;
    expect(form.querySelector('h2')?.textContent).toBe('Nueva subcategoría');
    expect(form.querySelector('.picker')).toBeNull();

    await type(form.querySelector<HTMLInputElement>('input[type="text"]')!, 'Alquiler');
    form.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const request = http.expectOne({ method: 'POST', url: `${BASE}/categories` });
    expect(request.request.body).toEqual({ name: 'Alquiler', parentId: 'c-housing' });
    request.flush({ code: 'categories.name_taken', detail: 'Taken.' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(element.querySelector('app-category-form [role="alert"]')?.textContent).toBe('Ya tienes una categoría con ese nombre en el mismo lugar.');
  });
});
