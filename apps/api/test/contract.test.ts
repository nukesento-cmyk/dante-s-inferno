/**
 * Contract tests: boot the app and assert the response SHAPES of every endpoint listed in
 * documentation/api-contract.md (including "Contract changes"). Shapes are zod schemas defined here.
 * Public/customer-facing shapes are .strict() so that an accidental extra field (a leak) fails the test.
 */
import type { INestApplication } from '@nestjs/common';
import { unlinkSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { UPLOADS_DIR } from '../src/catalogue/admin-catalogue.controller';
import { addItem, API, catalogue, createApp, customerAgent, IMAGES, mockComplete, newCart, OWNER, placeOrder, prisma, setupDb, staffAgent } from './helpers';

// ---------- shared building blocks ----------
const cents = z.number().int();
const iso = z.string().datetime();
const nullable = <T extends z.ZodTypeAny>(t: T) => t.nullable();

const errorShape = z.object({ statusCode: z.number().int(), error: z.string(), message: z.string(), code: z.string().optional(), issues: z.array(z.object({ path: z.string(), message: z.string() })).optional() }).strict();
const paged = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() }).strict();

const ingredient = z.object({ id: z.string(), slug: z.string(), name: z.string(), description: z.string(), groupId: z.string(), surchargeCents: cents, modelKey: z.string(), color: z.string() }).strict();
const productPublic = z.object({
  id: z.string(), slug: z.string(), name: z.string(), description: z.string(), imageUrl: nullable(z.string()), featured: z.boolean(), categoryId: z.string(), maxExtraToppings: z.number().int(),
  prices: z.array(z.object({ sizeId: z.string(), priceCents: cents }).strict()), defaultIngredients: z.array(ingredient), extraIngredients: z.array(ingredient),
}).strict();
const hoursDay = z.object({ dayOfWeek: z.number().int().min(0).max(6), openTime: z.string(), closeTime: z.string(), closed: z.boolean() }).passthrough();
const orderingState = z.object({ open: z.boolean() }).passthrough();
const publicSettings = z.object({
  name: z.string(), phone: z.string(), whatsappPhone: nullable(z.string()), orderLinePhone: nullable(z.string()), email: z.string(), address: z.string(), mapUrl: nullable(z.string()),
  deliveryEnabled: z.boolean(), collectionEnabled: z.boolean(), pricesIncludeVat: z.boolean(), vatRateBps: z.number().int(), packagingFeeCents: cents, defaultMaxExtraToppings: z.number().int(),
  hours: z.array(hoursDay).length(7), closures: z.array(z.object({}).passthrough()), ordering: orderingState, pauseMessage: z.string(), paymentsMode: z.enum(['mock', 'live']),
}).strict();
const menu = z.object({
  categories: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() }).strict()),
  sizes: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), inches: z.number() }).strict()),
  crusts: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), adjustments: z.array(z.object({ sizeId: z.string(), adjustmentCents: cents }).strict()) }).strict()),
  toppingGroups: z.array(z.object({ id: z.string(), name: z.string(), surchargeCents: cents }).strict()),
  products: z.array(productPublic),
}).strict();
const zonePublic = z.object({ id: z.string(), name: z.string(), description: z.string(), feeCents: cents, minOrderCents: cents, freeDeliveryFromCents: nullable(cents), etaMinMinutes: z.number().int(), etaMaxMinutes: z.number().int() }).strict();

const cartItem = z.object({
  id: z.string(), productId: z.string(), productName: z.string().nullable(), productSlug: z.string().nullable(), imageUrl: z.string().nullable(), sizeId: z.string(), sizeName: z.string().nullable(), crustId: z.string(), crustName: z.string().nullable(),
  quantity: z.number().int(), added: z.array(ingredient), removed: z.array(ingredient), unitPriceCents: cents, lineTotalCents: cents, notes: z.string().nullable(), unavailable: z.boolean(), unavailableReason: z.string().optional(),
}).strict();
const cart = z.object({ token: z.string(), items: z.array(cartItem), subtotalCents: cents }).strict();
const orderPrice = z.object({
  subtotalCents: cents, deliveryFeeCents: cents, packagingFeeCents: cents, vatCents: cents, totalCents: cents, shortfallToMinimumCents: cents, remainingForFreeDeliveryCents: nullable(cents),
  problems: z.array(z.enum(['EMPTY_CART', 'ZONE_REQUIRED', 'ZONE_INACTIVE', 'BELOW_MINIMUM'])),
}).strict();

const orderPublic = z.object({
  reference: z.string().regex(/^DP-/), status: z.string(), fulfilment: z.enum(['DELIVERY', 'COLLECTION']), zoneName: nullable(z.string()), address: z.unknown(),
  items: z.array(z.object({ productName: z.string(), sizeName: z.string(), crustName: z.string(), toppings: z.unknown(), notes: nullable(z.string()), quantity: z.number().int(), unitPriceCents: cents, lineTotalCents: cents }).strict()),
  subtotalCents: cents, deliveryFeeCents: cents, packagingFeeCents: cents, vatCents: cents, totalCents: cents, paymentMethod: z.enum(['MPESA', 'CARD']),
  etaMinMinutes: nullable(z.number().int()), etaMaxMinutes: nullable(z.number().int()), createdAt: iso, history: z.array(z.object({ toStatus: z.string(), createdAt: iso }).strict()),
}).strict();
const paymentStart = z.object({ id: z.string(), method: z.enum(['MPESA', 'CARD']), status: z.string(), redirectUrl: z.string().optional(), instructions: z.string().optional() }).strict();
const checkoutResult = z.object({ order: orderPublic, payment: paymentStart }).strict();

const user = z.object({ id: z.string(), name: z.string(), email: z.string().email() });
const staffMe = user.extend({ role: z.enum(['OWNER', 'MANAGER', 'ORDER_STAFF', 'KITCHEN']) }).strict();
const customerMe = user.extend({ phone: z.string().nullable() }).strict();
const ok = z.object({ ok: z.literal(true) }).strict();

const adminOrderRow = z.object({ id: z.string(), reference: z.string(), status: z.string(), fulfilment: z.string(), totalCents: cents, createdAt: iso, paymentMethod: z.string(), paymentStatus: nullable(z.string()), customer: z.object({ name: z.string(), phone: z.string() }).strict() }).strict();
const adminOrderDetail = orderPublic.omit({ address: true, history: true }).extend({
  id: z.string(), customer: z.object({ id: z.string(), name: z.string(), phone: z.string(), email: nullable(z.string()) }).strict(), customerNotes: nullable(z.string()), paidAt: nullable(iso),
  address: nullable(z.object({ line1: z.string(), landmark: nullable(z.string()), notes: nullable(z.string()) }).strict()),
  payments: z.array(z.object({ id: z.string(), status: z.string(), events: z.array(z.object({ eventKey: z.string() }).passthrough()) }).passthrough()),
  history: z.array(z.object({ fromStatus: nullable(z.string()), toStatus: z.string(), note: nullable(z.string()), createdAt: iso, actorName: nullable(z.string()) }).strict()),
  notifications: z.array(z.object({ id: z.string(), channel: z.string(), status: z.string() }).passthrough()),
}).strict();
const overview = z.object({
  ordersToday: z.number().int(), revenueTodayCents: cents, activeOrders: z.number().int(), pendingPayments: z.number().int(), avgOrderValueCents: cents,
  topProducts: z.array(z.object({ productId: z.string().optional(), name: z.string(), quantity: z.number().int(), revenueCents: cents }).strict()), revenueByDay: z.array(z.object({ date: z.string(), revenueCents: cents, orders: z.number().int() }).strict()),
}).strict();
const idObject = z.object({ id: z.string() }).passthrough();
const adminPayment = z.object({ id: z.string(), method: z.string(), status: z.string(), amountCents: cents, order: z.object({ reference: z.string(), status: z.string(), totalCents: cents }).passthrough() }).passthrough();
const customerRow = z.object({ id: z.string(), name: z.string(), phone: z.string(), email: nullable(z.string()), createdAt: iso, orderCount: z.number().int(), totalSpentCents: cents }).strict();
const auditRow = z.object({ id: z.string(), createdAt: iso, action: z.string(), entity: z.string(), entityId: nullable(z.string()), userName: nullable(z.string()), before: z.unknown(), after: z.unknown() }).strict();
const staffRow = z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.string(), active: z.boolean(), lastLoginAt: nullable(iso), createdAt: iso }).strict();

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
let owner: Awaited<ReturnType<typeof staffAgent>>;
const http = () => request(app.getHttpServer());
const parse = <T extends z.ZodTypeAny>(schema: T, body: unknown, label: string): z.infer<T> => {
  const r = schema.safeParse(body);
  if (!r.success) throw new Error(`${label} does not match the contract:\n${JSON.stringify(r.error.issues, null, 1).slice(0, 1500)}\nbody: ${JSON.stringify(body).slice(0, 600)}`);
  return r.data;
};
const line = (over: Record<string, unknown> = {}) => ({ productId: cat.product('margherita').id, sizeId: cat.size('M').id, crustId: cat.crust('Classic').id, quantity: 2, ...over });

beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
  owner = await staffAgent(app);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('conventions', () => {
  it('uses the standard error shape for 400, 401, 403, 404 and 409', async () => {
    const kitchen = await staffAgent(app, 'KITCHEN');
    const cases: [request.Response, number][] = [
      [await http().post(`${API}/auth/staff/login`).send({ email: 'bad' }), 400],
      [await http().get(`${API}/admin/orders`), 401],
      [await kitchen.get(`${API}/admin/staff`), 403],
      [await http().get(`${API}/public/products/no-such-pizza`), 404],
      [await owner.post(`${API}/admin/categories`).send({ name: 'Classics', slug: 'classics' }), 409],
    ];
    for (const [res, status] of cases) {
      expect(res.status).toBe(status);
      parse(errorShape, res.body, `error ${status}`);
    }
    expect(parse(errorShape, cases[0]![0].body, 'validation').issues?.length).toBeGreaterThan(0);
  });
  it('health returns { status, db }', async () => {
    expect(parse(z.object({ status: z.literal('ok'), db: z.literal('ok') }).strict(), (await http().get(`${API}/health`).expect(200)).body, 'health')).toBeTruthy();
  });
});

describe('public endpoints', () => {
  it('GET /public/settings', async () => {
    parse(publicSettings, (await http().get(`${API}/public/settings`).expect(200)).body, 'public settings');
  });
  it('GET /public/menu and /public/products/:slug', async () => {
    const m = parse(menu, (await http().get(`${API}/public/menu`).expect(200)).body, 'menu');
    expect(m.products.length).toBeGreaterThan(3);
    parse(productPublic, (await http().get(`${API}/public/products/${m.products[0]!.slug}`).expect(200)).body, 'product');
  });
  it('GET /public/delivery-zones', async () => {
    const zones = parse(z.array(zonePublic), (await http().get(`${API}/public/delivery-zones`).expect(200)).body, 'zones');
    expect(zones.length).toBe(3);
  });
});

describe('cart, checkout and orders', () => {
  it('cart endpoints', async () => {
    const created = parse(cart, (await http().post(`${API}/cart`).expect(201)).body, 'POST /cart');
    const token = created.token;
    const added = parse(cart, (await addItem(app, token, line()).expect(201)).body, 'POST /cart/items');
    const id = added.items[0]!.id;
    parse(cart, (await http().get(`${API}/cart`).set('X-Cart-Token', token).expect(200)).body, 'GET /cart');
    const patched = parse(cart, (await http().patch(`${API}/cart/items/${id}`).set('X-Cart-Token', token).send({ quantity: 3 }).expect(200)).body, 'PATCH /cart/items/:id');
    expect(patched.items[0]!.quantity).toBe(3);
    parse(orderPrice, (await http().post(`${API}/cart/quote`).set('X-Cart-Token', token).send({ fulfilment: 'COLLECTION' }).expect(200)).body, 'quote');
    parse(orderPrice, (await http().post(`${API}/cart/quote`).set('X-Cart-Token', token).send({ fulfilment: 'DELIVERY', deliveryZoneId: cat.zone('Zone A').id }).expect(200)).body, 'quote delivery');
    const removed = parse(cart, (await http().delete(`${API}/cart/items/${id}`).set('X-Cart-Token', token).expect(200)).body, 'DELETE /cart/items/:id');
    expect(removed.items).toEqual([]);
  });

  it('unavailable cart items carry unavailableReason', async () => {
    const token = await newCart(app);
    await addItem(app, token, line()).expect(201);
    await prisma.product.update({ where: { slug: 'margherita' }, data: { available: false } });
    const res = parse(cart, (await http().get(`${API}/cart`).set('X-Cart-Token', token).expect(200)).body, 'cart with unavailable item');
    await prisma.product.update({ where: { slug: 'margherita' }, data: { available: true } });
    expect(res.items[0]).toMatchObject({ unavailable: true, unavailableReason: expect.any(String) });
  });

  it('checkout, lookup, payment-status, retry-payment', async () => {
    const token = await newCart(app);
    await addItem(app, token, line()).expect(201);
    const res = await http().post(`${API}/checkout`).set('X-Cart-Token', token).send({ customer: { name: 'Amina Wanjiru', phone: '0712345678' }, fulfilment: 'COLLECTION', paymentMethod: 'MPESA' }).expect(201);
    const placed = parse(checkoutResult, res.body, 'POST /checkout');
    const ref = placed.order.reference;
    parse(orderPublic, (await http().get(`${API}/orders/${ref}`).query({ phone: '0712345678' }).expect(200)).body, 'GET /orders/:reference');
    const st = parse(z.object({ status: z.string(), orderStatus: z.string(), paymentId: z.string() }).strict(), (await http().get(`${API}/orders/${ref}/payment-status`).expect(200)).body, 'payment-status');
    expect(st.paymentId).toBe(placed.payment.id);
    const retry = parse(checkoutResult, (await http().post(`${API}/orders/${ref}/retry-payment`).send({ method: 'CARD' }).expect(200)).body, 'retry-payment');
    expect(retry.payment.id).not.toBe(placed.payment.id);
    expect(retry.payment.redirectUrl).toBeUndefined();
  });

  it('GET /account/orders', async () => {
    const c = await customerAgent(app, { phone: '0711555666' });
    await placeOrder(app, cat, { agent: c.agent, customer: { name: c.name, phone: c.phone } });
    const list = parse(z.array(orderPublic), (await c.agent.get(`${API}/account/orders`).expect(200)).body, 'account orders');
    expect(list).toHaveLength(1);
  });

  it('payment-status for an order without payments has null status and paymentId', async () => {
    const { reference } = await placeOrder(app, cat);
    await prisma.payment.deleteMany({ where: { order: { reference } } });
    const body = (await http().get(`${API}/orders/${reference}/payment-status`).expect(200)).body;
    expect(parse(z.object({ status: z.null(), orderStatus: z.string(), paymentId: z.null() }).strict(), body, 'no payment')).toBeTruthy();
  });
});

describe('payment provider callbacks', () => {
  it('mock complete returns { status, paymentStatus, orderStatus }', async () => {
    const { paymentId } = await placeOrder(app, cat);
    const body = (await mockComplete(app, paymentId, true).expect(200)).body;
    parse(z.object({ status: z.enum(['applied', 'duplicate', 'rejected']), paymentStatus: z.string(), orderStatus: z.string(), reason: z.string().optional() }).strict(), body, 'mock complete');
    expect(body.status).toBe('applied');
  });
  it('M-Pesa callback replies { ResultCode: 0 } and Paystack webhook { received: true }, return redirects to the storefront', async () => {
    const mp = (await http().post(`${API}/payments/mpesa/callback/${process.env.MPESA_CALLBACK_SECRET}`).send({}).expect(200)).body;
    parse(z.object({ ResultCode: z.literal(0), ResultDesc: z.string() }).strict(), mp, 'mpesa ack');
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'x', id: 1 } });
    const sig = createHmac('sha512', 'sk_test_unit').update(raw).digest('hex');
    const ps = (await http().post(`${API}/payments/paystack/webhook`).set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(raw).expect(200)).body;
    parse(z.object({ received: z.literal(true) }).strict(), ps, 'paystack ack');
    const { reference } = await placeOrder(app, cat, { paymentMethod: 'CARD' });
    const payment = await prisma.payment.findFirstOrThrow({ where: { order: { reference } } });
    const redirect = await http().get(`${API}/payments/paystack/return`).query({ reference: payment.id }).expect(302);
    expect(redirect.headers.location).toBe(`${process.env.STOREFRONT_URL ?? 'http://localhost:5173'}/order/${reference}`);
  });
});

describe('auth endpoints', () => {
  it('staff login, me, logout', async () => {
    const agent = request.agent(app.getHttpServer());
    parse(staffMe, (await agent.post(`${API}/auth/staff/login`).send(OWNER).expect(200)).body, 'staff login');
    parse(staffMe, (await agent.get(`${API}/auth/staff/me`).expect(200)).body, 'staff me');
    parse(ok, (await agent.post(`${API}/auth/staff/logout`).expect(200)).body, 'staff logout');
  });
  it('customer register, login, me, logout, forgot, reset', async () => {
    const agent = request.agent(app.getHttpServer());
    const email = 'contract@example.com';
    parse(customerMe, (await agent.post(`${API}/auth/customer/register`).send({ name: 'Contract Customer', email, phone: '0722333444', password: 'Sup3r-secret-pw' }).expect(201)).body, 'register');
    parse(customerMe, (await agent.get(`${API}/auth/customer/me`).expect(200)).body, 'customer me');
    parse(ok, (await agent.post(`${API}/auth/customer/logout`).expect(200)).body, 'customer logout');
    parse(customerMe, (await agent.post(`${API}/auth/customer/login`).send({ email, password: 'Sup3r-secret-pw' }).expect(200)).body, 'customer login');
    parse(ok, (await http().post(`${API}/auth/customer/forgot-password`).send({ email }).expect(200)).body, 'forgot');
    await http().post(`${API}/auth/customer/reset-password`).send({ token: 'f'.repeat(40), password: 'Sup3r-secret-pw' }).expect(400);
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    const token = 'a1'.repeat(32);
    await prisma.user.update({ where: { id: row.id }, data: { resetTokenHash: (await import('node:crypto')).createHash('sha256').update(token).digest('hex'), resetTokenExpires: new Date(Date.now() + 60_000) } });
    parse(ok, (await http().post(`${API}/auth/customer/reset-password`).send({ token, password: 'Another-pass-99' }).expect(200)).body, 'reset');
  });
});

describe('admin endpoints', () => {
  it('overview, orders list/detail/status', async () => {
    const { reference, paymentId } = await placeOrder(app, cat);
    await mockComplete(app, paymentId, true).expect(200);
    parse(overview, (await owner.get(`${API}/admin/overview`).expect(200)).body, 'overview');
    const list = parse(paged(adminOrderRow), (await owner.get(`${API}/admin/orders?status=PAID,ACCEPTED&page=1`).expect(200)).body, 'orders list');
    expect(list.items.length).toBeGreaterThan(0);
    const id = list.items.find((o) => o.reference === reference)!.id;
    parse(adminOrderDetail, (await owner.get(`${API}/admin/orders/${id}`).expect(200)).body, 'order detail');
    const updated = (await owner.patch(`${API}/admin/orders/${id}/status`).send({ status: 'ACCEPTED', note: 'ok' }).expect(200)).body;
    parse(z.object({ id: z.string(), reference: z.string(), status: z.literal('ACCEPTED') }).passthrough(), updated, 'status update');
  });

  it('SSE stream emits named events with { id, reference, status, fulfilment, totalCents }', async () => {
    await app.listen(0, '127.0.0.1');
    const login = await http().post(`${API}/auth/staff/login`).send(OWNER).expect(200);
    const ac = new AbortController();
    const res = await fetch(`${await app.getUrl()}${API}/admin/orders/stream`, { headers: { cookie: String(login.headers['set-cookie']).split(';')[0]! }, signal: ac.signal });
    await placeOrder(app, cat);
    const reader = res.body!.getReader();
    let text = '';
    const end = Date.now() + 5000;
    while (!/order\.created/.test(text) && Date.now() < end) text += new TextDecoder().decode((await reader.read()).value);
    ac.abort();
    const m = /event: order\.created\n(?:id: .*\n)?data: (.*)\n/.exec(text);
    expect(m).toBeTruthy();
    parse(z.object({ id: z.string(), reference: z.string(), status: z.string(), fulfilment: z.string(), totalCents: cents }).strict(), JSON.parse(m![1]!), 'SSE data');
  });

  it('catalogue: products, categories, ingredients, groups, sizes, crusts, zones, uploads', async () => {
    const products = parse(z.array(idObject), (await owner.get(`${API}/admin/products`).expect(200)).body, 'products');
    expect(products.length).toBeGreaterThan(3);
    parse(idObject, (await owner.get(`${API}/admin/products/${products[0]!.id}`).expect(200)).body, 'product');
    for (const path of ['categories', 'ingredients', 'topping-groups', 'sizes', 'crusts', 'delivery-zones']) {
      const rows = parse(z.array(idObject), (await owner.get(`${API}/admin/${path}`).expect(200)).body, path);
      expect(rows.length).toBeGreaterThan(0);
    }
    const catRow = parse(idObject.extend({ slug: z.string() }), (await owner.post(`${API}/admin/categories`).send({ name: 'Contract Cat', slug: 'contract-cat' }).expect(201)).body, 'category create');
    parse(idObject, (await owner.put(`${API}/admin/categories/${catRow.id}`).send({ name: 'Contract Cat 2', slug: 'contract-cat' }).expect(200)).body, 'category update');
    const p = parse(idObject, (await owner.post(`${API}/admin/products`).send({ name: 'Contract Pizza', slug: 'contract-pizza', categoryId: catRow.id, prices: [{ sizeId: cat.size('M').id, priceCents: 100000 }] }).expect(201)).body, 'product create');
    parse(idObject, (await owner.patch(`${API}/admin/products/${p.id}/availability`).send({ available: false }).expect(200)).body, 'availability');
    await owner.post(`${API}/admin/products/reorder`).send({ ids: [p.id] }).expect(200);
    await owner.delete(`${API}/admin/products/${p.id}`).expect(200);
    const up = parse(z.object({ url: z.string().regex(/^\/uploads\//) }).strict(), (await owner.post(`${API}/admin/uploads/image`).attach('file', IMAGES.webp, { filename: 'a.webp', contentType: 'image/webp' }).expect(201)).body, 'upload');
    unlinkSync(`${UPLOADS_DIR}/${up.url.replace('/uploads/', '')}`);
  });

  it('pricing GET/PUT', async () => {
    const pricing = parse(
      z.object({
        sizes: z.array(idObject),
        products: z.array(z.object({ id: z.string(), name: z.string(), prices: z.array(z.object({ sizeId: z.string(), priceCents: cents })) }).passthrough()),
        crusts: z.array(z.object({ id: z.string(), name: z.string(), adjustments: z.array(z.object({ sizeId: z.string(), adjustmentCents: cents })) }).passthrough()),
        toppingGroups: z.array(idObject),
        ingredients: z.array(z.object({ id: z.string(), name: z.string(), groupId: z.string(), surchargeCents: nullable(cents) }).passthrough()),
        settings: z.object({ vatRateBps: z.number().int(), pricesIncludeVat: z.boolean(), packagingFeeCents: cents }).passthrough(),
      }),
      (await owner.get(`${API}/admin/pricing`).expect(200)).body,
      'pricing',
    );
    const put = await owner.put(`${API}/admin/pricing`).send({ settings: pricing.settings }).expect(200);
    expect(put.body).toBeTruthy();
  });

  it('payments, customers, reports, audit, staff', async () => {
    const { paymentId } = await placeOrder(app, cat);
    await mockComplete(app, paymentId, true).expect(200);
    const pays = parse(paged(adminPayment), (await owner.get(`${API}/admin/payments?status=SUCCEEDED,PENDING&method=MPESA,CARD`).expect(200)).body, 'payments');
    expect(pays.items.length).toBeGreaterThan(0);
    parse(adminPayment.extend({ events: z.array(z.object({ eventKey: z.string() }).passthrough()) }), (await owner.get(`${API}/admin/payments/${paymentId}`).expect(200)).body, 'payment detail');
    parse(
      z.object({ byMethod: z.array(z.object({ method: z.string(), count: z.number().int(), amountCents: cents }).strict()), unmatched: z.array(idObject), paidOrdersWithoutPayment: z.array(z.unknown()) }).strict(),
      (await owner.get(`${API}/admin/payments/reconciliation`).expect(200)).body,
      'reconciliation',
    );
    const customers = parse(paged(customerRow), (await owner.get(`${API}/admin/customers`).expect(200)).body, 'customers');
    const detail = parse(customerRow.extend({ addresses: z.array(z.unknown()), orders: z.array(z.unknown()) }).passthrough(), (await owner.get(`${API}/admin/customers/${customers.items[0]!.id}`).expect(200)).body, 'customer detail');
    expect(Array.isArray(detail.orders)).toBe(true);
    for (const g of ['day', 'week', 'month']) {
      parse(z.array(z.object({ period: z.string(), orders: z.number().int(), revenueCents: cents, avgOrderCents: cents }).strict()), (await owner.get(`${API}/admin/reports/sales?groupBy=${g}`).expect(200)).body, `sales ${g}`);
    }
    parse(z.array(z.object({ productId: z.string(), name: z.string(), quantity: z.number().int(), revenueCents: cents }).strict()), (await owner.get(`${API}/admin/reports/products`).expect(200)).body, 'products report');
    const csv = await owner.get(`${API}/admin/reports/export.csv`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    parse(paged(auditRow), (await owner.get(`${API}/admin/audit?page=1`).expect(200)).body, 'audit');
    const staff = parse(z.array(staffRow), (await owner.get(`${API}/admin/staff`).expect(200)).body, 'staff list');
    expect(staff.length).toBeGreaterThan(0);
    const created = parse(staffRow, (await owner.post(`${API}/admin/staff`).send({ name: 'Contract Staff', email: 'contractstaff@example.com', role: 'KITCHEN', password: 'Contract-pass-12' }).expect(201)).body, 'staff create');
    parse(staffRow, (await owner.put(`${API}/admin/staff/${created.id}`).send({ name: 'Contract Staff 2', email: 'contractstaff@example.com', role: 'KITCHEN', active: true }).expect(200)).body, 'staff update');
    expect(parse(staffRow, (await owner.post(`${API}/admin/staff/${created.id}/deactivate`).expect(200)).body, 'deactivate').active).toBe(false);
  });

  it('settings, hours, closures', async () => {
    const settings = (await owner.get(`${API}/admin/settings`).expect(200)).body;
    expect(settings).toMatchObject({ name: expect.any(String), vatRateBps: expect.any(Number), staffAlertPhones: expect.any(Array) });
    expect((await owner.put(`${API}/admin/settings`).send({ pauseMessage: 'contract' }).expect(200)).body.pauseMessage).toBe('contract');
    await owner.put(`${API}/admin/settings`).send({ pauseMessage: '' }).expect(200);
    const hours = parse(z.array(hoursDay).length(7), (await owner.get(`${API}/admin/settings/hours`).expect(200)).body, 'hours');
    await owner.put(`${API}/admin/settings/hours`).send(hours).expect(200);
    const closure = parse(idObject.extend({ date: z.string(), label: z.string(), closed: z.boolean() }), (await owner.post(`${API}/admin/settings/closures`).send({ date: '2031-02-02', label: 'Contract day', closed: true, openTime: null, closeTime: null }).expect(201)).body, 'closure create');
    expect(parse(z.array(idObject), (await owner.get(`${API}/admin/settings/closures`).expect(200)).body, 'closures').length).toBeGreaterThan(0);
    parse(ok, (await owner.delete(`${API}/admin/settings/closures/${closure.id}`).expect(200)).body, 'closure delete');
  });

  it('notification settings', async () => {
    const snap = parse(
      z.object({
        channels: z.array(z.object({ channel: z.enum(['SMS', 'EMAIL', 'WHATSAPP']), enabled: z.boolean(), configured: z.boolean() }).strict()).length(3),
        settings: z.array(z.object({ channel: z.string(), event: z.string(), audience: z.string(), enabled: z.boolean() }).passthrough()),
        templates: z.array(z.object({ channel: z.string(), event: z.string(), audience: z.string(), subject: nullable(z.string()), body: z.string() }).passthrough()),
      }).strict(),
      (await owner.get(`${API}/admin/settings/notifications`).expect(200)).body,
      'notifications',
    );
    expect(snap.settings.length).toBe(3 * 8 * 2);
    const channelsOut = parse(z.array(z.object({ channel: z.string(), enabled: z.boolean(), configured: z.boolean() }).strict()), (await owner.put(`${API}/admin/settings/notifications/channels`).send([{ channel: 'SMS', enabled: true }]).expect(200)).body, 'channels');
    expect(channelsOut).toHaveLength(3);
    await owner.put(`${API}/admin/settings/notifications/channels`).send({ channel: 'EMAIL', enabled: true }).expect(200);
    parse(z.array(z.object({ channel: z.string(), event: z.string(), audience: z.string(), enabled: z.boolean() }).passthrough()), (await owner.put(`${API}/admin/settings/notifications/settings`).send(snap.settings.map(({ channel, event, audience, enabled }) => ({ channel, event, audience, enabled }))).expect(200)).body, 'settings put');
    parse(z.object({ subject: nullable(z.string()), body: z.string() }).passthrough(), (await owner.put(`${API}/admin/settings/notifications/templates/SMS/ORDER_RECEIVED/CUSTOMER`).send({ subject: null, body: 'Hello {customerName}' }).expect(200)).body, 'template put');
    parse(z.object({ status: z.enum(['SENT', 'FAILED']), note: nullable(z.string()), error: nullable(z.string()) }).strict(), (await owner.post(`${API}/admin/settings/notifications/test`).send({ channel: 'SMS', recipient: '0712000111' }).expect(200)).body, 'test send');
    parse(z.object({ rendered: z.string() }).strict(), (await owner.post(`${API}/admin/settings/notifications/preview`).send({ body: 'Hi {customerName}' }).expect(200)).body, 'preview');
  });
});
