import { expect, test } from '@playwright/test';
import { GREETING, PASSWORD, newEmail, signUp } from './support';

test.describe('accounts', () => {
  test('a visitor is asked to sign in, registers, sets up the workspace and reaches the home page', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Faccounts$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hola de nuevo' })).toBeVisible();

    await page.getByRole('link', { name: 'Regístrate gratis' }).click();
    await page.getByLabel('Tu nombre').fill('Brian Quispe');
    await page.getByLabel('Correo').fill(newEmail('brian'));
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    // A new workspace has no currency yet: its owner is taken to set it up first.
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Configura tu espacio personal' })).toBeVisible();
    await page.getByLabel('Moneda principal').selectOption('USD');
    await page.getByRole('button', { name: 'Empezar' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: GREETING })).toBeVisible();
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
    await page.getByLabel('Contraseña', { exact: true }).fill('Otra-Clave-Larga-1');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.');

    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Metas' })).toBeVisible();
  });

  test('Brian invites Juan, who joins from the link Brian copies as a member and cannot invite anyone', async ({ page, browser }) => {
    await signUp(page, 'Brian');
    const juanEmail = newEmail('juan');

    await page.goto('/settings/workspace');
    await page.getByLabel('Correo').fill(juanEmail);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByRole('status')).toHaveText(`Invitación creada para ${juanEmail}.`);
    await expect(page.getByRole('list', { name: 'Invitaciones pendientes' }).getByText(juanEmail)).toBeVisible();

    // Brian hands the link over himself: it is on the screen, so joining does not depend on the email arriving.
    const link = await page.getByLabel('Enlace para aceptar la invitación').inputValue();
    expect(link).toMatch(/^http:\/\/localhost:4200\/invite\/[\w-]+$/);

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
    await expect(juan.getByRole('heading', { level: 1, name: GREETING })).toBeVisible();
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

  test('someone with a session open joins from the link, tells the two workspaces apart and sees the goal shared with them', async ({ page, browser }) => {
    await signUp(page, 'Brian');
    const juansBrowser = await browser.newContext();
    const juan = await juansBrowser.newPage();
    const { email: juanEmail } = await signUp(juan, 'Juan');

    // Juan already keeps his money here, in his own workspace.
    await juan.goto('/accounts');
    await juan.getByRole('button', { name: 'Nueva cuenta' }).click();
    const account = juan.getByRole('dialog', { name: 'Nueva cuenta' });
    await account.getByLabel('Nombre').fill('Interbank de Juan');
    await account.getByLabel('Saldo actual (opcional)').fill('1000');
    await account.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(account).toBeHidden();

    await page.goto('/settings/workspace');
    await page.getByLabel('Correo').fill(juanEmail);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    const link = await page.getByLabel('Enlace para aceptar la invitación').inputValue();

    // Juan already has an account and is signed in: the link offers to join, it does not send him to his home page.
    await juan.goto(link);
    await juan.getByRole('button', { name: 'Unirme a Personal' }).click();
    await expect(juan.getByRole('heading', { level: 1, name: GREETING })).toBeVisible();

    // He now has two workspaces called "Personal"; the one he joined says whose it is, and it is the one open.
    await juan.goto('/settings/workspace');
    const mine = juan.getByRole('list', { name: 'Tus espacios' }).getByRole('listitem');
    await expect(mine).toHaveCount(2);
    await expect(mine.filter({ hasText: 'Personal · de Brian' })).toContainText('Abierto');
    await expect(mine.filter({ hasText: 'Personal · de Brian' }).getByRole('button', { name: 'Salir', exact: true })).toBeVisible();

    // With Brian's workspace open his accounts are the ones he always had: he does not start from zero. Brian sees none of them.
    await juan.goto('/accounts');
    await expect(juan.getByText('Interbank de Juan').first()).toBeVisible();
    await page.goto('/accounts');
    await expect(page.getByText('Todavía no tienes cuentas')).toBeVisible();

    // Brian creates a goal with Juan in it, and Juan finds it.
    await page.goto('/goals');
    await page.getByRole('button', { name: 'Nueva meta' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva meta' });
    await form.getByLabel('Nombre').fill('Viaje Japón');
    await form.getByLabel(/^Objetivo/).fill('1000');
    await form.getByLabel('Juan').check();
    await form.getByRole('button', { name: 'Crear meta' }).click();
    await expect(page.getByRole('status')).toHaveText('Meta «Viaje Japón» creada.');

    await juan.goto('/goals');
    await expect(juan.getByRole('list', { name: 'Metas', exact: true })).toContainText('Viaje Japón');
    await expect(juan.getByRole('list', { name: 'Metas', exact: true })).toContainText('2 participantes');

    // From his own workspace the goal is not there: it belongs to Brian's. His accounts are, as everywhere.
    await juan.goto('/settings/workspace');
    await mine.filter({ hasNotText: 'de Brian' }).getByRole('button', { name: 'Abrir' }).click();
    await juan.goto('/goals');
    await expect(juan.getByText('Todavía no tienes metas')).toBeVisible();
    await juan.goto('/accounts');
    await expect(juan.getByText('Interbank de Juan').first()).toBeVisible();
    await juansBrowser.close();
  });
});
