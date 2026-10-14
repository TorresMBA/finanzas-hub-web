import { expect, test } from '@playwright/test';
import { signUp } from './support';

test('contributing 500 to a goal takes them from the account, shows as a transfer and raises the progress', async ({ page }) => {
  await signUp(page);
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const account = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await account.getByLabel('Nombre').fill('BCP');
  await account.getByLabel('Saldo actual (opcional)').fill('2000');
  await account.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(account).toBeHidden();

  await page.goto('/goals');
  await expect(page.getByText('Todavía no tienes metas')).toBeVisible();
  await page.getByRole('button', { name: 'Nueva meta' }).click();
  const form = page.getByRole('dialog', { name: 'Nueva meta' });
  await form.getByLabel('Nombre').fill('Viaje Japón');
  await form.getByLabel(/^Objetivo/).fill('1000');
  await form.getByRole('button', { name: 'Crear meta' }).click();
  await expect(page.getByRole('status')).toHaveText('Meta «Viaje Japón» creada.');

  const detail = page.getByRole('complementary', { name: 'Detalle de la meta' });
  await detail.getByRole('button', { name: 'Aportar' }).click();
  const money = page.getByRole('dialog', { name: 'Aportar a «Viaje Japón»' });
  await money.getByRole('button', { name: '+500' }).click();
  await money.getByRole('button', { name: 'Aportar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Aportaste S/ 500.00 a «Viaje Japón».');

  const card = page.getByRole('list', { name: 'Metas', exact: true }).getByRole('listitem');
  await expect(card).toContainText('S/ 500.00');
  await expect(card).toContainText('50%');
  await expect(detail).toContainText('Tú llevas S/ 500.00');
  await expect(detail.getByRole('button', { name: 'Retirar' })).toBeVisible();

  // In the ledger it is a transfer to the fund of the goal, and the account went down by 500.
  await page.goto('/transactions');
  await expect(page.getByText('Aporte a Viaje Japón').first()).toBeVisible();
  await page.goto('/accounts');
  await expect(page.getByText('Fondos de metas')).toBeVisible();
  await expect(page.getByText('Meta: Viaje Japón').first()).toBeVisible();
  await expect(page.getByText('S/ 1,500.00').first()).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tus metas' })).toBeVisible();
});
