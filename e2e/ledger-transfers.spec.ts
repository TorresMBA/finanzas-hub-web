import { Locator, Page, expect, test } from '@playwright/test';
import { GREETING, signUp } from './support';

async function openAccount(page: Page, name: string, balance: string, currency?: string): Promise<void> {
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await dialog.getByLabel('Nombre').fill(name);
  if (currency) {
    await dialog.getByLabel('Moneda').selectOption(currency);
  }

  await dialog.getByLabel('Saldo actual (opcional)').fill(balance);
  await dialog.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText(`Cuenta «${name}» creada.`);
}

async function openCard(page: Page, name: string, limit: string, paymentDay: string): Promise<void> {
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await dialog.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByLabel('Línea de crédito').fill(limit);
  await dialog.getByLabel('Día de pago').fill(paymentDay);
  await dialog.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('status')).toHaveText(`Tarjeta «${name}» creada.`);
}

async function postTransaction(page: Page, fields: { type: 'Gasto' | 'Ingreso'; amount: string; description: string; category: string; account: string }): Promise<void> {
  await page.getByRole('button', { name: 'Nueva transacción' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva transacción' });
  await dialog.getByRole('button', { name: fields.type, exact: true }).click();
  await dialog.getByLabel(/^Monto/).fill(fields.amount);
  await dialog.getByLabel('Descripción').fill(fields.description);
  await dialog.getByLabel('Categoría').selectOption({ label: fields.category });
  await dialog.getByLabel(/^Cuenta/).selectOption({ label: fields.account });
  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await expect(dialog).toBeHidden();
}

/** The three figures at the top of Cuentas: net worth, what is owned and what is owed. */
function netWorth(page: Page): Locator {
  return page.getByRole('list', { name: 'Patrimonio' }).getByRole('listitem');
}

test.describe('transfers, cards and net worth', () => {
  test('transferring 500 moves them between two accounts and leaves net worth where it was', async ({ page }) => {
    await signUp(page);
    await page.goto('/accounts');
    await openAccount(page, 'BCP', '1000');
    await openAccount(page, 'Interbank', '200');
    await expect(netWorth(page).first()).toContainText('S/ 1,200.00');

    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Nueva transacción' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva transacción' });
    await form.getByRole('button', { name: 'Transferencia', exact: true }).click();
    await expect(form).toContainText('No es un ingreso ni un gasto');
    await expect(form.getByLabel('Categoría')).toHaveCount(0);

    // The form says what is missing, and refuses the same account on both sides.
    await form.getByRole('button', { name: 'Registrar' }).click();
    await expect(form.getByRole('alert')).toHaveText(['Escribe el monto.', 'Elige una cuenta.', 'Elige la cuenta que recibe.']);
    await form.getByLabel(/^Monto/).fill('500');
    await form.getByLabel('Desde').selectOption({ label: 'BCP · PEN' });
    await form.getByLabel('Hacia').selectOption({ label: 'BCP · PEN' });
    await form.getByRole('button', { name: 'Registrar' }).click();
    await expect(form.getByRole('alert')).toHaveText('Elige una cuenta distinta de la de origen.');
    await form.getByLabel('Hacia').selectOption({ label: 'Interbank · PEN' });
    await form.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByRole('status')).toHaveText('Transferencia de S/ 500.00 registrada.');

    // One row, without a sign, and no income or expense in the summary.
    const list = page.getByRole('region', { name: 'Movimientos' });
    const row = list.getByRole('button', { name: /^Transferencia/ });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('BCP → Interbank');
    await expect(row).toContainText('S/ 500.00');
    await expect(row).not.toContainText('−');
    await expect(page.getByLabel('Resumen en PEN')).toHaveCount(0);

    await page.getByRole('button', { name: 'Transferencias', exact: true }).click();
    await expect(list.getByRole('button')).toHaveCount(1);

    await page.goto('/accounts');
    await expect(page.getByRole('button', { name: /^BCP/ })).toContainText('S/ 500.00');
    await expect(page.getByRole('button', { name: /^Interbank/ })).toContainText('S/ 700.00');
    await expect(netWorth(page).first()).toContainText('S/ 1,200.00');
    await expect(page.getByRole('complementary', { name: 'Detalle de la cuenta' })).toContainText('hacia Interbank');

    // Voiding gives the 500 back to the account they left.
    await page.goto('/transactions');
    await row.click();
    const detail = page.getByRole('complementary', { name: 'Detalle del movimiento' });
    await expect(detail).toContainText('Desde');
    await expect(detail.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await detail.getByRole('button', { name: 'Anular' }).click();
    await detail.getByRole('button', { name: 'Sí, anular' }).click();
    await expect(page.getByRole('status')).toContainText('«Transferencia» anulado');

    await page.goto('/accounts');
    await expect(page.getByRole('button', { name: /^BCP/ })).toContainText('S/ 1,000.00');
    await expect(page.getByRole('button', { name: /^Interbank/ })).toContainText('S/ 200.00');
  });

  test('a purchase on a credit card reduces what is available and paying the card gives it back', async ({ page }) => {
    await signUp(page);
    await page.goto('/accounts');
    await openAccount(page, 'BCP', '1000');
    await openCard(page, 'Visa', '5000', '5');
    const card = page.getByRole('button', { name: /^Visa/ });
    await expect(card).toContainText('Disponible S/ 5,000.00 de S/ 5,000.00');

    await page.goto('/transactions');
    await postTransaction(page, { type: 'Gasto', amount: '200', description: 'Wong', category: 'Supermercado', account: 'Visa · PEN' });

    await page.goto('/accounts');
    await expect(card).toContainText('S/ 200.00');
    await expect(card).toContainText('Disponible S/ 4,800.00 de S/ 5,000.00');
    await expect(netWorth(page)).toContainText(['S/ 800.00', 'S/ 1,000.00', 'S/ 200.00']);

    await card.click();
    const detail = page.getByRole('complementary', { name: 'Detalle de la cuenta' });
    await expect(detail).toContainText('Deuda');
    await expect(detail).toContainText('Próximo pago');
    await detail.getByRole('button', { name: 'Pagar tarjeta' }).click();
    const payment = page.getByRole('dialog', { name: 'Pagar tarjeta' });
    await expect(payment).toContainText('«Visa» debe S/ 200.00');
    // The only account with money is already chosen and the amount starts at what is owed.
    await expect(payment.getByLabel('Pagar desde')).toHaveValue(/.+/);
    await expect(payment.getByLabel(/^Monto del pago/)).toHaveValue('200.00');
    await payment.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByRole('status')).toHaveText('Pago de S/ 200.00 a «Visa» registrado.');

    await expect(card).toContainText('S/ 0.00');
    await expect(card).toContainText('Disponible S/ 5,000.00 de S/ 5,000.00');
    await expect(page.getByRole('button', { name: /^BCP/ })).toContainText('S/ 800.00');
    // Paying a debt is not spending: net worth is where the purchase left it.
    await expect(netWorth(page)).toContainText(['S/ 800.00', 'S/ 800.00', 'S/ 0.00']);

    await page.goto('/transactions');
    const list = page.getByRole('region', { name: 'Movimientos' });
    await expect(list.getByRole('button', { name: /^Pago de tarjeta/ })).toContainText('BCP → Visa');
    await expect(page.getByLabel('Resumen en PEN')).toContainText('S/ 200.00');
  });

  test('another currency counts in net worth once it has a rate, an account can be left out, and Inicio shows the month', async ({ page }) => {
    await signUp(page, 'Brian');
    await page.goto('/');
    await expect(page.getByText('Tu resumen empieza con una cuenta')).toBeVisible();
    await page.getByRole('link', { name: 'Crear una cuenta' }).click();
    await expect(page).toHaveURL(/\/accounts$/);

    await openAccount(page, 'BCP', '1000');
    await openAccount(page, 'Ahorro en dólares', '100', 'USD');
    await expect(page.getByText('Falta el tipo de cambio de USD')).toBeVisible();
    await expect(netWorth(page).first()).toContainText('S/ 1,000.00');

    await page.getByRole('button', { name: 'Definir' }).click();
    const rate = page.getByRole('dialog', { name: 'Tipo de cambio de USD' });
    await rate.getByLabel(/^1 USD equivale a/).fill('3.75');
    await rate.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('status')).toHaveText('Tipo de cambio guardado: 1 USD = 3.75 PEN.');
    await expect(netWorth(page).first()).toContainText('S/ 1,375.00');
    await expect(page.getByRole('list', { name: 'Tipos de cambio' })).toContainText('1 USD = 3.75 PEN');

    // The person takes the dollars out of the net worth: the account stays, the total drops.
    await page.getByRole('button', { name: /^Ahorro en dólares/ }).click();
    const detail = page.getByRole('complementary', { name: 'Detalle de la cuenta' });
    await detail.getByRole('button', { name: 'Editar' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar cuenta' });
    await expect(edit.getByRole('checkbox')).toBeChecked();
    await edit.getByRole('checkbox').uncheck();
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('status')).toHaveText('Cuenta «Ahorro en dólares» guardada.');
    await expect(netWorth(page).first()).toContainText('S/ 1,000.00');
    await expect(page.getByRole('button', { name: /^Ahorro en dólares/ })).toContainText('US$ 100.00');
    await expect(detail).toContainText('No cuenta en tu patrimonio');

    await page.goto('/transactions');
    await postTransaction(page, { type: 'Ingreso', amount: '4000', description: 'Sueldo', category: 'Sueldo', account: 'BCP · PEN' });
    await postTransaction(page, { type: 'Gasto', amount: '1200', description: 'Alquiler', category: 'Vivienda › Alquiler', account: 'BCP · PEN' });
    await postTransaction(page, { type: 'Gasto', amount: '20', description: 'Netflix', category: 'Suscripciones y ocio › Streaming', account: 'Ahorro en dólares · USD' });
    // Two currencies: the API also gives the month in soles, the dollars at the rate they were registered with.
    await expect(page.getByLabel('Resumen en PEN, todas las monedas')).toContainText('S/ 1,275.00');

    await page.getByRole('link', { name: 'Inicio' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: GREETING })).toBeVisible();
    await expect(page.getByText('Hola, Brian.')).toBeVisible();
    const figures = page.getByRole('list', { name: 'Cifras del mes' }).getByRole('listitem');
    await expect(figures).toContainText(['S/ 3,800.00', 'S/ 4,000.00', 'S/ 1,275.00', '68.1%']);
    const spent = page.getByRole('region', { name: 'En qué se fue' });
    await expect(spent.getByRole('listitem')).toContainText(['Vivienda', 'Suscripciones y ocio']);
    await expect(spent).toContainText('S/ 1,200.00');
    await expect(page.getByRole('region', { name: 'Últimos movimientos' }).getByRole('listitem')).toContainText(['Netflix', 'Alquiler', 'Sueldo']);
    await expect(page.getByRole('region', { name: 'Tus cuentas' })).toContainText('S/ 3,800.00');
    await expect(page.getByRole('region', { name: 'Flujo de los últimos 6 meses' }).getByRole('listitem')).toHaveCount(6);

    // What each category moved shows up in Categorías too.
    await page.goto('/categories');
    await expect(page.getByRole('button', { name: /^Vivienda/ })).toContainText('S/ 1,200.00 en');
  });

  test('on a phone Inicio and a credit card fit without overflowing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signUp(page);
    await page.goto('/accounts');
    await openAccount(page, 'Cuenta sueldo con un nombre bastante largo', '12345.67');
    await openCard(page, 'Tarjeta de crédito Visa Signature', '25000', '28');
    await page.goto('/transactions');
    await postTransaction(page, { type: 'Gasto', amount: '1999.90', description: 'Compra grande', category: 'Supermercado', account: 'Tarjeta de crédito Visa Signature · PEN' });

    for (const path of ['/', '/accounts', '/transactions']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/1,999\.90/).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }

    // The transfer form fits too, with its two accounts side by side.
    await page.getByRole('button', { name: 'Nueva transacción' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva transacción' });
    await form.getByRole('button', { name: 'Transferencia', exact: true }).click();
    await expect(form.getByLabel('Hacia')).toBeVisible();
    expect(await form.evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)).toBeLessThanOrEqual(0);
  });
});
