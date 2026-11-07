import { expect, test } from '@playwright/test';
import { addPizzaToCart, Checkout, openNav, randomPhone, simulate, uniq } from '../support/helpers';

test.describe('customer account', () => {
  test('register, logout, login, order while logged in, see it in /account/orders', async ({ page }) => {
    const email = `${uniq('cust')}@example.com`;
    const password = 'Sup3r-Secret-pass';
    const phone = randomPhone();

    await page.goto('/account');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Amani Customer');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Phone').fill(phone);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).last().click();
    await expect(page.getByRole('heading', { name: 'Hi, Amani' })).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: /log in|create account/i })).toBeVisible();

    // The form stays in "register" mode after logout; switch to login.
    const toLogin = page.getByRole('button', { name: 'Log in', exact: true });
    if (await toLogin.isVisible()) await toLogin.click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Hi, Amani' })).toBeVisible();

    await addPizzaToCart(page, 'Pepperoni');
    const co = new Checkout(page);
    await co.goto();
    await co.fillDetails('Amani Customer', phone);
    await co.fulfilment('Collection').click();
    await co.pay('M-Pesa').click();
    await co.submit().click();
    await expect(page).toHaveURL(/\/order\/[A-Za-z0-9-]+/);
    const reference = new URL(page.url()).pathname.split('/').pop()!;
    await simulate(page, 'success');
    await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 15_000 });

    await page.goto('/account/orders');
    await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible();
    await expect(page.getByRole('link', { name: reference })).toBeVisible();
  });

  test('cart persists across a reload', async ({ page }) => {
    await addPizzaToCart(page, 'Hawaiian', { size: /^Large/ });
    await expect(page.getByRole('heading', { name: 'Hawaiian' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hawaiian' })).toBeVisible();
    await expect(page.getByText('Large ·')).toBeVisible();
    await page.goto('/menu');
    await openNav(page);
    await expect(page.getByRole('link', { name: /^Cart, 1 items?/ })).toBeVisible();
  });
});
