import { test, expect } from '@playwright/test';
test('host resets a pending vote and overlay receives empty reopened round', async ({
  page,
  context,
}) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Enter rehearsal' }).click();
  await page.getByRole('button', { name: 'Start voting' }).click();
  await page.getByRole('button', { name: '!rift a', exact: true }).click();
  await page.getByRole('button', { name: 'Close voting & calculate' }).click();
  await expect(page.getByRole('button', { name: 'Unleash encounter' })).toBeVisible();
  const before = await (await page.request.get('/api/snapshot')).json();
  const link = await (await page.request.get('/api/overlay/link')).json();
  const overlay = await context.newPage();
  await overlay.goto(link.url);
  await expect(overlay.getByText('The keeper decides')).toBeVisible();
  await page.getByRole('button', { name: 'Reset voting', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close voting & calculate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unleash encounter' })).toHaveCount(0);
  await expect(overlay.getByText('VOTING OPEN', { exact: true })).toBeVisible();
  const after = await (await page.request.get('/api/snapshot')).json();
  expect(after.round.tally).toEqual({ a: 0, b: 0, c: 0 });
  expect(after.round.id).not.toBe(before.round.id);
  expect(after.state.threat).toBe(before.state.threat);
  await page.getByRole('button', { name: '!rift b', exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get('/api/snapshot')).json()).round.tally.b)
    .toBe(1);
});
