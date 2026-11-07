import { expect, test } from '@playwright/test';
import { formatKes } from '@dantes/shared';
import { STOREFRONT_URL } from '../support/env';
import { Checkout, Customizer, kesRe, placeCollectionOrder, randomPhone, simulate } from '../support/helpers';
import { expectedLine, expectedOrder, getMenu, getSettings, getZones } from '../support/api';

test.describe('guest journeys', () => {
  test('delivery order: customised pizza, cart total matches shared pricing, M-Pesa mock success', async ({ page, request }) => {
    const [menu, settings, zones] = await Promise.all([getMenu(request), getSettings(request), getZones(request)]);
    const margherita = menu.products.find((p) => p.name === 'Margherita')!;
    const extra = margherita.extraIngredients.find((i) => i.name === 'Mushrooms')!;
    const removed = margherita.defaultIngredients.find((i) => i.name === 'Tomato')!;
    const zone = zones.find((z) => z.name === 'Zone A')!;

    const c = new Customizer(page);
    await c.open('Margherita');
    await c.choose(/^Large/);
    await c.choose(/^Thin/);
    await c.extraGroup().getByRole('button', { name: /^Mushrooms/ }).click();
    await c.includedGroup().getByRole('button', { name: 'Tomato' }).click();
    await expect(c.includedGroup().getByRole('button', { name: 'Tomato' })).toHaveAttribute('aria-pressed', 'false');

    const line = expectedLine(menu, margherita, 'L', 'Thin', [extra]);
    await expect(page.getByText(kesRe(line.lineTotalCents)).first()).toBeVisible(); // live estimate in the bar
    await c.addButton().click();

    // Cart shows the server-recomputed price, which must equal the shared engine.
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByRole('heading', { name: 'Margherita' })).toBeVisible();
    await expect(page.getByText('Large · Thin')).toBeVisible();
    await expect(page.getByText('Extra: Mushrooms')).toBeVisible();
    await expect(page.getByText(`No: ${removed.name}`)).toBeVisible();
    const summary = page.getByRole('complementary', { name: 'Order summary' });
    await expect(summary).toContainText(formatKes(line.lineTotalCents));
    await page.getByRole('link', { name: 'Checkout' }).click();

    const co = new Checkout(page);
    await co.fillDetails('Wanjiru Test', '0712345678');
    await co.fulfilment('Delivery').click();
    await co.chooseZone(zone.name);
    await co.fillAddress();
    // Zone A minimum is KES 600, so a Large pizza is enough.
    const order = expectedOrder(settings, [line.lineTotalCents], zone);
    expect(order.problems).toEqual([]);
    await expect(co.summary()).toContainText(formatKes(order.totalCents));
    await expect(co.summary()).toContainText(formatKes(order.vatCents));
    await co.pay('M-Pesa').click();
    await co.submit().click();

    await expect(page).toHaveURL(/\/order\/[A-Za-z0-9-]+/);
    await expect(page.getByText(/check your phone for the m-pesa prompt/i)).toBeVisible();
    await simulate(page, 'success');
    await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 15_000 });

    const receipt = page.getByRole('complementary', { name: 'Receipt' });
    await expect(receipt).toContainText('Margherita');
    await expect(receipt).toContainText('Large · Thin');
    await expect(receipt).toContainText(formatKes(order.subtotalCents));
    await expect(receipt).toContainText(formatKes(order.deliveryFeeCents));
    await expect(receipt).toContainText(/VAT/);
    await expect(receipt).toContainText(formatKes(order.vatCents));
    await expect(receipt).toContainText(formatKes(order.totalCents));
    await expect(page.getByRole('listitem').filter({ hasText: 'Payment received' })).toHaveClass(/done/);
  });

  test('collection order with card mock', async ({ page }) => {
    const c = new Customizer(page);
    await c.open('Pepperoni');
    await c.addButton().click();
    await expect(page).toHaveURL(/\/cart/);
    const { reference } = await placeCollectionOrder(page, { method: 'Card' });
    await expect(page.getByText(/waiting for your card payment/i)).toBeVisible();
    await simulate(page, 'success');
    await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('complementary', { name: 'Receipt' })).toContainText(/Paid by card/);
    await expect(page.getByRole('heading', { level: 1, name: reference })).toBeVisible();
  });

  test('M-Pesa failure, then retry, then success', async ({ page }) => {
    const c = new Customizer(page);
    await c.open('Hawaiian');
    await c.addButton().click();
    await placeCollectionOrder(page);
    await simulate(page, 'failure');
    await expect(page.getByText(/payment failed/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Pay now' }).click();
    // A fresh payment is started; the order is waiting for the new prompt.
    await expect(page.getByText(/check your phone for the m-pesa prompt/i)).toBeVisible({ timeout: 15_000 });
    await simulate(page, 'success');
    await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);
  });

  test('below-minimum zone shows the message and offers collection', async ({ page, request }) => {
    const [menu, zones] = await Promise.all([getMenu(request), getZones(request)]);
    const zoneC = zones.find((z) => z.name === 'Zone C')!; // minimum KES 1,200
    const cheapest = Math.min(...menu.products.flatMap((p) => p.prices.map((x) => x.priceCents)));
    expect(cheapest).toBeLessThan(zoneC.minOrderCents);

    const c = new Customizer(page);
    await c.open('Margherita');
    await c.choose(/^Small/);
    await c.addButton().click();
    await page.getByRole('link', { name: 'Checkout' }).click();
    const co = new Checkout(page);
    await co.fulfilment('Delivery').click();
    await co.chooseZone('Zone C');
    const warn = page.getByRole('alert').filter({ hasText: /The minimum for Zone C/ });
    await expect(warn).toBeVisible();
    await expect(warn).toContainText(formatKes(zoneC.minOrderCents));
    await expect(co.submit()).toBeDisabled();
    await warn.getByRole('button', { name: 'Switch to collection' }).click();
    await expect(co.fulfilment('Collection')).toHaveAttribute('aria-checked', 'true');
    await expect(warn).toHaveCount(0);
    await expect(co.submit()).toBeEnabled();
  });

  test('order lookup with the wrong phone is denied, the right phone succeeds', async ({ page, browser }) => {
    const c = new Customizer(page);
    await c.open('Pepperoni');
    await c.addButton().click();
    const { reference, phone } = await placeCollectionOrder(page);

    // A different browser session has no remembered phone, so it must prove it.
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto(`${STOREFRONT_URL}/order/${reference}`);
    await expect(other.getByRole('heading', { name: 'Find your order' })).toBeVisible();
    await other.getByLabel('Phone').fill(randomPhone());
    await other.getByRole('button', { name: 'View order' }).click();
    await expect(other.getByRole('alert').filter({ hasText: /could not find that order/i })).toBeVisible();
    await expect(other.getByRole('complementary', { name: 'Receipt' })).toHaveCount(0);

    await other.getByLabel('Phone').fill(phone);
    await other.getByRole('button', { name: 'View order' }).click();
    await expect(other.getByRole('complementary', { name: 'Receipt' })).toBeVisible();
    await ctx.close();
  });
});
