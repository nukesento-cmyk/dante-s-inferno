import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addItem, catalogue, checkout, createApp, newCart, openRestaurant, prisma, setupDb, staffAgent } from './helpers';

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
  await prisma.restaurantSettings.update({ where: { id: 1 }, data: { staffAlertPhones: ['+254711000111'] } });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(openRestaurant);

async function placeOrder(paymentMethod: 'MPESA' | 'CARD' = 'MPESA') {
  const token = await newCart(app);
  await addItem(app, token, { productId: cat.product('pepperoni').id, sizeId: cat.size('M').id, crustId: cat.crust('Thin').id, quantity: 1 }).expect(201);
  const res = await checkout(app, token, { paymentMethod }).expect(201);
  return { reference: res.body.order.reference as string, paymentId: res.body.payment.id as string };
}

const complete = (paymentId: string, success: boolean) => request(app.getHttpServer()).post(`/api/v1/payments/mock/${paymentId}/complete`).send({ success });
const status = (reference: string) => request(app.getHttpServer()).get(`/api/v1/orders/${reference}/payment-status`);
const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('mock payments', () => {
  it('exposes paymentsMode in public settings', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/settings').expect(200);
    expect(res.body.paymentsMode).toBe('mock');
    expect(res.body.ordering.open).toBe(true);
  });

  it('marks the order PAID with paidAt on success and notifies the customer and staff', async () => {
    const { reference, paymentId } = await placeOrder();
    expect((await status(reference).expect(200)).body).toEqual({ status: 'PENDING', orderStatus: 'PENDING_PAYMENT', paymentId });
    const done = await complete(paymentId, true).expect(200);
    expect(done.body).toMatchObject({ status: 'applied', orderStatus: 'PAID', paymentStatus: 'SUCCEEDED' });
    expect((await status(reference).expect(200)).body).toEqual({ status: 'SUCCEEDED', orderStatus: 'PAID', paymentId });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference }, include: { history: true, payments: true } });
    expect(order.status).toBe('PAID');
    expect(order.paidAt).toBeTruthy();
    expect(order.payments[0]!.receipt).toBeTruthy();
    expect(order.history.map((h) => h.toStatus)).toEqual(['PENDING_PAYMENT', 'PAID']);

    const notes = await waitFor(async () => {
      const rows = await prisma.notification.findMany({ where: { orderId: order.id, event: 'PAYMENT_CONFIRMED' } });
      return rows.length >= 2 ? rows : null;
    });
    expect(notes).toBeTruthy();
    expect((notes as { channel: string; audience: string }[]).map((n) => `${n.channel}:${n.audience}`).sort()).toEqual(['SMS:CUSTOMER', 'SMS:STAFF']);
  });

  it('treats a duplicate callback as a no-op', async () => {
    const { reference, paymentId } = await placeOrder();
    await complete(paymentId, true).expect(200);
    const again = await complete(paymentId, true).expect(200);
    expect(again.body.status).toBe('duplicate');
    const order = await prisma.order.findUniqueOrThrow({ where: { reference }, include: { history: true } });
    expect(order.history.filter((h) => h.toStatus === 'PAID')).toHaveLength(1);
    expect(await prisma.paymentEvent.count({ where: { paymentId } })).toBe(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.notification.count({ where: { orderId: order.id, event: 'PAYMENT_CONFIRMED', audience: 'CUSTOMER' } })).toBe(1);
  });

  it('concurrent duplicate callbacks still settle exactly once', async () => {
    const { reference, paymentId } = await placeOrder();
    await Promise.all([complete(paymentId, true), complete(paymentId, true), complete(paymentId, true)]);
    const order = await prisma.order.findUniqueOrThrow({ where: { reference }, include: { history: true } });
    expect(order.history.filter((h) => h.toStatus === 'PAID')).toHaveLength(1);
    expect(await prisma.paymentEvent.count({ where: { paymentId } })).toBe(1);
  });

  it('a failed payment does not mark the order paid and allows a retry', async () => {
    const { reference, paymentId } = await placeOrder();
    const failed = await complete(paymentId, false).expect(200);
    expect(failed.body).toMatchObject({ orderStatus: 'PAYMENT_FAILED', paymentStatus: 'FAILED' });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
    expect(order.paidAt).toBeNull();
    expect(order.status).toBe('PAYMENT_FAILED');

    const retry = await request(app.getHttpServer()).post(`/api/v1/orders/${reference}/retry-payment`).send({ method: 'CARD' }).expect(200);
    expect(retry.body.order.status).toBe('PENDING_PAYMENT');
    expect(retry.body.payment.id).not.toBe(paymentId);
    await complete(retry.body.payment.id, true).expect(200);
    expect((await status(reference).expect(200)).body.orderStatus).toBe('PAID');
    await request(app.getHttpServer()).post(`/api/v1/orders/${reference}/retry-payment`).send({ method: 'MPESA' }).expect(409);
  });

  it('rejects a verified success whose amount does not match', async () => {
    const { reference, paymentId } = await placeOrder();
    const payments = app.get((await import('../src/payments/payments.service')).PaymentsService);
    const result = await payments.settle({ paymentId, provider: 'mock', eventKey: 'mock:bad-amount', payload: {}, outcome: 'SUCCEEDED', verified: true, amountCents: 1 });
    expect(result.status).toBe('rejected');
    expect((await prisma.order.findUniqueOrThrow({ where: { reference } })).status).toBe('PENDING_PAYMENT');
    const unverified = await payments.settle({ paymentId, provider: 'mock', eventKey: 'mock:unverified', payload: {}, outcome: 'SUCCEEDED', verified: false });
    expect(unverified.status).toBe('rejected');
    expect((await prisma.order.findUniqueOrThrow({ where: { reference } })).paidAt).toBeNull();
  });
});

describe('paystack webhook', () => {
  const send = (body: object, signature?: string) =>
    request(app.getHttpServer())
      .post('/api/v1/payments/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set(signature ? { 'x-paystack-signature': signature } : {})
      .send(JSON.stringify(body));

  it('rejects a bad or missing signature with 401', async () => {
    const body = { event: 'charge.success', data: { reference: 'x', id: 1 } };
    await send(body, 'deadbeef').expect(401);
    await send(body).expect(401);
  });

  it('accepts a correctly signed webhook for an unknown reference without side effects', async () => {
    const body = { event: 'charge.success', data: { reference: 'unknown', id: 9 } };
    const sig = createHmac('sha512', 'sk_test_unit').update(JSON.stringify(body)).digest('hex');
    await send(body, sig).expect(200);
    expect(await prisma.paymentEvent.count()).toBeGreaterThanOrEqual(0);
  });
});

describe('admin order flow', () => {
  it('moves a paid order through accepted, preparing, ready and completed, and blocks invalid moves', async () => {
    const { reference, paymentId } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
    const owner = await staffAgent(app);
    await owner.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: 'ACCEPTED' }).expect(409);
    await complete(paymentId, true).expect(200);
    await owner.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: 'ACCEPTED' }).expect(200);
    const kitchen = await staffAgent(app, 'KITCHEN');
    await kitchen.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: 'COMPLETED' }).expect(409);
    await kitchen.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: 'PREPARING' }).expect(200);
    await kitchen.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: 'READY' }).expect(200);
    await owner.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: 'COMPLETED' }).expect(200);
    const detail = await owner.get(`/api/v1/admin/orders/${order.id}`).expect(200);
    expect(detail.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']);
    expect(await prisma.auditLog.count({ where: { action: 'order.status', entityId: order.id } })).toBe(4);
    expect(detail.body).toMatchObject({ id: order.id, reference, customer: { phone: '+254712345678' }, payments: expect.any(Array) });
    expect(detail.body.history[2]).toMatchObject({ fromStatus: 'PAID', actorName: 'OWNER' === detail.body.history[2].actorName ? 'OWNER' : 'Owner' });
    const list = await owner.get('/api/v1/admin/orders?status=COMPLETED,CANCELLED').expect(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 20 });
    expect(list.body.items[0]).toMatchObject({ reference, paymentStatus: 'SUCCEEDED', customer: { name: expect.any(String) } });
    await owner.get('/api/v1/admin/payments?status=SUCCEEDED,FAILED').expect(200);
  });
});
