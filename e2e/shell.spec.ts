import { expect, test } from '@playwright/test';
import { signUp } from './support';

// The three layouts of the mock.
const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 390, height: 844 };

test.describe('shell', () => {
  // The shell is for signed-in people with a workspace that is set up.
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test('desktop shows the full sidebar and navigates between sections', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');

    const sidebar = page.locator('app-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('Controla hoy, construye tu mañana')).toBeVisible();
    await expect(sidebar.getByRole('link')).toHaveCount(14); // brand + 13 sections
    await expect(page.locator('app-mobile-tab-bar')).toBeHidden();

    await sidebar.getByRole('link', { name: 'Metas' }).click();

    await expect(page).toHaveURL(/\/goals$/);
    await expect(page).toHaveTitle('Metas · FinanzasHub');
    await expect(page.getByRole('heading', { level: 1, name: 'Metas' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Metas' })).toHaveAttribute('aria-current', 'page');
  });

  test('tablet collapses the sidebar to an icon rail', async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto('/');

    const sidebar = page.locator('app-sidebar');
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBe(84);
    await expect(sidebar.getByText('Movim.')).toBeVisible();
    await expect(sidebar.getByText('Transacciones', { exact: true })).toBeHidden();
    await expect(page.locator('app-mobile-tab-bar')).toBeHidden();
  });

  test('mobile uses the tab bar and reaches the other sections through "Más"', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');

    await expect(page.locator('app-sidebar')).toBeHidden();
    const tabs = page.locator('app-mobile-tab-bar');
    await expect(tabs).toBeVisible();

    await tabs.getByRole('button', { name: 'Más' }).click();
    const sheet = page.getByRole('dialog', { name: 'Todas las secciones' });
    await expect(sheet).toBeVisible();

    await sheet.getByRole('link', { name: 'Metas' }).click();

    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Metas' })).toBeVisible();
  });

  test('the theme toggle switches and remembers the theme', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
    await expect(root).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(root).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('API through the dev server proxy', () => {
  test('the API is ready', async ({ request }) => {
    const response = await request.get('/health/ready');

    expect(response.status(), 'Start the API on http://localhost:5166 before running the end-to-end tests').toBe(200);
    expect(await response.text()).toBe('Healthy');
  });

  test('an API call without a session is answered with a 401 problem document', async ({ request }) => {
    const response = await request.get('/api/v1/workspaces/00000000-0000-0000-0000-000000000001/sample-notes');

    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    expect((await response.json()).code).toBe('auth.unauthenticated');
  });
});
