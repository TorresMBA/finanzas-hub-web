import { expect, test } from '@playwright/test';
import { signUp } from './support';

test('crossing 90 % of a budget raises the badge without reloading and leaves a notice in the inbox', async ({ page }) => {
  await signUp(page);
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const account = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await account.getByLabel('Nombre').fill('BCP');
  await account.getByLabel('Saldo actual (opcional)').fill('5000');
  await account.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(account).toBeHidden();

  await page.goto('/budgets');
  await page.getByRole('button', { name: 'Nuevo presupuesto' }).click();
  const budget = page.getByRole('dialog', { name: 'Nuevo presupuesto' });
  await budget.getByLabel('Categoría').selectOption({ label: 'Supermercado' });
  await budget.getByLabel(/^Límite mensual/).fill('400');
  await budget.getByRole('button', { name: 'Crear presupuesto' }).click();
  await expect(budget).toBeHidden();

  // From here on the page is never reloaded: the badge can only change because the hub said so.
  await page.getByRole('link', { name: 'Transacciones' }).first().click();
  await expect(page.getByRole('link', { name: 'Notificaciones', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Nueva transacción' }).click();
  const expense = page.getByRole('dialog', { name: 'Nueva transacción' });
  await expense.getByRole('button', { name: 'Gasto', exact: true }).click();
  await expense.getByLabel(/^Monto/).fill('370');
  await expense.getByLabel('Descripción').fill('Wong');
  await expense.getByLabel('Categoría').selectOption({ label: 'Supermercado' });
  await expense.getByRole('button', { name: 'Registrar' }).click();
  await expect(expense).toBeHidden();

  const bell = page.getByRole('link', { name: 'Notificaciones: 1 sin leer' });
  await expect(bell).toBeVisible();
  await expect(page.getByText('Ver en Notificaciones')).toBeVisible();

  await bell.click();
  const notice = page.getByRole('button', { name: /Supermercado al 92 %/ });
  await expect(notice).toBeVisible();
  await notice.click();
  await expect(page).toHaveURL(/\/budgets$/);
  await expect(page.getByRole('link', { name: 'Notificaciones', exact: true }).first()).toBeVisible();
});
