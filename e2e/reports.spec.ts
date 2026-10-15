import { expect, test } from '@playwright/test';
import { signUp } from './support';

test('the month report adds up the expenses, downloads as Excel, and the search finds them', async ({ page }) => {
  await signUp(page);
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const account = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await account.getByLabel('Nombre').fill('BCP');
  await account.getByLabel('Saldo actual (opcional)').fill('3000');
  await account.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(account).toBeHidden();

  await page.goto('/transactions');
  for (const [description, amount] of [['Wong', '120'], ['Wong', '80']]) {
    await page.getByRole('button', { name: 'Nueva transacción' }).click();
    const expense = page.getByRole('dialog', { name: 'Nueva transacción' });
    await expense.getByRole('button', { name: 'Gasto', exact: true }).click();
    await expense.getByLabel(/^Monto/).fill(amount);
    await expense.getByLabel('Descripción').fill(description);
    await expense.getByLabel('Categoría').selectOption({ label: 'Supermercado' });
    await expense.getByRole('button', { name: 'Registrar' }).click();
    await expect(expense).toBeHidden();
  }

  await page.goto('/reports');
  await expect(page.getByRole('list', { name: 'Cifras del periodo' })).toContainText('S/ 200.00');
  await expect(page.getByRole('list', { name: 'Reparto del gasto' })).toContainText('Supermercado');
  await expect(page.getByRole('list', { name: 'Comercios frecuentes' })).toContainText('Wong');
  await expect(page.getByRole('list', { name: 'Comercios frecuentes' })).toContainText('2 compras');

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/^finanzas-\d{4}-\d{2}\.xlsx$/);

  // The search of the top bar, from anywhere.
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await search.getByLabel('Buscar movimientos, cuentas y metas').fill('wong');
  await expect(search.getByRole('region', { name: 'Movimientos' }).getByRole('link')).toHaveCount(2);
  await search.getByRole('region', { name: 'Movimientos' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/transactions\?q=wong$/);
  await expect(page.getByLabel('Buscar movimientos')).toHaveValue('wong');
});
