import { expect, test, type Page } from '@playwright/test';
import { getMenu } from '../support/api';

/** Accessible-ish name of the focused element. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    return (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  });

async function tabUntil(page: Page, match: RegExp, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (match.test(await focusedName(page))) return;
  }
  throw new Error(`Never focused ${match} within ${max} tabs`);
}

test('keyboard: header navigation is reachable and operable', async ({ page }) => {
  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Pick your fire' })).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await focusedName(page)).toBe('Skip to content');
  // On narrow screens the nav sits behind a toggle; open it with the keyboard.
  const toggle = page.getByRole('button', { name: 'Menu', exact: true });
  if (await toggle.isVisible()) {
    await tabUntil(page, /^Menu$/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveAttribute('aria-expanded', 'true');
  }
  const seen: string[] = [];
  for (let i = 0; i < 12 && seen.length < 5; i++) {
    await page.keyboard.press('Tab');
    const n = await focusedName(page);
    if (/^(Menu|Our story|Contact|Account|Cart)/.test(n) && !seen.includes(n)) seen.push(n);
  }
  expect(seen.map((s) => s.split(',')[0]!.replace(/ \(\d+\)$/, ''))).toEqual(['Menu', 'Our story', 'Contact', 'Account', 'Cart']);
  // Focus is visibly indicated.
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
  });
  expect(outline.style !== 'none' || outline.shadow !== 'none').toBe(true);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/cart/);
});

test('keyboard: customise a pizza and add it to the cart without a mouse', async ({ page, request }) => {
  const menu = await getMenu(request);
  const margherita = menu.products.find((p) => p.name === 'Margherita')!;
  await page.goto(`/customize/${margherita.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Margherita' })).toBeVisible();

  await tabUntil(page, /^Large/);
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: /^Large/ })).toHaveAttribute('aria-checked', 'true');
  await tabUntil(page, /^Thin/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: /^Thin/ })).toHaveAttribute('aria-checked', 'true');
  await tabUntil(page, /^Mushrooms/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Mushrooms/ })).toHaveAttribute('aria-pressed', 'true');
  await tabUntil(page, /^Increase quantity$/);
  await page.keyboard.press('Enter');
  await tabUntil(page, /^Add to cart$/);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByRole('heading', { name: 'Margherita' })).toBeVisible();
  await expect(page.getByText('Large · Thin')).toBeVisible();
  await expect(page.getByText('Extra: Mushrooms')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Quantity of Margherita' })).toContainText('2');
});
