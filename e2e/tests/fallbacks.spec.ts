import { expect, test, type Page } from '@playwright/test';
import { addPizzaToCart, Checkout, placeCollectionOrder, simulate } from '../support/helpers';

const noWebGL = (page: Page) =>
  page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
    } as typeof orig;
  });

async function checkHomeAndOrder(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  // Photo fallbacks: at least one real image is on the page and it loads.
  const img = page.getByRole('img').first();
  await expect(img).toBeVisible();
  await expect.poll(() => page.evaluate(() => [...document.images].some((i) => i.complete && i.naturalWidth > 0))).toBe(true);

  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Pick your fire' })).toBeVisible();
  await addPizzaToCart(page, 'Pepperoni');
  await expect(page.locator('canvas')).toHaveCount(0);
  const { reference } = await placeCollectionOrder(page);
  await simulate(page, 'success');
  await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: reference })).toBeVisible();
  void Checkout;
}

test('prefers-reduced-motion: homepage uses photos (no canvas); menu and checkout work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await checkHomeAndOrder(page);
});

test('no WebGL: homepage and customizer use photos; menu and checkout work', async ({ page }) => {
  await noWebGL(page);
  await checkHomeAndOrder(page);
});
