import { test, expect } from '@playwright/test';
test('approval reveal stays mounted through timer re-renders and overlay fills its frame', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Enter rehearsal' }).click();
  await page.getByRole('button', { name: 'Start voting' }).click();
  await page.getByRole('button', { name: '!rift c', exact: true }).click();
  await page.getByRole('button', { name: 'Close voting & calculate' }).click();
  await page.getByRole('button', { name: 'Unleash encounter' }).click();
  const reveal = page.locator('.scene-panel .reveal-sigil');
  await expect(reveal).toBeAttached();
  await reveal.evaluate((el) => el.setAttribute('data-same-node', 'yes'));
  await page.waitForTimeout(1600);
  await expect(page.locator('.scene-panel .reveal-sigil')).toHaveAttribute('data-same-node', 'yes');
  await expect(page.locator('.scene-panel .scene-title')).toHaveCSS('opacity', '1');
  const link = await (await page.request.get('/api/overlay/link')).json();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const overlay = await context.newPage();
  await overlay.goto(link.url);
  await expect(overlay.getByRole('heading', { name: 'Encounter unleashed' })).toBeVisible();
  const frame = await overlay.locator('.broadcast').boundingBox();
  expect(frame).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  const window = await overlay.locator('.broadcast-bottom').boundingBox();
  expect(window!.y + window!.height).toBeLessThanOrEqual(720);
  await context.close();
});
