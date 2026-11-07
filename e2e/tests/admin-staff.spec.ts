import { expect, test } from '@playwright/test';
import { ADMIN_URL, API_URL } from '../support/env';
import { adminLogin, placeDeliveryOrder, uniq } from '../support/helpers';

test('KITCHEN staff sees only orders, cannot open settings, and can only set PREPARING/READY', async ({ page, browser }) => {
  const { reference } = await placeDeliveryOrder(page);
  const email = `${uniq('kitchen')}@dantespizza.co.ke`;
  const password = 'Kitchen-pass-123';

  const ownerCtx = await browser.newContext({ ...test.info().project.use, baseURL: ADMIN_URL });
  const owner = await ownerCtx.newPage();
  await adminLogin(owner);

  // Owner creates the KITCHEN user.
  await owner.goto(`${ADMIN_URL}/admin/staff`);
  await owner.getByRole('button', { name: 'New staff member' }).click();
  const form = owner.getByRole('dialog', { name: 'New staff member' });
  await form.getByLabel('Name').fill('Kitchen Kim');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Role').selectOption('KITCHEN');
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(owner.getByRole('row').filter({ hasText: email })).toBeVisible();

  // Owner accepts the order so the kitchen has something to work on.
  await owner.goto(`${ADMIN_URL}/admin/orders`);
  await owner.getByRole('button', { name: reference }).click({ timeout: 25_000 });
  const drawer = owner.getByRole('dialog', { name: `Order ${reference}` });
  await drawer.getByRole('button', { name: 'Mark accepted' }).click();
  await expect(drawer.getByRole('button', { name: 'Mark preparing' })).toBeVisible();
  await ownerCtx.close();

  // Kitchen session.
  const kCtx = await browser.newContext({ ...test.info().project.use, baseURL: ADMIN_URL });
  const k = await kCtx.newPage();
  await adminLogin(k, email, password);
  const burger = k.getByRole('button', { name: 'Open menu' });
  if (await burger.isVisible()) await burger.click();
  const nav = k.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(['🧾Orders']);
  await expect(k).toHaveURL(/\/admin\/orders/);
  if (await burger.isVisible() && (await nav.isVisible())) await k.keyboard.press('Escape');

  await k.goto(`${ADMIN_URL}/admin/settings`);
  await expect(k).toHaveURL(/\/admin\/orders/);
  await expect(k.getByRole('heading', { name: 'Settings' })).toHaveCount(0);

  // API enforcement, not just UI: settings and status transitions outside the role are refused.
  expect((await k.request.get(`${API_URL}/api/v1/admin/settings`)).status()).toBe(403);
  expect((await k.request.get(`${API_URL}/api/v1/admin/pricing`)).status()).toBe(403);

  await k.getByRole('button', { name: reference }).click({ timeout: 25_000 });
  const kd = k.getByRole('dialog', { name: `Order ${reference}` });
  await expect(kd.getByRole('button', { name: /^Mark / })).toHaveText(['Mark preparing']);
  await expect(kd.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  await kd.getByRole('button', { name: 'Mark preparing' }).click();
  await expect(kd.getByRole('button', { name: /^Mark / })).toHaveText(['Mark ready']);
  await expect(kd.getByRole('button', { name: 'Mark out for delivery' })).toHaveCount(0);
  await kCtx.close();
});
