import { expect, test } from '@playwright/test';
import { signUp } from './support';

test('a term deposit of 15,000 lowers the account but leaves the net worth and the expenses of the month as they were', async ({ page }) => {
  await signUp(page);
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const account = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await account.getByLabel('Nombre').fill('BCP');
  await account.getByLabel('Saldo actual (opcional)').fill('20000');
  await account.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(account).toBeHidden();

  await page.goto('/investments');
  await page.getByRole('button', { name: 'Registrar inversión' }).first().click();
  const form = page.getByRole('dialog', { name: 'Registrar inversión' });
  await form.getByLabel('Tipo').selectOption({ label: 'Depósito a plazo' });
  await form.getByLabel('Nombre').fill('Plazo fijo BCP');
  await form.getByLabel('Desde la cuenta').selectOption({ label: 'BCP · PEN' });
  await form.getByLabel(/^Monto/).fill('15000');
  await form.getByLabel('TEA (%)').fill('6');
  await form.getByLabel('Plazo (días)').fill('360');
  await expect(form).toContainText('Al vencer valdrá unos S/ 15,900.00');
  await form.getByRole('button', { name: 'Registrar inversión' }).click();
  await expect(form).toBeHidden();

  await expect(page.getByRole('status')).toContainText('Registraste «Plazo fijo BCP»');
  await expect(page.getByRole('list', { name: 'Tu portafolio' })).toContainText('S/ 15,000.00');
  await expect(page.getByRole('complementary', { name: 'Detalle de Plazo fijo BCP' })).toContainText('S/ 15,900.00');

  // The account went down; the net worth and the expenses of the month did not move.
  await page.goto('/accounts');
  await expect(page.getByText('S/ 5,000.00').first()).toBeVisible();
  await page.goto('/');
  const kpis = page.getByRole('list', { name: 'Cifras del mes' });
  await expect(kpis.getByRole('listitem').filter({ hasText: 'Patrimonio' })).toContainText('S/ 20,000.00');
  await expect(kpis.getByRole('listitem').filter({ hasText: 'Gastos' })).toContainText('S/ 0.00');
});
