import { test, expect } from '@playwright/test';
test('landing hero, try-a-round demo and control room link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Controls');
  const video = page.locator('.lp-scene video');
  await expect(video).toHaveAttribute('loop', '');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10000 })
    .toBeGreaterThan(0);
  const box = await page.locator('.lp-navpill').boundingBox();
  expect(box!.width).toBeGreaterThan(530);
  await page.getByRole('button', { name: /!rift a/ }).click();
  await page.getByRole('button', { name: 'Close voting' }).click();
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open RIFT' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('button', { name: 'Enter rehearsal' })).toBeVisible();
});
test('landing honours reduced motion and fits a phone', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.lp-scene video')).toHaveCount(0);
  await expect(page.locator('.lp-navpill')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await context.close();
});
