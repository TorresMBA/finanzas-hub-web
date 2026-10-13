import { Page, expect, test } from '@playwright/test';
import { signUp } from './support';

async function openAccount(page: Page, name: string, balance: string): Promise<void> {
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByLabel('Saldo actual (opcional)').fill(balance);
  await dialog.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText(`Cuenta «${name}» creada.`);
}

async function spend(page: Page, amount: string, description: string, category: string): Promise<void> {
  await page.getByRole('button', { name: 'Nueva transacción' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva transacción' });
  await dialog.getByRole('button', { name: 'Gasto', exact: true }).click();
  await dialog.getByLabel(/^Monto/).fill(amount);
  await dialog.getByLabel('Descripción').fill(description);
  await dialog.getByLabel('Categoría').selectOption({ label: category });
  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await expect(dialog).toBeHidden();
}

test('a budget of 450 with 498 spent is exceeded, and adjusting the limit puts it back', async ({ page }) => {
  await signUp(page);
  await page.goto('/accounts');
  await openAccount(page, 'BCP', '5000');

  await page.goto('/budgets');
  await expect(page.getByText('Todavía no tienes presupuestos')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo presupuesto' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo presupuesto' });
  await form.getByLabel('Categoría').selectOption({ label: 'Supermercado' });
  await form.getByLabel(/^Límite mensual/).fill('450');
  await form.getByRole('button', { name: 'Crear presupuesto' }).click();
  await expect(page.getByRole('status')).toHaveText('Presupuesto de S/ 450.00 al mes para «Supermercado» creado.');
  const row = page.getByRole('list', { name: 'Presupuestos' }).getByRole('listitem');
  await expect(row).toContainText('En ritmo');

  await page.goto('/transactions');
  await spend(page, '498', 'Wong', 'Supermercado');

  await page.goto('/budgets');
  await expect(row).toContainText('Excedido');
  await expect(row).toContainText('S/ 498.00 de S/ 450.00');
  const detail = page.getByRole('complementary', { name: 'Detalle del presupuesto' });
  await expect(detail).toContainText('Excediste el límite por S/ 48.00');
  await expect(detail).toContainText('Wong');

  await detail.getByRole('button', { name: 'Ajustar límite' }).click();
  const adjust = page.getByRole('dialog', { name: 'Ajustar «Supermercado»' });
  await adjust.getByLabel(/^Límite mensual/).fill('1200');
  await adjust.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toHaveText('«Supermercado» ahora tiene un límite de S/ 1,200.00 al mes.');
  await expect(row).not.toContainText('Excedido');

  // The home page measures the month against the budgets.
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Cifras del mes' })).toContainText('Presupuesto');
});
