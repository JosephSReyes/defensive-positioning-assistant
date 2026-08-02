import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',

  use: {
    baseURL: 'http://localhost:3000',
  },

  // Serve the static site before running E2E tests.
  // Uses a zero-dependency Node.js server (scripts/serve.cjs) to avoid
  // the 'serve' npm package's chalk sub-dependency issue on Node 22.
  webServer: {
    command: 'node scripts/serve.cjs',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
