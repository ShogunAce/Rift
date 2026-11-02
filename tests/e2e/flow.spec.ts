import { test, expect } from '@playwright/test';
test('rehearsal vote → proposal → approval → overlay → rollback', async ({ page, context }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Enter rehearsal' }).click();
  await expect(page.getByRole('button', { name: 'Start voting' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start voting' }).click();
  await page.getByRole('button', { name: '!rift a', exact: true }).click();
  await page.getByRole('button', { name: 'Close voting & calculate' }).click();
  await expect(page.getByRole('button', { name: 'Unleash encounter' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const approvalBox = await page.getByRole('button', { name: 'Unleash encounter' }).boundingBox();
  expect(approvalBox!.y + approvalBox!.height).toBeLessThan(768);
  await page.screenshot({ path: 'test-results/taste-pending-laptop.png', fullPage: true });
  const stateBefore = await page.request.get('/api/snapshot');
  expect((await stateBefore.json()).state.threat).toBe(0);
  const link = await page.request.get('/api/overlay/link');
  const overlayPage = await context.newPage();
  await overlayPage.setViewportSize({ width: 1280, height: 720 });
  await overlayPage.goto((await link.json()).url);
  await expect(overlayPage.getByText('The keeper decides')).toBeVisible();
  await page.getByRole('button', { name: 'Unleash encounter' }).click();
  await expect(overlayPage.getByRole('heading', { name: 'Encounter unleashed' })).toBeVisible();
  await expect(overlayPage.getByText('35 / 51')).toBeVisible();
  await expect(overlayPage.locator('.reveal-sigil')).toHaveCSS('opacity', '1');
  expect(
    await overlayPage.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(720);
  await overlayPage.screenshot({ path: 'test-results/overlay-approved.png', fullPage: true });
  await page.getByRole('button', { name: 'Roll back' }).click();
  await expect(overlayPage.getByText('0 / 60')).toBeVisible();
  await expect(page.getByText('Encounter rolled back', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/control-room.png', fullPage: true });
});
test('mobile navigation and honest initial state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  for (const button of await page.locator('.sidebar nav button').all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('button', { name: 'Start voting' })).toBeDisabled();
  await expect(page.locator('.top-status')).toContainText('Twitch disconnected');
  await page.getByRole('button', { name: 'Settings & connection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make the connection' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/mobile-settings.png', fullPage: true });
});
test('keyboard entry, reduced motion, and mobile control layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to controls' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/taste-mobile-controls.png', fullPage: true });
});
