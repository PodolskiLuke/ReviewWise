import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4300',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'node e2e/start-e2e-env.cjs',
    url: 'http://127.0.0.1:4300',
    reuseExistingServer: true,
    timeout: 240000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
