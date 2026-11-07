import type { INestApplication } from '@nestjs/common';
import { priceLine, priceOrder } from '@dantes/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addItem, catalogue, createApp, newCart, prisma, setupDb } from './helpers';

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

const item = (over: Record<string, unknown> = {}) => ({
  productId: cat.product('pepperoni').id,
  sizeId: cat.size('M').id,
  crustId: cat.crust('Deep pan').id,
  quantity: 2,
  ...over,
});

describe('cart', () => {
  it('prices lines server-side exactly as priceLine does', async () => {
    const token = await newCart(app);
    const extras = ['mushrooms', 'bacon'].map((s) => cat.ingredient(s));
    const res = await addItem(app, token, item({ addIngredientIds: extras.map((i) => i.id) })).expect(201);
    const expected = priceLine({
      sizePriceCents: cat.product('pepperoni').prices.find((p) => p.sizeId === cat.size('M').id)!.priceCents,
      crustAdjustmentCents: cat.crust('Deep pan').adjustments.find((a) => a.sizeId === cat.size('M').id)!.adjustmentCents,
      extraToppingSurchargesCents: extras.map((i) => i.surchargeCents ?? i.group.surchargeCents),
      quantity: 2,
    });
    expect(res.body.items[0]).toMatchObject({ unitPriceCents: expected.unitPriceCents, lineTotalCents: expected.lineTotalCents, unavailable: false });
    expect(res.body.subtotalCents).toBe(expected.lineTotalCents);
    expect(res.body.items[0].added).toHaveLength(2);
  });

  it('ignores any price sent by the client', async () => {
    const token = await newCart(app);
    const res = await addItem(app, token, item({ unitPriceCents: 1, priceCents: 1 })).expect(201);
    expect(res.body.items[0].unitPriceCents).toBeGreaterThan(100);
  });

  it('rejects disallowed extras, removed non-defaults, too many extras and unavailable crust/size pairs', async () => {
    const token = await newCart(app);
    await addItem(app, token, { ...item(), productId: cat.product('veggie-supreme').id, addIngredientIds: [cat.ingredient('pepperoni').id] }).expect(400);
    await addItem(app, token, item({ removeIngredientIds: [cat.ingredient('onion').id] })).expect(400);
    await addItem(app, token, item({ crustId: cat.crust('Stuffed').id, sizeId: cat.size('S').id })).expect(400);
    await prisma.product.update({ where: { slug: 'margherita' }, data: { maxExtraToppings: 1 } });
    await addItem(app, token, item({ productId: cat.product('margherita').id, addIngredientIds: [cat.ingredient('onion').id, cat.ingredient('beef').id] })).expect(400);
    await addItem(app, token, item({ productId: cat.product('margherita').id, addIngredientIds: [cat.ingredient('onion').id] })).expect(201);
    await prisma.product.update({ where: { slug: 'margherita' }, data: { maxExtraToppings: null } });
  });

  it('flags items that became unavailable and excludes them from the subtotal', async () => {
    const token = await newCart(app);
    await addItem(app, token, item()).expect(201);
    await addItem(app, token, item({ productId: cat.product('hawaiian').id })).expect(201);
    await prisma.product.update({ where: { slug: 'hawaiian' }, data: { available: false } });
    const res = await request(app.getHttpServer()).get('/api/v1/cart').set('X-Cart-Token', token).expect(200);
    expect(res.body.items.map((i: { unavailable: boolean }) => i.unavailable)).toEqual([false, true]);
    expect(res.body.subtotalCents).toBe(res.body.items[0].lineTotalCents);
    await prisma.product.update({ where: { slug: 'hawaiian' }, data: { available: true } });
  });

  it('quote equals the shared priceOrder result', async () => {
    const token = await newCart(app);
    const res = await addItem(app, token, item({ quantity: 1 })).expect(201);
    const zone = cat.zone('Zone B');
    const quote = await request(app.getHttpServer()).post('/api/v1/cart/quote').set('X-Cart-Token', token).send({ fulfilment: 'DELIVERY', deliveryZoneId: zone.id }).expect(200);
    expect(quote.body).toEqual(
      priceOrder({ lineTotalsCents: [res.body.items[0].lineTotalCents], fulfilment: 'DELIVERY', zone, packagingFeeCents: 0, vatRateBps: 1600, pricesIncludeVat: true }),
    );
  });

  it('updates and removes items', async () => {
    const token = await newCart(app);
    const res = await addItem(app, token, item({ quantity: 1 })).expect(201);
    const id = res.body.items[0].id;
    const patched = await request(app.getHttpServer()).patch(`/api/v1/cart/items/${id}`).set('X-Cart-Token', token).send({ quantity: 3 }).expect(200);
    expect(patched.body.items[0].quantity).toBe(3);
    const removed = await request(app.getHttpServer()).delete(`/api/v1/cart/items/${id}`).set('X-Cart-Token', token).expect(200);
    expect(removed.body.items).toHaveLength(0);
  });
});
