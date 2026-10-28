import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? '8010';
const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT ?? '4180';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'python scripts/e2e_server.py',
      cwd: '../backend',
      url: `${BACKEND_URL}/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
      cwd: '.',
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_PROXY_TARGET: BACKEND_URL },
    },
  ],
});
