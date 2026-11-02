import { test, expect } from '@playwright/test';
test('connection controls stop chat and explicitly restart authorization', async ({ page }) => {
  let disconnected = false;
  let loggedOut = false;
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        configured: true,
        rehearsalAvailable: false,
        session: { mode: 'live', actor: 'owner' },
        identity: { name: 'keeper' },
        connection: { status: 'connected', detail: 'Connected' },
      },
    }),
  );
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: {
        sequence: 1,
        mode: 'live',
        canRollback: false,
        events: [],
        round: null,
        state: {
          revision: 0,
          partyLevel: 3,
          partyHealth: 70,
          maxPartyHealth: 100,
          threat: 0,
          maxThreat: 60,
          round: 0,
          activeEffects: [],
          cooldowns: {},
        },
        connection: { status: 'connected', detail: 'Connected' },
      },
    }),
  );
  await page.route('**/api/twitch/disconnect', (route) => {
    disconnected = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/auth/logout', (route) => {
    loggedOut = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/auth/twitch/start', (route) =>
    route.fulfill({ contentType: 'text/html', body: 'Twitch authorization destination' }),
  );
  await page.goto('/app');
  await page.getByRole('button', { name: 'Settings & connection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Disconnect Twitch', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect chat', exact: true }).click();
  expect(disconnected).toBe(true);
  await page.getByRole('button', { name: 'Authorize Twitch again', exact: true }).click();
  await expect(page).toHaveURL(/\/api\/auth\/twitch\/start$/);
  expect(loggedOut).toBe(true);
});
