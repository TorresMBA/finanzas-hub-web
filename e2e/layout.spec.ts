import { expect, test } from '@playwright/test';
import { signUp } from './support';

// Desktop in the dark theme is what every phase checked by eye; these are the two layouts that were left out.
const SIZES = [
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'movil', width: 390, height: 844 },
];

const SECTIONS = [
  { path: '/', heading: /Hola|Inicio/ },
  { path: '/transactions', heading: 'Transacciones' },
  { path: '/accounts', heading: 'Cuentas' },
  { path: '/budgets', heading: 'Presupuestos' },
  { path: '/goals', heading: 'Metas' },
  { path: '/calendar', heading: 'Calendario' },
  { path: '/shared', heading: 'Gastos compartidos' },
  { path: '/investments', heading: 'Inversiones' },
  { path: '/reports', heading: 'Reportes' },
  { path: '/categories', heading: 'Categorías y etiquetas' },
  { path: '/integrations', heading: 'Integraciones' },
  { path: '/notifications', heading: 'Notificaciones' },
  { path: '/settings/profile', heading: /Configuración|Perfil/ },
];

const today = new Date();
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

test.describe('layout', () => {
  test('every section fits a tablet and a phone in the light theme, with data on screen', async ({ page }, info) => {
    test.setTimeout(180_000);
    const { workspaceId } = await signUp(page);
    const api = `/api/v1/workspaces/${workspaceId}`;
    const post = (url: string, data: object) => page.request.post(`${api}${url}`, { data, headers: { 'Idempotency-Key': crypto.randomUUID() } });

    // Enough for each screen to show its data state instead of its empty one.
    const account = await (await post('/accounts', { name: 'BCP Sueldo', type: 'bank', currency: 'PEN', openingBalance: 4200 })).json();
    const categories = await (await page.request.get(`${api}/categories?kind=expense`)).json();
    const groceries = categories.find((category: { name: string }) => category.name === 'Supermercado');
    await post('/transactions', { type: 'expense', accountId: account.id, amount: 320.5, categoryId: groceries.id, occurredOn: day, description: 'Wong' });
    await post('/budgets', { categoryId: groceries.id, amount: 900, alertThresholdPercent: 90 });
    await post('/goals', { name: 'Viaje a Cusco', targetAmount: 3000 });
    await post('/shared-groups', { name: 'Depa', memberUserIds: [], icon: 'home' });

    await page.addInitScript(() => localStorage.setItem('ph.theme', 'light'));
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const section of SECTIONS) {
        await page.goto(section.path);
        await expect(page.getByRole('heading', { level: 1, name: section.heading }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('light');

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${section.path} at ${size.width}px overflows sideways`).toBeLessThanOrEqual(0);

        const name = `${size.name}${section.path.replaceAll('/', '-') || '-inicio'}`.replace(/-$/, '-inicio');
        await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
      }
    }
  });
});
