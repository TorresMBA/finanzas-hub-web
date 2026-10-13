import { expect, test } from '@playwright/test';
import { signUp } from './support';

test.describe('categories', () => {
  test('a new person starts with the suggested categories and makes them their own', async ({ page }) => {
    await signUp(page);
    await page.goto('/categories');

    // Seeded when the workspace was set up.
    await expect(page.getByRole('heading', { level: 1, name: 'Categorías y etiquetas' })).toBeVisible();
    const list = page.getByRole('region', { name: 'Categorías' });
    await expect(list.getByRole('button', { name: /^Vivienda /, expanded: false })).toBeVisible();
    await expect(list.getByRole('button', { name: /^Sueldo / })).toBeVisible();

    // A new category with its look and tags.
    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva categoría' });
    await dialog.getByRole('button', { name: 'Crear categoría' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Escribe un nombre.');
    await dialog.getByLabel('Nombre').fill('Hijos');
    await dialog.getByRole('button', { name: 'Hijos' }).click();
    await dialog.getByRole('button', { name: 'Violeta' }).click();
    await dialog.getByLabel('Etiquetas sugeridas (opcional)').fill('familia, Colegio Nuevo');
    await dialog.getByRole('button', { name: 'Crear categoría' }).click();

    await expect(page.getByRole('status')).toHaveText('Categoría «Hijos» creada.');
    await expect(dialog).toBeHidden();
    const row = list.getByRole('listitem').filter({ hasText: 'Hijos' });
    await expect(row.getByRole('button', { name: /colegio-nuevo/ })).toBeVisible();

    // A subcategory inside it.
    await row.getByRole('button', { name: /^Hijos /, expanded: false }).click();
    await row.getByRole('button', { name: 'Agregar subcategoría' }).click();
    const subDialog = page.getByRole('dialog', { name: 'Nueva subcategoría' });
    await subDialog.getByLabel('Nombre').fill('Útiles');
    await subDialog.getByRole('button', { name: 'Crear subcategoría' }).click();
    await expect(row.getByText('Útiles')).toBeVisible();
    await expect(row.getByText('1 subcategoría · Gasto')).toBeVisible();

    // The same name again is refused, and the dialog stays to fix it.
    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    await dialog.getByLabel('Nombre').fill('hijos');
    await dialog.getByRole('button', { name: 'Crear categoría' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Ya tienes una categoría con ese nombre en el mismo lugar.');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    // Filtering by one of its tags.
    await page.getByRole('complementary', { name: 'Etiquetas' }).getByRole('button', { name: /familia/ }).click();
    await expect(list.getByRole('button', { name: /^Hijos / })).toBeVisible();
    await expect(list.getByRole('button', { name: /^Vivienda / })).toBeHidden();
    await page.getByRole('button', { name: 'Quitar filtro' }).click();

    // Archiving hides it; it comes back from the archived ones, with its subcategory.
    await page.getByRole('button', { name: 'Archivar Hijos' }).click();
    await expect(page.getByRole('status')).toContainText('«Hijos» archivada');
    await expect(list.getByRole('button', { name: /^Hijos / })).toBeHidden();
    await page.getByRole('button', { name: 'Archivadas (1)' }).click();
    await page.getByRole('button', { name: 'Restaurar Hijos' }).click();
    await expect(page.getByRole('status')).toHaveText('«Hijos» restaurada.');
    await expect(row.getByText('1 subcategoría · Gasto')).toBeVisible();

    // What was done is still there after a reload: it is saved, not only on screen.
    await page.reload();
    await expect(list.getByRole('button', { name: /^Hijos / })).toBeVisible();
  });

  test('the quick form adds a tag to a category and the tag can be archived', async ({ page }) => {
    await signUp(page);
    await page.goto('/categories');
    const list = page.getByRole('region', { name: 'Categorías' });
    const pets = list.getByRole('listitem').filter({ hasText: 'Mascotas' });

    await pets.getByRole('button', { name: 'Agregar etiqueta a Mascotas' }).click();
    await expect(page.getByLabel('Categoría destino')).toHaveValue(/.+/);
    await page.getByLabel('Nombre de la etiqueta').fill('Veterinario');
    await page.getByRole('button', { name: 'Crear etiqueta' }).click();

    await expect(page.getByRole('status')).toHaveText('Etiqueta agregada a «Mascotas».');
    await expect(pets.getByRole('button', { name: /veterinario/ })).toBeVisible();

    await pets.getByRole('button', { name: /veterinario/ }).click();
    await page.getByRole('button', { name: 'Archivar etiqueta' }).click();
    await page.getByRole('button', { name: 'Sí, archivar' }).click();

    await expect(page.getByRole('status')).toHaveText('Etiqueta #veterinario archivada.');
    await expect(page.getByRole('button', { name: /veterinario/ })).toHaveCount(0);
    await expect(pets.getByRole('button', { name: /mascota$/ })).toBeVisible();
  });

  test('on a phone the page fits and the form opens as a sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    await page.goto('/categories');

    await expect(page.getByRole('region', { name: 'Categorías' }).getByRole('button', { name: /^Vivienda / })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    await expect(page.getByRole('dialog', { name: 'Nueva categoría' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
