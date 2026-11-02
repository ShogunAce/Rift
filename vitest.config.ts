import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    env: {
      ALLOW_REHEARSAL: 'true',
      TWITCH_CLIENT_ID: '',
      TWITCH_CLIENT_SECRET: '',
      APP_ORIGIN: 'http://localhost:5173',
      DATABASE_PATH: ':memory:',
    },
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
