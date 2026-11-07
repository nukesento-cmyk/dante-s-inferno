import { expect, test } from '@playwright/test';

const showcase = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: "Dante's Pizza showcase" });

test('idle screen appears after the timeout on /?idle=3 and a key dismisses it', async ({ page }) => {
  await page.goto('/?idle=3');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(showcase(page)).toBeHidden();
  await expect(showcase(page)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('a');
  await expect(showcase(page)).toBeHidden();
});

test('idle screen never appears on pages where people type', async ({ page }) => {
  for (const path of ['/checkout?idle=2', '/cart?idle=2', '/account?idle=2']) {
    await page.goto(path);
    await page.waitForTimeout(4500);
    await expect(showcase(page)).toHaveCount(0);
  }
});
