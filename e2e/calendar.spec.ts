import { expect, test } from '@playwright/test';
import { signUp } from './support';

test('a monthly payment is scheduled, shows on its day and in the months to come, and can be paused', async ({ page }) => {
  await signUp(page);
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const account = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await account.getByLabel('Nombre').fill('BCP');
  await account.getByLabel('Saldo actual (opcional)').fill('5000');
  await account.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(account).toBeHidden();

  await page.goto('/calendar');
  await expect(page.getByText('Nada programado')).toBeVisible();
  await page.getByRole('button', { name: 'Programar movimiento' }).click();
  const form = page.getByRole('dialog', { name: 'Programar movimiento' });
  await form.getByLabel('Descripción').fill('Alquiler');
  await form.getByLabel(/^Monto/).fill('1800');
  await form.getByLabel('Categoría').selectOption({ label: 'Vivienda / Alquiler' });
  // Left to be confirmed by hand, so the day it falls on does not depend on the background process.
  await form.getByRole('checkbox').uncheck();
  await form.getByRole('button', { name: 'Programar' }).click();
  await expect(page.getByRole('status')).toHaveText('«Alquiler» programado: cada mes.');

  // It starts today, so it is already waiting to be registered, and counts in what is still to be paid.
  const today = page.locator('.panel').first();
  await expect(today).toContainText('Alquiler');
  await expect(page.getByRole('list', { name: 'Cifras del mes' })).toContainText('S/ 1,800.00');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('«Alquiler» registrado.');
  await expect(page.getByRole('list', { name: 'Cifras del mes' })).toContainText('S/ 3,200.00');

  // Next month it is there again, only expected.
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(page.locator('.pill.is-planned', { hasText: 'Alquiler' })).toBeVisible();

  const rules = page.getByRole('list', { name: 'Movimientos programados' });
  await rules.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('status')).toHaveText('«Alquiler» en pausa.');
  await expect(page.locator('.pill', { hasText: 'Alquiler' })).toHaveCount(0);
});
