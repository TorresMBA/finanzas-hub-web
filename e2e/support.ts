import { Locator, Page, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PASSWORD = 'Correcta-Bateria-9';

/** The heading of Inicio: a greeting that depends on the time of day. */
export const GREETING = /^Buen(os días|as tardes|as noches)/;

/**
 * Chooses an account in the account picker of a form, as a person does: open the list labelled `label` and click
 * the account by its name. Checks that the list closes and the account is the one shown.
 */
export async function pickAccount(form: Locator, label: string, account: string): Promise<void> {
  const picker = form.getByRole('combobox', { name: label });
  await picker.click();
  const list = form.getByRole('listbox', { name: label });
  await list.getByRole('option').filter({ has: form.page().getByText(account, { exact: true }) }).click();
  await expect(list).toBeHidden();
  await expect(picker).toContainText(account);
}

export function newEmail(name: string): string {
  return `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * Creates an account with its workspace already set up, through the API, and leaves the page signed in.
 * For tests that are about something else than signing up.
 */
export async function signUp(page: Page, name = 'Brian'): Promise<{ email: string; workspaceId: string }> {
  const email = newEmail(name);
  const registered = await page.request.post('/api/v1/auth/register', { data: { email, password: PASSWORD, displayName: name } });
  expect(registered.status(), 'Start the API on http://localhost:5166 before running the end-to-end tests').toBe(200);

  const workspaces = await (await page.request.get('/api/v1/me/workspaces')).json();
  const workspaceId: string = workspaces[0].id;
  const onboarding = await page.request.post(`/api/v1/workspaces/${workspaceId}/onboarding/complete`, {
    data: { baseCurrency: 'PEN', timeZone: 'America/Lima' },
  });
  expect(onboarding.status()).toBe(200);
  return { email, workspaceId };
}

/**
 * Finds a link in the newest email sent to an address. Without an SMTP server the Worker writes each
 * email as a file in this folder, so the Worker must be running.
 */
export async function linkEmailedTo(email: string, pattern: RegExp): Promise<string> {
  const directory = process.env['E2E_MAIL_DIR'] ?? join(tmpdir(), 'personal-hub-mail');
  let found: string | undefined;
  await expect
    .poll(
      () => {
        found = existsSync(directory)
          ? readdirSync(directory)
              .filter((file) => file.endsWith('.eml'))
              .map((file) => decode(readFileSync(join(directory, file), 'utf8')))
              .filter((message) => message.includes(email))
              .map((message) => pattern.exec(message)?.[0])
              .findLast((link) => link !== undefined)
          : undefined;
        return found;
      },
      { message: `No email for ${email} in ${directory}. Is the Worker running?`, timeout: 30_000 },
    )
    .toBeDefined();
  return found!;
}

/** An .eml body is base64 or quoted-printable; either way the link has to be put back together. */
function decode(message: string): string {
  const [headers, ...rest] = message.split(/\r?\n\r?\n/);
  const body = rest.join('\n\n');
  if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    return headers + '\n\n' + Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }

  const unfolded = body.replace(/=\r?\n/g, '');
  const bytes = unfolded.replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return headers + '\n\n' + Buffer.from(bytes, 'latin1').toString('utf8');
}
