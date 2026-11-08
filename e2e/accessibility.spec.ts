import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { GREETING, signUp } from './support';

const SECTIONS = [
  { path: '/', heading: GREETING },
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

/**
 * WCAG 2.1 A and AA. Only serious and critical problems fail the test; the rest are printed.
 *
 * label-content-name-mismatch is left out: the icons are a ligature font, so axe reads the glyph's name ("chevron_left")
 * as visible text, although the icon is aria-hidden and what a person sees is an arrow.
 */
async function audit(page: import('@playwright/test').Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(['label-content-name-mismatch'])
    .analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  for (const violation of results.violations.filter((v) => !blocking.includes(v))) {
    console.log(`[${where}] ${violation.impact}: ${violation.id} (${violation.nodes.length})`);
  }

  expect(
    blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`),
    `Accessibility problems on ${where}`,
  ).toEqual([]);
}

test.describe('accessibility', () => {
  test('the sign-in page has no serious problem', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Hola de nuevo' })).toBeVisible();
    await audit(page, '/login');
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`every section has no serious problem in the ${theme} theme`, async ({ page }) => {
      await page.addInitScript((chosen) => localStorage.setItem('ph.theme', chosen), theme);
      await signUp(page, 'Axe');

      for (const section of SECTIONS) {
        await page.goto(section.path);
        await expect(page.getByRole('heading', { level: 1, name: section.heading }).first()).toBeVisible();
        await audit(page, `${section.path} (${theme})`);
      }
    });
  }
});
