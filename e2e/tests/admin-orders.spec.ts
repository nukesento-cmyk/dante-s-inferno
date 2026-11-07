import { expect, test } from '@playwright/test';
import { ADMIN_URL } from '../support/env';
import { adminLogin, placeDeliveryOrder } from '../support/helpers';

test('owner moves a guest order PAID -> ACCEPTED -> PREPARING -> OUT_FOR_DELIVERY -> COMPLETED and the storefront follows', async ({ page, browser }) => {
  const { reference } = await placeDeliveryOrder(page);

  const ctx = await browser.newContext({ ...test.info().project.use, baseURL: ADMIN_URL });
  const admin = await ctx.newPage();
  await adminLogin(admin);
  await admin.goto(`${ADMIN_URL}/admin/orders`);
  // New tab is the default for the owner; the order arrives live (SSE) or on the 20 s refetch.
  const ref = admin.getByRole('button', { name: reference });
  await expect(ref).toBeVisible({ timeout: 25_000 });
  await ref.click();
  const drawer = admin.getByRole('dialog', { name: `Order ${reference}` });
  await expect(drawer).toBeVisible();

  const stages: [string, string, RegExp][] = [
    ['Mark accepted', 'Accepted', /Accepted by the kitchen/],
    ['Mark preparing', 'Preparing', /Being prepared/],
    ['Mark out for delivery', 'Out for delivery', /Out for delivery/],
    ['Mark completed', 'Completed', /Delivered/],
  ];
  for (const [button, badge, step] of stages) {
    await drawer.getByRole('button', { name: button }).click();
    await expect(drawer.locator('span').filter({ hasText: new RegExp(`^${badge}$`) }).first()).toBeVisible();
    // The customer's order page polls and reflects the new stage without a reload.
    await expect(page.getByRole('listitem').filter({ hasText: step })).toHaveClass(/done/, { timeout: 15_000 });
  }
  await expect(drawer.getByText('No further status changes')).toBeVisible();
  await ctx.close();
});
