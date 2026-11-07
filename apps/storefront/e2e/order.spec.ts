import { expect, test } from '@playwright/test';

/**
 * Guest journey with mock payments. Requires the API on :4000 with PAYMENTS_MODE=mock, seeded menu,
 * delivery zones and opening hours covering "now".
 */
test('guest orders a pizza and completes a mock M-Pesa payment', async ({ page }) => {
  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: /pick your fire/i })).toBeVisible();

  await page.getByRole('link', { name: 'Customise' }).first().click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page).toHaveURL(/\/cart/);
  await page.getByRole('link', { name: 'Checkout' }).click();

  await page.getByLabel('Name', { exact: true }).fill('Test Guest');
  await page.getByLabel('Phone', { exact: true }).fill('0712345678');

  const collection = page.getByRole('radio', { name: 'Collection' });
  if (await collection.isVisible()) await collection.click();
  await page.getByRole('radio', { name: 'M-Pesa' }).click();

  await page.getByRole('button', { name: /place order/i }).click();
  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9-]+/);
  await expect(page.getByText(/check your phone for the m-pesa prompt/i)).toBeVisible();

  await page.getByRole('button', { name: 'Simulate success' }).click();
  await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Receipt')).toBeVisible();
});
