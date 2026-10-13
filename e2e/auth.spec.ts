import { expect, test } from '@playwright/test';
import { PASSWORD, linkEmailedTo, newEmail, signUp } from './support';

test.describe('accounts', () => {
  test('a visitor is asked to sign in, registers, sets up the workspace and reaches the home page', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Faccounts$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicia sesión' })).toBeVisible();

    await page.getByRole('link', { name: 'Crea una' }).click();
    await page.getByLabel('Tu nombre').fill('Brian Quispe');
    await page.getByLabel('Correo').fill(newEmail('brian'));
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    // A new workspace has no currency yet: its owner is taken to set it up first.
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Configura «Personal»' })).toBeVisible();
    await page.getByLabel('Moneda principal').selectOption('USD');
    await page.getByRole('button', { name: 'Empezar' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tu perfil: Brian Quispe' })).toHaveText('BQ');

    await page.goto('/settings/workspace');
    await expect(page.getByText('USD')).toBeVisible();
    await expect(page.getByText('Brian Quispe (tú)')).toBeVisible();
  });

  test('registering explains what is wrong with the form before anything is sent', async ({ page }) => {
    await page.goto('/register');

    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('alert')).toHaveText(['Escribe tu nombre.', 'Escribe tu correo.', 'Elige una contraseña.']);

    await page.getByLabel('Contraseña').fill('corta');
    await page.getByLabel('Tu nombre').fill('Brian');
    await page.getByLabel('Correo').fill('brian@');
    await expect(page.getByRole('alert')).toHaveText(['El correo no es válido.', /Mínimo 12 caracteres/]);
    await expect(page).toHaveURL(/\/register$/);
  });

  test('signing out ends the session and signing in brings it back', async ({ page }) => {
    const { email } = await signUp(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/goals');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fgoals$/);

    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill('Otra-Clave-Larga-1');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.');

    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Metas' })).toBeVisible();
  });

  test('Brian invites Juan, who joins from the emailed link as a member and cannot invite anyone', async ({ page, browser }) => {
    await signUp(page, 'Brian');
    const juanEmail = newEmail('juan');

    await page.goto('/settings/workspace');
    await page.getByLabel('Correo').fill(juanEmail);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByRole('status')).toHaveText(`Invitación enviada a ${juanEmail}.`);
    await expect(page.getByRole('list', { name: 'Invitaciones pendientes' }).getByText(juanEmail)).toBeVisible();

    const link = await linkEmailedTo(juanEmail, /http:\/\/localhost:4200\/invite\/[\w-]+/);

    // Juan is another person on another browser.
    const juansBrowser = await browser.newContext();
    const juan = await juansBrowser.newPage();
    await juan.goto(link);
    await expect(juan.getByText('Brian te invitó a unirte a Personal como miembro.')).toBeVisible();
    await juan.getByRole('link', { name: 'Crear mi cuenta y unirme' }).click();
    await expect(juan.getByLabel('Correo')).toHaveValue(juanEmail);
    await juan.getByLabel('Tu nombre').fill('Juan');
    await juan.getByLabel('Contraseña').fill(PASSWORD);
    await juan.getByRole('button', { name: 'Crear cuenta' }).click();

    // He opens on Brian's workspace, already set up, so there is no onboarding for him.
    await expect(juan.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await juan.goto('/settings/workspace');
    await expect(juan.getByText('Juan (tú)')).toBeVisible();
    await expect(juan.getByText('Brian', { exact: true })).toBeVisible();
    await expect(juan.getByRole('heading', { name: 'Invitar' })).toHaveCount(0);
    await expect(juan.getByRole('button', { name: 'Salir del espacio' })).toBeVisible();

    // Brian sees him at once and the invitation is no longer pending.
    await page.reload();
    await expect(page.getByText('Juan', { exact: true })).toBeVisible();
    await expect(page.getByText('Sin invitaciones pendientes')).toBeVisible();
    await juansBrowser.close();
  });
});
