import { expect, test } from '@playwright/test';
import { formatKes } from '@dantes/shared';
import { getAdmin, putHours, putSettings, setMargheritaLargePrice, setProductAvailability, setZoneFee } from '../support/admin-api';
import { ADMIN_URL } from '../support/env';
import { adminLogin, addPizzaToCart, Checkout, placeCollectionOrder } from '../support/helpers';
import { getMenu, getZones } from '../support/api';

test.describe.configure({ mode: 'serial' });

let originalHours: unknown;
let originalPhone: string;
test.beforeAll(async () => {
  originalHours = await getAdmin('admin/settings/hours');
  originalPhone = (await getAdmin<{ phone: string }>('admin/settings')).phone;
});
test.afterEach(async () => {
  // Every spec in this file leaves the shared database as it found it.
  await putHours(originalHours);
  await putSettings({ phone: originalPhone, orderingPaused: false, pauseMessage: '' });
  await setProductAvailability('Margherita', true);
  await setMargheritaLargePrice(125000);
  await setZoneFee('Zone A', 15000);
});

async function ownerPage(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext({ ...test.info().project.use, baseURL: ADMIN_URL });
  const admin = await ctx.newPage();
  await adminLogin(admin);
  return { ctx, admin };
}

async function openSettingsTab(admin: import('@playwright/test').Page, tab: string) {
  await admin.goto(`${ADMIN_URL}/admin/settings`);
  await admin.getByRole('tab', { name: tab }).click();
}

test('phone and opening hours changes show on the storefront', async ({ page, browser }) => {
  const { ctx, admin } = await ownerPage(browser);
  await openSettingsTab(admin, 'Contact');
  await admin.getByLabel('Main phone').fill('0722 111 222');
  await admin.getByRole('button', { name: 'Save contact details' }).click();
  await expect(admin.getByText('Settings saved').or(admin.getByRole('status')).first()).toBeVisible();

  await openSettingsTab(admin, 'Opening hours');
  await admin.getByLabel('Monday closes').fill('23:50');
  await admin.getByRole('button', { name: 'Save opening hours' }).click();
  await expect(admin.getByRole('status').filter({ hasText: 'Opening hours saved' })).toBeVisible();

  await page.goto('/contact');
  await expect(page.getByRole('banner').getByRole('link', { name: '+254 722 111 222' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: '+254 722 111 222' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: /^Mon00:00 – 23:50$/ })).toBeVisible();
  await expect(page.getByRole('contentinfo').getByText('00:00 – 23:50')).toBeVisible();
  await ctx.close();
});

test('pausing ordering blocks checkout with the message, unpausing restores it', async ({ page, browser }) => {
  const { ctx, admin } = await ownerPage(browser);
  await openSettingsTab(admin, 'Opening hours');
  await admin.getByLabel('Message shown to customers').fill('Oven maintenance, back in ten minutes.');
  await admin.getByRole('switch', { name: 'Pause ordering' }).click();
  await admin.getByRole('dialog', { name: 'Pause ordering?' }).getByRole('button', { name: 'Pause ordering' }).click();
  await expect(admin.getByText('Ordering is PAUSED')).toBeVisible();

  await addPizzaToCart(page, 'Pepperoni');
  const co = new Checkout(page);
  await co.goto();
  await expect(page.getByRole('alert').filter({ hasText: 'Ordering is closed right now.' })).toContainText('Oven maintenance, back in ten minutes.');
  await expect(co.submit()).toBeDisabled();

  await admin.getByRole('switch', { name: 'Pause ordering' }).click();
  await expect(admin.getByText('Ordering is live')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ordering is closed right now.')).toHaveCount(0);
  await co.fulfilment('Collection').click();
  await expect(co.submit()).toBeEnabled();
  await ctx.close();
});

test('changing Margherita Large updates the menu while an existing order keeps its old price', async ({ page, browser, request }) => {
  const menu = await getMenu(request);
  const large = menu.sizes.find((s) => s.code === 'L')!;
  const oldCents = menu.products.find((p) => p.name === 'Margherita')!.prices.find((p) => p.sizeId === large.id)!.priceCents;
  const newCents = oldCents + 10000;

  const { reference } = await placeCollectionOrderLarge(page);
  const { ctx, admin } = await ownerPage(browser);
  await openSettingsTab(admin, 'Pricing');
  await admin.getByRole('textbox', { name: 'Margherita Large price' }).fill(String(newCents / 100));
  await admin.getByRole('button', { name: 'Save all prices' }).click();
  await expect(admin.getByRole('status').filter({ hasText: 'Pricing saved' })).toBeVisible();

  await page.goto('/menu');
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Margherita', exact: true }) }).getByRole('link', { name: 'Customise' }).click();
  await expect(page.getByRole('radio', { name: /^Large/ })).toContainText(formatKes(newCents));

  await page.goto(`/order/${reference}`);
  const receipt = page.getByRole('complementary', { name: 'Receipt' });
  await expect(receipt).toContainText(formatKes(oldCents));
  await expect(receipt).not.toContainText(formatKes(newCents));
  await ctx.close();
});

async function placeCollectionOrderLarge(page: import('@playwright/test').Page) {
  await addPizzaToCart(page, 'Margherita', { size: /^Large/, crust: /^Classic/ });
  return placeCollectionOrder(page);
}

test('delivery zone fee change is reflected at checkout', async ({ page, browser, request }) => {
  const zone = (await getZones(request)).find((z) => z.name === 'Zone A')!;
  const { ctx, admin } = await ownerPage(browser);
  await admin.goto(`${ADMIN_URL}/admin/delivery`);
  await admin.getByRole('row').filter({ hasText: 'Zone A' }).getByRole('button', { name: 'Edit' }).click();
  await admin.getByLabel('Delivery fee').fill('200');
  await admin.getByRole('button', { name: 'Save zone' }).click();
  await expect(admin.getByRole('status').filter({ hasText: 'Zone saved' })).toBeVisible();

  await addPizzaToCart(page, 'Margherita', { size: /^Large/ });
  const co = new Checkout(page);
  await co.goto();
  await co.fulfilment('Delivery').click();
  await co.chooseZone('Zone A');
  await expect(page.getByLabel('Delivery area')).toContainText(formatKes(20000));
  await expect(page.getByText(`Fee ${formatKes(20000)}`)).toBeVisible();
  expect(zone.feeCents).toBe(15000);
  await ctx.close();
});

test('turning a product off hides it from the menu and flags it in the cart', async ({ page, browser }) => {
  await addPizzaToCart(page, 'Margherita');
  const { ctx, admin } = await ownerPage(browser);
  await admin.goto(`${ADMIN_URL}/admin/products`);
  const toggle = admin.getByRole('switch', { name: 'Margherita available' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Pepperoni', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Margherita', exact: true })).toHaveCount(0);
  await page.goto('/cart');
  await expect(page.getByRole('alert').filter({ hasText: 'No longer available' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Checkout' })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Your cart is empty')).toBeVisible();
  await ctx.close();
});
