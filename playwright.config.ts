import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:5174', headless: true },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    env: {
      PORT: '3002',
      WEB_PORT: '5174',
      APP_ORIGIN: 'http://localhost:5174',
      DATABASE_PATH: ':memory:',
      ALLOW_REHEARSAL: 'true',
      TWITCH_CLIENT_ID: '',
      TWITCH_CLIENT_SECRET: '',
    },
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: 'list',
});
