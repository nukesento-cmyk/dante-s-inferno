import type { INestApplication } from '@nestjs/common';
import { priceLine, priceOrder } from '@dantes/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addItem, API, catalogue, checkout, createApp, newCart, openRestaurant, prisma, setupDb } from './helpers';

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
afterEach(async () => {
  await openRestaurant();
  await prisma.restaurantSettings.update({ where: { id: 1 }, data: { pricesIncludeVat: true, packagingFeeCents: 0, vatRateBps: 1600 } });
  await prisma.deliveryZone.updateMany({ data: { active: true } });
});

const SIZES = ['S', 'M', 'L'];
const CRUSTS = ['Classic', 'Thin', 'Deep pan', 'Stuffed'];
const TOPPINGS = ['mozzarella', 'onion', 'pepperoni', 'bacon', 'mushrooms', 'beef'];
const ZONES = ['Zone A', 'Zone B', 'Zone C'];
const KES_ADDRESS = { line1: '5 Kilimani Rd' };

const settings = () => prisma.restaurantSettings.findUniqueOrThrow({ where: { id: 1 } });
const unit = async (productSlug: string, sizeCode: string, crustName: string, toppings: string[], quantity: number) => {
  const size = cat.size(sizeCode);
  const crust = cat.crust(crustName);
  const adjustment = crust.adjustments.find((a) => a.sizeId === size.id);
  const price = cat.product(productSlug).prices.find((p) => p.sizeId === size.id);
  if (!adjustment || !price) return null;
  return priceLine({
    sizePriceCents: price.priceCents,
    crustAdjustmentCents: adjustment.adjustmentCents,
    extraToppingSurchargesCents: toppings.map((t) => cat.ingredient(t).surchargeCents ?? cat.ingredient(t).group.surchargeCents),
    quantity,
  });
};
const item = (productSlug: string, sizeCode: string, crustName: string, toppings: string[], quantity: number) => ({
  productId: cat.product(productSlug).id,
  sizeId: cat.size(sizeCode).id,
  crustId: cat.crust(crustName).id,
  quantity,
  addIngredientIds: toppings.map((t) => cat.ingredient(t).id),
});

describe('quote matrix: size x crust x topping count x quantity x zone', () => {
  it('matches @dantes/shared for every combination (collection and each zone)', async () => {
    const s = await settings();
    const max = s.defaultMaxExtraToppings;
    const toppingCounts = Array.from({ length: Math.min(max, TOPPINGS.length) + 1 }, (_, i) => i);
    const fulfilments = [{ fulfilment: 'COLLECTION' as const, zone: null }, ...ZONES.map((z) => ({ fulfilment: 'DELIVERY' as const, zone: cat.zone(z) }))];
    let combos = 0;
    let unavailable = 0;
    for (const sizeCode of SIZES) {
      for (const crustName of CRUSTS) {
        for (const count of toppingCounts) {
          for (const quantity of [1, 3, 10]) {
            const toppings = TOPPINGS.slice(0, count);
            const expectedLine = await unit('margherita', sizeCode, crustName, toppings, quantity);
            const token = await newCart(app);
            const add = await addItem(app, token, item('margherita', sizeCode, crustName, toppings, quantity));
            if (!expectedLine) {
              expect(add.status, `${sizeCode}/${crustName} is not offered`).toBe(400);
              unavailable++;
              continue;
            }
            expect(add.status, `${sizeCode}/${crustName}/${count}/q${quantity}: ${JSON.stringify(add.body)}`).toBe(201);
            expect(add.body.items[0]).toMatchObject({ unitPriceCents: expectedLine.unitPriceCents, lineTotalCents: expectedLine.lineTotalCents, quantity });
            expect(add.body.subtotalCents).toBe(expectedLine.lineTotalCents);
            for (const f of fulfilments) {
              const expected = priceOrder({ lineTotalsCents: [expectedLine.lineTotalCents], fulfilment: f.fulfilment, zone: f.zone, packagingFeeCents: s.packagingFeeCents, vatRateBps: s.vatRateBps, pricesIncludeVat: s.pricesIncludeVat });
              const quote = await http().post(`${API}/cart/quote`).set('X-Cart-Token', token).send({ fulfilment: f.fulfilment, ...(f.zone && { deliveryZoneId: f.zone.id }) }).expect(200);
              expect(quote.body, `${sizeCode}/${crustName}/${count}/q${quantity}/${f.zone?.name ?? 'collection'}`).toEqual(expected);
            }
            combos++;
          }
        }
      }
    }
    expect(combos).toBeGreaterThanOrEqual(3 * 3 * 3 * 4 - unavailable);
    expect(unavailable).toBeGreaterThanOrEqual(0);
  });

  it('rejects one topping over the limit and toppings the product does not allow', async () => {
    const max = (await settings()).defaultMaxExtraToppings;
    const tooMany = TOPPINGS.slice(0, Math.min(max + 1, TOPPINGS.length));
    if (tooMany.length > max) {
      const res = await addItem(app, await newCart(app), item('margherita', 'M', 'Classic', tooMany, 1)).expect(400);
      expect(res.body.message).toContain('at most');
    }
    const veg = item('veggie-supreme', 'M', 'Classic', ['pepperoni'], 1);
    await addItem(app, await newCart(app), veg).expect(400);
  });

  it('prices every seeded product at every size from the database, not the client', async () => {
    const products = ['margherita', 'veggie-supreme', 'hawaiian', 'pepperoni'];
    for (const slug of products) {
      for (const sizeCode of SIZES) {
        const expectedLine = await unit(slug, sizeCode, 'Classic', [], 1);
        const res = await addItem(app, await newCart(app), item(slug, sizeCode, 'Classic', [], 1)).expect(201);
        expect(res.body.items[0].unitPriceCents).toBe(expectedLine!.unitPriceCents);
      }
    }
  });

  it('honours a per-ingredient surcharge override over the group surcharge', async () => {
    const onion = cat.ingredient('onion');
    await prisma.ingredient.update({ where: { id: onion.id }, data: { surchargeCents: 7777 } });
    try {
      const res = await addItem(app, await newCart(app), item('margherita', 'M', 'Classic', ['onion'], 1)).expect(201);
      const base = await unit('margherita', 'M', 'Classic', [], 1);
      expect(res.body.items[0].unitPriceCents).toBe(base!.unitPriceCents + 7777);
    } finally {
      await prisma.ingredient.update({ where: { id: onion.id }, data: { surchargeCents: null } });
    }
  });
});

describe('order totals match the quote and the Payment amount', () => {
  const variants = [
    { name: 'VAT included, no packaging', include: true, packaging: 0, sizes: SIZES },
    { name: 'VAT on top plus packaging', include: false, packaging: 5000, sizes: ['M'] },
  ];
  for (const v of variants) {
    it(`for every size, crust, topping count and zone (${v.name})`, async () => {
      await prisma.restaurantSettings.update({ where: { id: 1 }, data: { pricesIncludeVat: v.include, packagingFeeCents: v.packaging } });
      const s = await settings();
      const fulfilments = [{ fulfilment: 'COLLECTION' as const, zone: null }, ...ZONES.map((z) => ({ fulfilment: 'DELIVERY' as const, zone: cat.zone(z) }))];
      let accepted = 0;
      for (const sizeCode of v.sizes) {
        for (const crustName of CRUSTS) {
          for (const toppings of [[], ['onion', 'bacon']]) {
            for (const quantity of [1, 3]) {
              const line = await unit('pepperoni', sizeCode, crustName, toppings, quantity);
              if (!line) continue;
              for (const f of fulfilments) {
                const expected = priceOrder({ lineTotalsCents: [line.lineTotalCents], fulfilment: f.fulfilment, zone: f.zone, packagingFeeCents: s.packagingFeeCents, vatRateBps: s.vatRateBps, pricesIncludeVat: s.pricesIncludeVat });
                const token = await newCart(app);
                await addItem(app, token, item('pepperoni', sizeCode, crustName, toppings, quantity)).expect(201);
                const res = await checkout(app, token, { fulfilment: f.fulfilment, ...(f.zone && { deliveryZoneId: f.zone.id, address: KES_ADDRESS }) });
                if (expected.problems.length) {
                  expect(res.status, `${sizeCode}/${crustName}/${f.zone?.name}`).toBe(400);
                  continue;
                }
                expect(res.status, JSON.stringify(res.body)).toBe(201);
                expect(res.body.order).toMatchObject({
                  subtotalCents: expected.subtotalCents,
                  deliveryFeeCents: expected.deliveryFeeCents,
                  packagingFeeCents: expected.packagingFeeCents,
                  vatCents: expected.vatCents,
                  totalCents: expected.totalCents,
                });
                const payment = await prisma.payment.findFirstOrThrow({ where: { order: { reference: res.body.order.reference } } });
                expect(payment.amountCents).toBe(expected.totalCents);
                const itemsTotal = res.body.order.items.reduce((sum: number, i: { lineTotalCents: number }) => sum + i.lineTotalCents, 0);
                expect(itemsTotal).toBe(expected.subtotalCents);
                accepted++;
              }
            }
          }
        }
      }
      expect(accepted).toBeGreaterThan(v.sizes.length * 10);
    });
  }

  it('handles multi-line carts and keeps the sum of lines equal to the subtotal', async () => {
    const token = await newCart(app);
    await addItem(app, token, item('margherita', 'S', 'Classic', [], 2)).expect(201);
    await addItem(app, token, item('hawaiian', 'L', 'Thin', ['bacon', 'mushrooms'], 3)).expect(201);
    const a = (await unit('margherita', 'S', 'Classic', [], 2))!;
    const b = (await unit('hawaiian', 'L', 'Thin', ['bacon', 'mushrooms'], 3))!;
    const res = await checkout(app, token).expect(201);
    expect(res.body.order.subtotalCents).toBe(a.lineTotalCents + b.lineTotalCents);
  });
});

describe('delivery zone rules', () => {
  const cartOf = async (subtotalTarget?: { sizeCode: string; quantity: number }) => {
    const token = await newCart(app);
    const t = subtotalTarget ?? { sizeCode: 'M', quantity: 3 };
    await addItem(app, token, item('margherita', t.sizeCode, 'Classic', [], t.quantity)).expect(201);
    return { token, subtotal: (await unit('margherita', t.sizeCode, 'Classic', [], t.quantity))!.lineTotalCents };
  };
  const deliver = (token: string, zoneId?: string, extra: Record<string, unknown> = {}) =>
    checkout(app, token, { fulfilment: 'DELIVERY', ...(zoneId && { deliveryZoneId: zoneId }), address: KES_ADDRESS, ...extra });

  it('rejects an inactive zone at quote and checkout, and hides it from the public list', async () => {
    const zone = cat.zone('Zone A');
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { active: false } });
    const { token } = await cartOf();
    const quote = await http().post(`${API}/cart/quote`).set('X-Cart-Token', token).send({ fulfilment: 'DELIVERY', deliveryZoneId: zone.id }).expect(200);
    expect(quote.body.problems).toContain('ZONE_INACTIVE');
    expect((await deliver(token, zone.id).expect(400)).body.code).toBe('ZONE_INACTIVE');
    const list = await http().get(`${API}/public/delivery-zones`).expect(200);
    expect(list.body.map((z: { id: string }) => z.id)).not.toContain(zone.id);
    expect(list.body.length).toBe(ZONES.length - 1);
  });

  it('enforces the minimum order exactly at the boundary', async () => {
    const { token, subtotal } = await cartOf();
    const zone = cat.zone('Zone B');
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { minOrderCents: subtotal + 1, freeDeliveryFromCents: null } });
    const below = await deliver(token, zone.id).expect(400);
    expect(below.body.code).toBe('BELOW_MINIMUM');
    const quote = await http().post(`${API}/cart/quote`).set('X-Cart-Token', token).send({ fulfilment: 'DELIVERY', deliveryZoneId: zone.id }).expect(200);
    expect(quote.body).toMatchObject({ shortfallToMinimumCents: 1, problems: ['BELOW_MINIMUM'] });
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { minOrderCents: subtotal } });
    const exact = await deliver(token, zone.id).expect(201);
    expect(exact.body.order.deliveryFeeCents).toBe(zone.feeCents);
  });

  it('gives free delivery from the threshold and not one cent earlier', async () => {
    const zone = cat.zone('Zone B');
    const { token, subtotal } = await cartOf();
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { minOrderCents: 0, freeDeliveryFromCents: subtotal + 1 } });
    const quote = await http().post(`${API}/cart/quote`).set('X-Cart-Token', token).send({ fulfilment: 'DELIVERY', deliveryZoneId: zone.id }).expect(200);
    expect(quote.body).toMatchObject({ deliveryFeeCents: zone.feeCents, remainingForFreeDeliveryCents: 1 });
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { freeDeliveryFromCents: subtotal } });
    const quote2 = await http().post(`${API}/cart/quote`).set('X-Cart-Token', token).send({ fulfilment: 'DELIVERY', deliveryZoneId: zone.id }).expect(200);
    expect(quote2.body).toMatchObject({ deliveryFeeCents: 0, remainingForFreeDeliveryCents: null });
    const placed = await deliver(token, zone.id).expect(201);
    expect(placed.body.order.deliveryFeeCents).toBe(0);
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { freeDeliveryFromCents: null } });
  });

  it('requires a valid zone and an address for delivery, and ignores zones for collection', async () => {
    const { token } = await cartOf();
    await deliver(token).expect(400);
    expect((await deliver(token, 'unknown-zone').expect(400)).body.code).toBe('ZONE_REQUIRED');
    await checkout(app, token, { fulfilment: 'DELIVERY', deliveryZoneId: cat.zone('Zone A').id }).expect(400);
    const collection = await checkout(app, token, { fulfilment: 'COLLECTION', deliveryZoneId: cat.zone('Zone C').id }).expect(201);
    expect(collection.body.order).toMatchObject({ deliveryFeeCents: 0, zoneName: null });
  });

  it('refuses collection when collection is disabled, and delivery when delivery is disabled', async () => {
    const { token } = await cartOf();
    await prisma.restaurantSettings.update({ where: { id: 1 }, data: { collectionEnabled: false } });
    expect((await checkout(app, token, { fulfilment: 'COLLECTION' }).expect(409)).body.code).toBe('FULFILMENT_DISABLED');
    expect((await http().get(`${API}/public/settings`).expect(200)).body).toMatchObject({ collectionEnabled: false, deliveryEnabled: true });
    await deliver(token, cat.zone('Zone A').id).expect(201);
    await openRestaurant();
    const second = await cartOf();
    await prisma.restaurantSettings.update({ where: { id: 1 }, data: { deliveryEnabled: false } });
    expect((await deliver(second.token, cat.zone('Zone A').id).expect(409)).body.code).toBe('FULFILMENT_DISABLED');
    await checkout(app, second.token, { fulfilment: 'COLLECTION' }).expect(201);
  });

  it('charges the zone fee current at checkout time, not a stale quote', async () => {
    const zone = cat.zone('Zone C');
    const { token, subtotal } = await cartOf({ sizeCode: 'L', quantity: 6 });
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { minOrderCents: 0, freeDeliveryFromCents: null, feeCents: 12345 } });
    const placed = await deliver(token, zone.id).expect(201);
    expect(placed.body.order.deliveryFeeCents).toBe(12345);
    expect(placed.body.order.subtotalCents).toBe(subtotal);
    await prisma.deliveryZone.update({ where: { id: zone.id }, data: { feeCents: zone.feeCents, minOrderCents: zone.minOrderCents, freeDeliveryFromCents: zone.freeDeliveryFromCents } });
  });

  it('refuses items that became unavailable after they were added', async () => {
    const { token } = await cartOf();
    await prisma.product.update({ where: { slug: 'margherita' }, data: { available: false } });
    try {
      const res = await checkout(app, token).expect(400);
      expect(res.body.code).toBe('ITEMS_UNAVAILABLE');
    } finally {
      await prisma.product.update({ where: { slug: 'margherita' }, data: { available: true } });
    }
  });
});
