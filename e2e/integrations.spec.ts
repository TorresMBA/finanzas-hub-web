import { expect, test } from '@playwright/test';
import { signUp } from './support';

const BLUECOINS = [
  'Type,Date,Set Time,Title,Amount,Currency,Exchange Rate,Category Group Name,Category,Account,Notes,Labels,Status',
  'New Account,2026-09-01 08:00,,Efectivo,200.00,PEN,1,,(New Account),Efectivo,,,',
  'Expense,2026-10-01 13:20,,"Almuerzo, con equipo",-42.50,PEN,1,Salidas,Menú del día,Efectivo,,,',
  'Transfer,2026-10-03 10:00,,Retiro cajero,-300.00,PEN,1,(Transfer),(Transfer),BCP,,,',
  'Transfer,2026-10-03 10:00,,Retiro cajero,300.00,PEN,1,(Transfer),(Transfer),Efectivo,,,',
].join('\n');

test('a Bluecoins export comes in with its own account and category, and importing it again adds nothing', async ({ page }) => {
  await signUp(page, 'Brian');
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const account = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await account.getByLabel('Nombre').fill('BCP');
  await account.getByLabel('Saldo actual (opcional)').fill('1000');
  await account.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(account).toBeHidden();

  const upload = async (): Promise<void> => {
    await page.goto('/integrations');
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'transactions_list.csv', mimeType: 'text/csv', buffer: Buffer.from(BLUECOINS) });
    await page.getByRole('button', { name: 'Leer archivo' }).click();
  };
  await upload();

  // BCP is his; Efectivo is not, so nothing is imported until he says where it goes.
  await expect(page.getByRole('status')).toContainText('Archivo leído');
  await expect(page.getByRole('list', { name: 'Resumen de la importación' })).toContainText('3 por resolver');
  await expect(page.getByRole('button', { name: /^Importar/ })).toBeDisabled();
  await page.getByLabel('Cuenta para Efectivo').selectOption({ label: 'Crear «Efectivo» (efectivo)' });
  await expect(page.getByLabel('Categoría para Salidas / Menú del día')).toHaveValue('new');

  await page.getByRole('button', { name: 'Importar 3 movimientos' }).click();
  await expect(page.getByRole('status')).toHaveText('3 movimientos importados. Ya están en tus cuentas.');

  await page.goto('/accounts');
  await expect(page.getByText('S/ 457.50').first()).toBeVisible();
  await expect(page.getByText('S/ 700.00').first()).toBeVisible();

  // The same file again: everything is already in his accounts.
  await upload();
  await expect(page.getByRole('list', { name: 'Resumen de la importación' })).toContainText('3 ya registrados');
  await expect(page.getByRole('button', { name: 'Importar 0 movimientos' })).toBeDisabled();
  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByRole('status')).toContainText('Nada entró a tus cuentas');
});
