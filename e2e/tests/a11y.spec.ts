import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_URL } from '../support/env';
import { getMenu } from '../support/api';
import { addPizzaToCart, adminLogin, placeCollectionOrder } from '../support/helpers';

/**
 * axe-core WCAG 2.0 A + AA scans. Rules listed in KNOWN are documented, justified exceptions
 * (see documentation/test-report.md); anything else fails the run.
 */
const KNOWN: Record<string, string> = {};

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = results.violations.filter((v) => !(v.id in KNOWN));
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 4).map((n) => `    ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1] ?? ''}`).join('\n')}`);
  expect(bad, `${label}\n${summary.join('\n')}`).toEqual([]);
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

test('axe: home with full motion and WebGL scene', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settle(page);
  await scan(page, 'home (full motion)');
});

test.describe('axe: storefront', () => {
  test.beforeEach(async ({ page }) => {
    // Motion-driven entrance animations make colours transient; scan the settled, reduced-motion state.
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page);
    await scan(page, 'home');
  });

  test('menu', async ({ page }) => {
    await page.goto('/menu');
    await expect(page.getByRole('heading', { name: 'Pick your fire' })).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();
    await settle(page);
    await scan(page, 'menu');
  });

  test('product, customize, cart, checkout, order, account, contact', async ({ page, request }) => {
    const menu = await getMenu(request);
    const p = menu.products.find((x) => x.name === 'Margherita')!;
    await page.goto(`/menu/${p.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page);
    await scan(page, 'product');

    await page.goto(`/customize/${p.id}`);
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible();
    await settle(page);
    await scan(page, 'customize');
    await page.getByRole('button', { name: 'Add to cart' }).click();

    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Margherita' })).toBeVisible();
    await scan(page, 'cart');

    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await page.getByRole('radio', { name: 'Delivery' }).click();
    await settle(page);
    await scan(page, 'checkout (delivery)');
    // Trigger validation messages too.
    await page.getByLabel('Delivery area').selectOption({ index: 1 });
    await page.getByLabel('Name', { exact: true }).fill('A');
    await page.getByRole('button', { name: /^Place order/ }).click();
    await scan(page, 'checkout (errors)');

    await page.getByRole('radio', { name: 'Collection' }).click();
    await placeCollectionOrder(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page);
    await scan(page, 'order (unpaid, mock panel)');

    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await scan(page, 'account (login)');
    await page.getByRole('button', { name: 'Create account' }).click();
    await scan(page, 'account (register)');

    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Find us' })).toBeVisible();
    await settle(page);
    await scan(page, 'contact');
  });

  test('order lookup form', async ({ page }) => {
    await page.goto('/order/DP-NOPE');
    await expect(page.getByRole('heading', { name: 'Find your order' })).toBeVisible();
    await scan(page, 'order lookup');
  });
});

test.describe('axe: admin', () => {
  test('login, orders and every settings tab', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/login`);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await scan(page, 'admin login');

    await adminLogin(page);
    await page.goto(`${ADMIN_URL}/admin/orders`);
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
    await settle(page);
    await scan(page, 'admin orders');

    await page.goto(`${ADMIN_URL}/admin/settings`);
    for (const tab of ['Pricing', 'Contact', 'Opening hours', 'Notifications', 'General']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      await settle(page);
      await scan(page, `admin settings / ${tab}`);
    }
  });
});
