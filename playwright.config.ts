import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the local stack: this dev server (started here) and the API on
 * http://localhost:5166, reached through the dev server's proxy. Start the API before running them.
 *
 * By default Playwright uses its own Chromium ("npx playwright install chromium"). To use a browser
 * already installed on the machine instead, set PW_CHANNEL to "chrome" or "msedge".
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env['PW_CHANNEL'] || undefined },
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
