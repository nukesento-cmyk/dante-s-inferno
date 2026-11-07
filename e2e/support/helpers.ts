import { expect, type Locator, type Page } from '@playwright/test';
import { formatKes } from '@dantes/shared';
import { ADMIN_URL, OWNER_EMAIL, OWNER_PASSWORD } from './env';

/** KES text as rendered by the shared formatter, tolerant of non-breaking spaces. */
export const kes = (cents: number) => formatKes(cents).replace(/\s/g, '\\s');
export const kesRe = (cents: number) => new RegExp(kes(cents).replace(/[.*+?^${}()|[\]]/g, (c) => (c === '\\' ? c : `\\${c}`)).replace(/\\\\s/g, '\\s'));

let counter = 0;
export const uniq = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;
/** A valid, unique-ish Kenyan mobile number typed in local 07… form. */
export const randomPhone = () => `07${Math.floor(10000000 + Math.random() * 89999999)}`;

/** Opens the collapsed mobile navigation when the toggle is visible. */
export async function openNav(page: Page) {
  // The app is client-rendered: wait for the header before deciding whether the toggle exists.
  await page.getByRole('banner').waitFor();
  const toggle = page.getByRole('button', { name: 'Menu', exact: true });
  if (await toggle.isVisible()) {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
}

export class Customizer {
  constructor(readonly page: Page) {}
  async open(productName: string) {
    await this.page.goto('/menu');
    const card = this.page.getByRole('article').filter({ has: this.page.getByRole('heading', { name: productName, exact: true }) });
    await card.getByRole('link', { name: 'Customise' }).click();
    await expect(this.page.getByRole('heading', { level: 1, name: productName })).toBeVisible();
  }
  size(name: RegExp | string) { return this.page.getByRole('radio', { name }); }
  async choose(name: RegExp | string) { await this.size(name).click(); await expect(this.size(name)).toHaveAttribute('aria-checked', 'true'); }
  extraGroup() { return this.page.getByRole('region', { name: /extra toppings/i }); }
  includedGroup() { return this.page.getByRole('region', { name: /included toppings/i }); }
  addButton() { return this.page.getByRole('button', { name: 'Add to cart' }); }
}

export async function addPizzaToCart(page: Page, name: string, opts: { size?: RegExp; crust?: RegExp; extra?: boolean; remove?: boolean } = {}) {
  const c = new Customizer(page);
  await c.open(name);
  if (opts.size) await c.choose(opts.size);
  if (opts.crust) await c.choose(opts.crust);
  if (opts.extra) await c.extraGroup().getByRole('button').first().click();
  if (opts.remove) await c.includedGroup().getByRole('button').first().click();
  await c.addButton().click();
  await expect(page).toHaveURL(/\/cart/);
}

export class Checkout {
  constructor(readonly page: Page) {}
  async goto() {
    await this.page.goto('/checkout');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
  }
  async fillDetails(name: string, phone: string) {
    await this.page.getByLabel('Name', { exact: true }).fill(name);
    await this.page.getByLabel('Phone', { exact: true }).fill(phone);
  }
  fulfilment(name: 'Delivery' | 'Collection') { return this.page.getByRole('radiogroup', { name: 'Fulfilment' }).getByRole('radio', { name }); }
  pay(name: 'M-Pesa' | 'Card') { return this.page.getByRole('radiogroup', { name: 'Payment method' }).getByRole('radio', { name }); }
  async chooseZone(name: string) {
    const z = this.page.getByLabel('Delivery area');
    const value = await z.locator('option', { hasText: name }).first().getAttribute('value');
    await z.selectOption(value!);
  }
  async fillAddress(line1 = '12 Kenyatta Avenue, Nairobi') { await this.page.getByLabel('Address', { exact: true }).fill(line1); }
  submit() { return this.page.getByRole('button', { name: /^Place order/ }); }
  summary() { return this.page.getByRole('complementary', { name: 'Order summary' }); }
}

/** Place a collection order with M-Pesa and return its reference (lands on the order page). */
export async function placeCollectionOrder(page: Page, opts: { name?: string; phone?: string; method?: 'M-Pesa' | 'Card' } = {}) {
  const phone = opts.phone ?? randomPhone();
  const co = new Checkout(page);
  await co.goto();
  await co.fillDetails(opts.name ?? 'E2E Guest', phone);
  await co.fulfilment('Collection').click();
  await co.pay(opts.method ?? 'M-Pesa').click();
  await expect(co.submit()).toBeEnabled();
  await co.submit().click();
  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9-]+/);
  const reference = new URL(page.url()).pathname.split('/').pop()!;
  return { reference, phone };
}

export async function simulate(page: Page, outcome: 'success' | 'failure') {
  await page.getByRole('button', { name: outcome === 'success' ? 'Simulate success' : 'Simulate failure' }).click();
}

export async function adminLogin(page: Page, email = OWNER_EMAIL, password = OWNER_PASSWORD) {
  await page.goto(`${ADMIN_URL}/admin/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

/** Admin sidebar is off-canvas below lg; open it when the burger is visible. */
export async function adminNav(page: Page): Promise<Locator> {
  const burger = page.getByRole('button', { name: 'Open menu' });
  if (await burger.isVisible()) await burger.click();
  return page.getByRole('navigation', { name: 'Main' });
}

/** Full guest delivery order (Zone A), paid via the mock. Returns reference + phone. */
export async function placeDeliveryOrder(page: Page, opts: { size?: RegExp; pizza?: string; zone?: string; paid?: boolean } = {}) {
  await addPizzaToCart(page, opts.pizza ?? 'Margherita', { size: opts.size ?? /^Large/ });
  const phone = randomPhone();
  const co = new Checkout(page);
  await co.goto();
  await co.fillDetails('Delivery Guest', phone);
  await co.fulfilment('Delivery').click();
  await co.chooseZone(opts.zone ?? 'Zone A');
  await co.fillAddress();
  await co.pay('M-Pesa').click();
  await expect(co.submit()).toBeEnabled();
  await co.submit().click();
  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9-]+/);
  const reference = new URL(page.url()).pathname.split('/').pop()!;
  if (opts.paid !== false) {
    await simulate(page, 'success');
    await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 15_000 });
  }
  return { reference, phone };
}
