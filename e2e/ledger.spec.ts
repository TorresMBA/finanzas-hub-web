import { Page, expect, test } from '@playwright/test';
import { signUp } from './support';

async function openAccount(page: Page, name: string, balance: string, type = 'Banco'): Promise<void> {
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByRole('button', { name: type, exact: true }).click();
  await dialog.getByLabel('Saldo actual (opcional)').fill(balance);
  await dialog.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText(`Cuenta «${name}» creada.`);
}

async function postTransaction(page: Page, fields: { type?: 'Gasto' | 'Ingreso'; amount: string; description: string; category: string; pending?: boolean; tag?: string }): Promise<void> {
  await page.getByRole('button', { name: 'Nueva transacción' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva transacción' });
  await dialog.getByRole('button', { name: fields.type ?? 'Gasto', exact: true }).click();
  await dialog.getByLabel(/^Monto/).fill(fields.amount);
  await dialog.getByLabel('Descripción').fill(fields.description);
  await dialog.getByLabel('Categoría').selectOption({ label: fields.category });
  if (fields.pending || fields.tag) {
    // The less common details wait behind a disclosure.
    await dialog.getByRole('button', { name: /^Etiquetas, comercio, nota/ }).click();
  }

  if (fields.tag) {
    // The category offers its tags; one click adds one.
    await dialog.getByRole('button', { name: new RegExp(String.raw`^\+ #?${fields.tag}$`) }).click();
  }

  if (fields.pending) {
    await dialog.getByRole('switch', { name: /Pendiente de revisar/ }).click();
  }

  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('ledger', () => {
  test('an account with 1,000 shows 946 after a 54 expense and 1,000 again once it is voided', async ({ page }) => {
    await signUp(page);
    await page.goto('/accounts');
    await expect(page.getByText('Todavía no tienes cuentas')).toBeVisible();

    await openAccount(page, 'BCP Sueldo', '1000');
    const card = page.getByRole('button', { name: /^BCP Sueldo/ });
    await expect(card).toContainText('S/ 1,000.00');
    await expect(page.getByRole('complementary', { name: 'Detalle de la cuenta' })).toContainText('Saldo inicial');

    await page.goto('/transactions');
    await postTransaction(page, { amount: '54', description: 'Wong', category: 'Supermercado' });
    await expect(page.getByRole('status')).toHaveText('Gasto de S/ 54.00 registrado.');
    const list = page.getByRole('region', { name: 'Movimientos' });
    await expect(list.getByRole('button', { name: /Wong/ })).toContainText('−S/ 54.00');
    await expect(page.locator('app-transactions-summary')).toContainText('Gastos');
    await expect(page.locator('app-transactions-summary')).toContainText('S/ 54.00');

    await page.goto('/accounts');
    await expect(page.getByRole('button', { name: /^BCP Sueldo/ })).toContainText('S/ 946.00');

    // Voiding gives the money back and takes the movement out of the list.
    await page.goto('/transactions');
    await list.getByRole('button', { name: /Wong/ }).click();
    const detail = page.getByRole('complementary', { name: 'Detalle del movimiento' });
    await expect(detail).toContainText('Supermercado');
    await detail.getByRole('button', { name: 'Anular' }).click();
    await detail.getByLabel('Motivo (opcional)').fill('Duplicado');
    await detail.getByRole('button', { name: 'Sí, anular' }).click();
    await expect(page.getByRole('status')).toContainText('«Wong» anulado');
    await expect(list.getByRole('button', { name: /Wong/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Más filtros' }).click();
    await page.getByRole('button', { name: 'Anuladas' }).click();
    await expect(list.getByRole('button', { name: /Wong/ })).toContainText('Anulada');

    await page.goto('/accounts');
    await expect(page.getByRole('button', { name: /^BCP Sueldo/ })).toContainText('S/ 1,000.00');
  });

  test('a pending income is confirmed, edited and found again with the filters', async ({ page }) => {
    await signUp(page);
    await page.goto('/accounts');
    await openAccount(page, 'BCP', '0');
    await page.goto('/transactions');
    await expect(page.getByText(/^Sin movimientos en /)).toBeVisible();

    // The form says what is missing before anything is sent.
    await page.getByRole('button', { name: 'Nueva transacción' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva transacción' });
    await form.getByRole('button', { name: 'Registrar' }).click();
    await expect(form.getByRole('alert')).toHaveText(['Escribe una descripción.', 'Escribe el monto.', 'Elige una categoría.']);
    await form.getByRole('button', { name: 'Cancelar' }).click();

    await postTransaction(page, { type: 'Ingreso', amount: '4500.50', description: 'Sueldo octubre', category: 'Sueldo', pending: true, tag: 'fijo' });
    await postTransaction(page, { amount: '80', description: 'Gasfitero', category: 'Vivienda › Mantenimiento' });
    const list = page.getByRole('region', { name: 'Movimientos' });
    await expect(list.getByRole('button', { name: /Sueldo octubre/ })).toContainText('Pendiente');
    await expect(page.locator('app-transactions-summary')).toContainText('+S/ 4,420.50');

    await list.getByRole('button', { name: /Sueldo octubre/ }).click();
    const detail = page.getByRole('complementary', { name: 'Detalle del movimiento' });
    await expect(detail).toContainText('#fijo');
    await detail.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('status')).toHaveText('«Sueldo octubre» confirmado.');
    await expect(detail.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);

    await detail.getByRole('button', { name: 'Editar' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar transacción' });
    await expect(edit.getByLabel(/^Monto/)).toHaveValue('4500.50');
    await edit.getByLabel(/^Monto/).fill('4600');
    await edit.getByLabel('Descripción').fill('Sueldo y bono');
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('status')).toHaveText('«Sueldo y bono» guardado.');
    await expect(list.getByRole('button', { name: /Sueldo y bono/ })).toContainText('+S/ 4,600.00');

    await page.getByRole('button', { name: 'Gastos', exact: true }).click();
    await expect(list.getByRole('button', { name: /Gasfitero/ })).toBeVisible();
    await expect(list.getByRole('button', { name: /Sueldo y bono/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Todas', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('bono');
    await expect(list.getByRole('button', { name: /Gasfitero/ })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('nada de nada');
    await expect(page.getByText('Sin resultados')).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(list.getByRole('button')).toHaveCount(2);

    // Saved, not only on screen.
    await page.reload();
    await expect(list.getByRole('button', { name: /Sueldo y bono/ })).toBeVisible();
  });

  test('a balance is corrected with an adjustment and an archived account keeps its money', async ({ page }) => {
    await signUp(page);
    await page.goto('/accounts');
    await openAccount(page, 'Efectivo', '200', 'Efectivo');
    await openAccount(page, 'BCP Dólares', '0');
    const detail = page.getByRole('complementary', { name: 'Detalle de la cuenta' });

    await page.getByRole('button', { name: /^Efectivo Efectivo/ }).click();
    await detail.getByRole('button', { name: 'Ajustar saldo' }).click();
    const adjust = page.getByRole('dialog', { name: 'Ajustar saldo' });
    await expect(adjust).toContainText('S/ 200.00');
    await adjust.getByLabel('Saldo real').fill('180,50');
    await adjust.getByRole('button', { name: 'Registrar ajuste' }).click();
    await expect(page.getByRole('status')).toHaveText('Saldo de «Efectivo» ajustado a S/ 180.50.');
    await expect(detail).toContainText('Ajuste de saldo');
    await expect(detail).toContainText('−S/ 19.50');

    // A second account with the same name is refused and the dialog stays.
    await page.getByRole('button', { name: 'Nueva cuenta' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' });
    await dialog.getByLabel('Nombre').fill('efectivo');
    await dialog.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Ya tienes una cuenta activa con ese nombre.');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await detail.getByRole('button', { name: 'Archivar' }).click();
    await expect(page.getByRole('status')).toContainText('«Efectivo» archivada');
    await expect(page.getByRole('button', { name: /^Efectivo Efectivo/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Archivadas (1)' }).click();
    await expect(page.getByRole('button', { name: /^Efectivo Efectivo/ })).toContainText('S/ 180.50');

    // An archived account is not offered for a new transaction.
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Nueva transacción' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva transacción' });
    // The only account left is chosen by itself, and it is the only one in the list.
    const picker = form.getByRole('combobox', { name: 'Cuenta' });
    await expect(picker).toContainText('BCP Dólares');
    await picker.click();
    await expect(form.getByRole('listbox', { name: 'Cuenta' }).getByRole('option')).toHaveCount(1);
  });

  test('on a phone the movement opens in a sheet and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    await page.goto('/accounts');
    await openAccount(page, 'BCP', '500');
    await page.goto('/transactions');
    await postTransaction(page, { amount: '25.90', description: 'Almuerzo con un nombre bastante largo para una pantalla pequeña', category: 'Restaurantes y delivery' });

    for (const path of ['/transactions', '/accounts']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('S/ 500.00').or(page.getByText('−S/ 25.90')).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }

    await page.goto('/transactions');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('region', { name: 'Movimientos' }).getByRole('button', { name: /Almuerzo/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Movimiento' });
    await expect(sheet).toContainText('−S/ 25.90');
    await expect(sheet.getByRole('button', { name: 'Anular' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});
