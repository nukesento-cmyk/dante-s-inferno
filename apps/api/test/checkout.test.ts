import type { INestApplication } from '@nestjs/common';
import { priceLine, priceOrder } from '@dantes/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addItem, catalogue, checkout, createApp, newCart, openRestaurant, prisma, setupDb, staffAgent } from './helpers';

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(openRestaurant);

const line = (over: Record<string, unknown> = {}) => ({
  productId: cat.product('margherita').id,
  sizeId: cat.size('L').id,
  crustId: cat.crust('Classic').id,
  quantity: 2,
  ...over,
});

async function filledCart(item = line()) {
  const token = await newCart(app);
  await addItem(app, token, item).expect(201);
  return token;
}

describe('checkout rules', () => {
  it('rejects when ordering is paused, with the pause message', async () => {
    const token = await filledCart();
    await prisma.restaurantSettings.update({ where: { id: 1 }, data: { orderingPaused: true, pauseMessage: 'Kitchen is slammed' } });
    const res = await checkout(app, token).expect(409);
    expect(res.body).toMatchObject({ code: 'ORDERING_CLOSED', message: 'Kitchen is slammed', statusCode: 409 });
  });

  it('rejects outside opening hours', async () => {
    const token = await filledCart();
    await prisma.openingHours.updateMany({ data: { closed: true } });
    const res = await checkout(app, token).expect(409);
    expect(res.body.code).toBe('ORDERING_CLOSED');
  });

  it('rejects when the fulfilment type is disabled', async () => {
    const token = await filledCart();
    await prisma.restaurantSettings.update({ where: { id: 1 }, data: { collectionEnabled: false } });
    await checkout(app, token).expect(409);
  });

  it('rejects an order below the zone minimum', async () => {
    const token = await filledCart(line({ productId: cat.product('margherita').id, sizeId: cat.size('S').id, quantity: 1 }));
    const res = await checkout(app, token, {
      fulfilment: 'DELIVERY',
      deliveryZoneId: cat.zone('Zone C').id,
      address: { line1: '12 Ngong Road' },
    }).expect(400);
    expect(res.body.code).toBe('BELOW_MINIMUM');
  });

  it('rejects an inactive or unknown delivery zone', async () => {
    const token = await filledCart();
    const zone = cat.zone('Zone A');
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { active: false } });
    const body = { fulfilment: 'DELIVERY', deliveryZoneId: zone.id, address: { line1: '12 Ngong Road' } };
    expect((await checkout(app, token, body).expect(400)).body.code).toBe('ZONE_INACTIVE');
    expect((await checkout(app, token, { ...body, deliveryZoneId: 'nope' }).expect(400)).body.code).toBe('ZONE_REQUIRED');
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { active: true } });
  });

  it('rejects an empty cart, invalid input and items that became unavailable', async () => {
    const empty = await newCart(app);
    await checkout(app, empty).expect(400);
    const token = await filledCart();
    await checkout(app, token, { customer: { name: 'A', phone: '123' } }).expect(400);
    await prisma.product.update({ where: { slug: 'margherita' }, data: { available: false } });
    expect((await checkout(app, token).expect(400)).body.code).toBe('ITEMS_UNAVAILABLE');
    await prisma.product.update({ where: { slug: 'margherita' }, data: { available: true } });
  });

  it('creates a pending order with a reference, snapshot items and history, and empties the cart', async () => {
    const token = await filledCart(line({ addIngredientIds: [cat.ingredient('bacon').id], removeIngredientIds: [cat.ingredient('tomato').id] }));
    const res = await checkout(app, token).expect(201);
    expect(res.body.order.reference).toMatch(/^DP-[2-9A-HJKMNP-Z]{6}$/);
    expect(res.body.order.status).toBe('PENDING_PAYMENT');
    expect(res.body.payment).toMatchObject({ method: 'MPESA', status: 'PENDING' });
    expect(res.body.payment.instructions).toBeTruthy();
    const kinds = res.body.order.items[0].toppings.map((t: { kind: string }) => t.kind).sort();
    expect(kinds).toEqual(['ADDED', 'DEFAULT', 'REMOVED']);
    const cart = await request(app.getHttpServer()).get('/api/v1/cart').set('X-Cart-Token', token).expect(200);
    expect(cart.body.items).toHaveLength(0);
  });

  it('looks orders up by reference + phone only', async () => {
    const token = await filledCart();
    const { body } = await checkout(app, token).expect(201);
    const ref = body.order.reference;
    await request(app.getHttpServer()).get(`/api/v1/orders/${ref}`).query({ phone: '0712345678' }).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/orders/${ref}`).query({ phone: '0722000000' }).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/orders/${ref}`).expect(404);
  });
});

describe('totals', () => {
  it('match the shared priceOrder across size, crust, toppings, quantity and zone', async () => {
    const meats = ['pepperoni', 'bacon'].map((s) => cat.ingredient(s));
    const fulfilments = [
      { fulfilment: 'COLLECTION' as const, zone: null },
      { fulfilment: 'DELIVERY' as const, zone: cat.zone('Zone A') },
      { fulfilment: 'DELIVERY' as const, zone: cat.zone('Zone B') },
      { fulfilment: 'DELIVERY' as const, zone: cat.zone('Zone C') },
    ];
    let accepted = 0;
    let rejected = 0;
    for (const sizeCode of ['S', 'M', 'L']) {
      for (const crustName of ['Classic', 'Deep pan', 'Stuffed']) {
        const size = cat.size(sizeCode);
        const crust = cat.crust(crustName);
        const adjustment = crust.adjustments.find((a) => a.sizeId === size.id);
        if (!adjustment) continue;
        for (const extras of [[], meats]) {
          for (const quantity of [1, 3]) {
            const product = cat.product('margherita');
            const unit = priceLine({
              sizePriceCents: product.prices.find((p) => p.sizeId === size.id)!.priceCents,
              crustAdjustmentCents: adjustment.adjustmentCents,
              extraToppingSurchargesCents: extras.map((e) => e.surchargeCents ?? e.group.surchargeCents),
              quantity,
            });
            for (const f of fulfilments) {
            const expected = priceOrder({
              lineTotalsCents: [unit.lineTotalCents],
              fulfilment: f.fulfilment,
              zone: f.zone,
              packagingFeeCents: 0,
              vatRateBps: 1600,
              pricesIncludeVat: true,
            });
            const token = await filledCart(line({ productId: product.id, sizeId: size.id, crustId: crust.id, quantity, addIngredientIds: extras.map((e) => e.id) }));
            const res = await checkout(app, token, {
              fulfilment: f.fulfilment,
              ...(f.zone && { deliveryZoneId: f.zone.id, address: { line1: '5 Kilimani Rd' } }),
            });
            if (expected.problems.length) {
              expect(res.status, `${sizeCode}/${crustName}/q${quantity}`).toBe(400);
              rejected++;
              continue;
            }
            expect(res.status).toBe(201);
            const { order } = res.body;
            expect(order).toMatchObject({
              subtotalCents: expected.subtotalCents,
              deliveryFeeCents: expected.deliveryFeeCents,
              vatCents: expected.vatCents,
              totalCents: expected.totalCents,
            });
            expect(order.items[0].lineTotalCents).toBe(unit.lineTotalCents);
            const payment = await prisma.payment.findFirstOrThrow({ where: { order: { reference: order.reference } } });
            expect(payment.amountCents).toBe(expected.totalCents);
            accepted++;
            }
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(10);
    expect(rejected).toBeGreaterThan(0);
  });

  it('adds VAT on top when prices exclude VAT, and the packaging fee', async () => {
    await prisma.restaurantSettings.update({ where: { id: 1 }, data: { pricesIncludeVat: false, packagingFeeCents: 5000 } });
    const token = await filledCart();
    const res = await checkout(app, token).expect(201);
    const expected = priceOrder({
      lineTotalsCents: [res.body.order.items[0].lineTotalCents],
      fulfilment: 'COLLECTION',
      zone: null,
      packagingFeeCents: 5000,
      vatRateBps: 1600,
      pricesIncludeVat: false,
    });
    expect(res.body.order.totalCents).toBe(expected.totalCents);
    await prisma.restaurantSettings.update({ where: { id: 1 }, data: { pricesIncludeVat: true, packagingFeeCents: 0 } });
  });
});

describe('snapshots', () => {
  it('editing a product price does not change an existing OrderItem', async () => {
    const token = await filledCart();
    const { body } = await checkout(app, token).expect(201);
    const before = await prisma.orderItem.findFirstOrThrow({ where: { order: { reference: body.order.reference } } });

    const owner = await staffAgent(app);
    const pricing = (await owner.get('/api/v1/admin/pricing').expect(200)).body;
    const product = pricing.products.find((p: { name: string }) => p.name === 'Margherita');
    const prices = product.prices.map((p: { sizeId: string; priceCents: number }) => ({ ...p, priceCents: p.priceCents + 50000 }));
    await owner.put('/api/v1/admin/pricing').send({ products: [{ id: product.id, prices }] }).expect(200);
    await prisma.product.update({ where: { slug: 'margherita' }, data: { name: 'Margherita Renamed' } });

    const after = await prisma.orderItem.findFirstOrThrow({ where: { order: { reference: body.order.reference } } });
    expect(after).toEqual(before);
    const pub = await request(app.getHttpServer()).get(`/api/v1/orders/${body.order.reference}`).query({ phone: '0712345678' }).expect(200);
    expect(pub.body.items[0]).toMatchObject({ productName: 'Margherita', unitPriceCents: before.unitPriceCents });
    expect(pub.body.totalCents).toBe(body.order.totalCents);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'pricing.update' } });
    expect(audit).toBeTruthy();

    const fresh = await addItem(app, await newCart(app), line({ quantity: 1 })).expect(201);
    expect(fresh.body.items[0].unitPriceCents).toBeGreaterThan(before.unitPriceCents / 2 + 40000);
    await prisma.product.update({ where: { slug: 'margherita' }, data: { name: 'Margherita' } });
  });
});
