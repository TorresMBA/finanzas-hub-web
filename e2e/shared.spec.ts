import { Page, expect, test } from '@playwright/test';
import { GREETING, signUp } from './support';

async function openGroup(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Grupos' }).getByRole('button', { name: new RegExp(name) }).click();
}

async function openAccount(page: Page, name: string, balance: string): Promise<void> {
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByLabel('Saldo actual (opcional)').fill(balance);
  await dialog.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(dialog).toBeHidden();
}

test('a dinner of 300 split between two: Juan pays his half from his account and the dinner is settled for both', async ({ page, browser }) => {
  await signUp(page, 'Brian');
  const juansBrowser = await browser.newContext();
  const juan = await juansBrowser.newPage();
  const { email: juanEmail } = await signUp(juan, 'Juan');
  await openAccount(juan, 'Interbank', '1000');

  // Juan joins Brian's workspace with the link Brian gives him.
  await page.goto('/settings/workspace');
  await page.getByLabel('Correo').fill(juanEmail);
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await juan.goto(await page.getByLabel('Enlace para aceptar la invitación').inputValue());
  await juan.getByRole('button', { name: 'Unirme a Personal' }).click();
  await expect(juan.getByRole('heading', { level: 1, name: GREETING })).toBeVisible();

  // Brian makes a group with Juan and registers the dinner he paid, split in equal parts.
  await page.goto('/shared');
  await page.getByRole('button', { name: 'Nuevo grupo' }).click();
  const group = page.getByRole('dialog', { name: 'Nuevo grupo' });
  await group.getByLabel('Nombre').fill('Depa');
  await group.getByLabel('Juan').check();
  await group.getByRole('button', { name: 'Crear grupo' }).click();
  await expect(page.getByRole('status')).toHaveText('Grupo «Depa» creado.');

  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  const expense = page.getByRole('dialog', { name: 'Nuevo gasto compartido' });
  await expense.getByLabel('Descripción').fill('Cena');
  await expense.getByLabel(/^Monto total/).fill('300');
  await expect(expense.getByRole('list', { name: 'Quiénes participan' })).toContainText('S/ 150.00');
  await expense.getByRole('button', { name: 'Registrar gasto' }).click();
  await expect(page.getByRole('status')).toHaveText('«Cena» de S/ 300.00 registrado y dividido.');
  // The card of the group already says it, the group says with whom, and the expense who has not repaid yet.
  await expect(page.getByRole('navigation', { name: 'Grupos' })).toContainText('Te deben S/ 150.00');
  await expect(page.getByRole('list', { name: 'Deudas' })).toContainText('Juan te paga');
  await expect(page.getByRole('list', { name: 'Deudas' })).toContainText('S/ 150.00');
  await page.getByRole('tab', { name: 'Actividad' }).click();
  await page.getByRole('region', { name: 'Actividad' }).getByText('Cena').click();
  await expect(page.getByRole('list', { name: 'Quién pagó su parte de Cena' })).toContainText('Debe S/ 150.00');

  // Juan sees in the summary what he owes to whom, and in the group pays it from the account he already had.
  await juan.goto('/shared');
  await expect(juan.getByRole('list', { name: 'Por persona' })).toContainText('Depa: le debes S/ 150.00');
  await openGroup(juan, 'Depa');
  const activity = juan.getByRole('region', { name: 'Actividad' });
  const pay = async (): Promise<void> => {
    await juan.getByRole('tab', { name: /Saldos/ }).click();
    await juan.getByRole('button', { name: 'Registrar pago' }).click();
    const payment = juan.getByRole('dialog', { name: 'Pagar a Brian' });
    await payment.getByRole('checkbox').check();
    await payment.getByLabel(/^Cuenta/).selectOption({ label: 'Interbank' });
    await payment.getByLabel(/^Categoría/).selectOption({ label: 'Supermercado' });
    await payment.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(juan.getByRole('status')).toHaveText('Pagaste S/ 150.00 a Brian.');
    await juan.getByRole('tab', { name: 'Actividad' }).click();
  };
  await pay();
  await expect(activity).toContainText('Liquidado');

  // He voids it: the debt is back and the movement left his account too, so paying again does not leave two.
  await activity.getByRole('button', { name: 'Anular' }).click();
  await expect(juan.getByRole('status')).toContainText('Pago anulado');
  await expect(activity).toContainText('Debes S/ 150.00');
  await juan.goto('/accounts');
  await expect(juan.getByText('S/ 1,000.00').first()).toBeVisible();
  await juan.goto('/shared');
  await openGroup(juan, 'Depa');
  await pay();
  await expect(activity).toContainText('Liquidado');
  await juan.getByRole('tab', { name: /Saldos/ }).click();
  await expect(juan.getByRole('list', { name: 'Deudas' })).toContainText('Estás a mano con todos');

  // His account went down by what he paid.
  await juan.goto('/accounts');
  await expect(juan.getByText('S/ 850.00').first()).toBeVisible();

  // Brian is even with everyone, and finds the dinner settled and the payment with who and how much.
  await page.goto('/shared');
  await expect(page.getByRole('list', { name: 'Por persona' })).toContainText('Estás a mano con todos');
  await openGroup(page, 'Depa');
  await page.getByRole('tab', { name: 'Actividad' }).click();
  await expect(page.getByRole('region', { name: 'Actividad' })).toContainText('Liquidado');
  await expect(page.getByRole('region', { name: 'Actividad' })).toContainText('Juan → ti');
  await expect(page.getByRole('region', { name: 'Actividad' })).toContainText('Recibiste S/ 150.00');

  // On a phone the list of groups goes above the group, and nothing is wider than the screen.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.getByRole('navigation', { name: 'Grupos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Actividad' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await juansBrowser.close();
});
