import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service';
import { mpesaAmount } from '../src/payments/providers/mpesa.provider';
import { PaystackProvider } from '../src/payments/providers/paystack.provider';
import { API, catalogue, createApp, mockComplete, placeOrder, prisma, setupDb, staffAgent } from './helpers';

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
let payments: PaymentsService;
const http = () => request(app.getHttpServer());
const SECRET = () => process.env.MPESA_CALLBACK_SECRET!;
const PAYSTACK_KEY = 'sk_test_unit';

beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
  payments = app.get(PaymentsService);
  await prisma.restaurantSettings.update({ where: { id: 1 }, data: { staffAlertPhones: ['+254711000111'] } });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env.PAYMENTS_MODE = 'mock';
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_KEY;
});

const orderOf = (reference: string) => prisma.order.findUniqueOrThrow({ where: { reference } });
const payOf = (id: string) => prisma.payment.findUniqueOrThrow({ where: { id } });
const events = (paymentId: string) => prisma.paymentEvent.count({ where: { paymentId } });
const settle = (paymentId: string, over: Partial<Parameters<PaymentsService['settle']>[0]> = {}) =>
  payments.settle({ paymentId, provider: 'mock', eventKey: `t:${Math.random()}`, payload: {}, outcome: 'SUCCEEDED', verified: true, ...over });

describe('duplicate and out-of-order callbacks', () => {
  it('a duplicate success with a different event key is still a no-op', async () => {
    const { reference, paymentId } = await placeOrder(app, cat);
    expect((await settle(paymentId)).status).toBe('applied');
    expect((await settle(paymentId)).status).toBe('duplicate');
    expect((await settle(paymentId)).status).toBe('duplicate');
    const order = await orderOf(reference);
    expect(order.status).toBe('PAID');
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: 'PAID' } })).toBe(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.notification.count({ where: { orderId: order.id, event: 'PAYMENT_CONFIRMED', audience: 'STAFF' } })).toBe(1);
  });

  it('a failure arriving after success does not un-pay the order', async () => {
    const { reference, paymentId } = await placeOrder(app, cat);
    await mockComplete(app, paymentId, true).expect(200);
    const late = await mockComplete(app, paymentId, false).expect(200);
    expect(late.body).toMatchObject({ status: 'duplicate', paymentStatus: 'SUCCEEDED', orderStatus: 'PAID' });
    expect((await orderOf(reference)).status).toBe('PAID');
    expect((await payOf(paymentId)).failureReason).toBeNull();
    expect(await prisma.orderStatusHistory.count({ where: { order: { reference }, toStatus: 'PAYMENT_FAILED' } })).toBe(0);
  });

  it('a success arriving after a failure still pays the order (money was received)', async () => {
    const { reference, paymentId } = await placeOrder(app, cat);
    await mockComplete(app, paymentId, false).expect(200);
    expect((await orderOf(reference)).status).toBe('PAYMENT_FAILED');
    const late = await mockComplete(app, paymentId, true).expect(200);
    expect(late.body).toMatchObject({ status: 'applied', paymentStatus: 'SUCCEEDED', orderStatus: 'PAID' });
  });

  it('a success after the order was cancelled never reopens it', async () => {
    const owner = await staffAgent(app);
    const { reference, paymentId } = await placeOrder(app, cat);
    const order = await orderOf(reference);
    await owner.patch(`${API}/admin/orders/${order.id}/status`).send({ status: 'CANCELLED' }).expect(200);
    await mockComplete(app, paymentId, true).expect(200);
    expect((await orderOf(reference)).status).toBe('CANCELLED');
    const recon = await owner.get(`${API}/admin/payments/reconciliation`).expect(200);
    expect(recon.body.unmatched.map((p: { id: string }) => p.id)).toContain(paymentId);
  });

  it('racing success and failure callbacks settle consistently', async () => {
    const { reference, paymentId } = await placeOrder(app, cat);
    await Promise.all([mockComplete(app, paymentId, true), mockComplete(app, paymentId, false), mockComplete(app, paymentId, true), mockComplete(app, paymentId, false)]);
    const payment = await payOf(paymentId);
    const order = await orderOf(reference);
    // either order of arrival is legitimate, but the pair must agree and success must win over failure
    expect(['PAID', 'PAYMENT_FAILED']).toContain(order.status);
    if (payment.status === 'SUCCEEDED') expect(order.status).toBe('PAID');
    expect((await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: 'PAID' } })) <= 1).toBe(true);
    await mockComplete(app, paymentId, true);
    expect((await orderOf(reference)).status).toBe('PAID');
  });
});

describe('verification of amount, currency and reference', () => {
  it('rejects an amount mismatch (under- or over-payment) and records an unprocessed event', async () => {
    const { reference, paymentId, totalCents } = await placeOrder(app, cat);
    for (const amountCents of [1, totalCents - 1, totalCents + 1, 0]) {
      const r = await settle(paymentId, { amountCents });
      expect(r).toMatchObject({ status: 'rejected', reason: expect.stringContaining('amount mismatch') });
    }
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
    expect((await payOf(paymentId)).status).toBe('PENDING');
    const rejectedEvents = await prisma.paymentEvent.findMany({ where: { paymentId } });
    expect(rejectedEvents.every((e) => e.processedAt === null)).toBe(true);
    expect((await settle(paymentId, { amountCents: totalCents })).status).toBe('applied');
  });

  it('rejects a wrong currency, a wrong reference and unverified successes', async () => {
    const { reference, paymentId } = await placeOrder(app, cat);
    expect((await settle(paymentId, { currency: 'USD' })).reason).toContain('currency');
    expect((await settle(paymentId, { reference: 'someone-elses-ref' })).reason).toContain('reference');
    expect((await settle(paymentId, { verified: false })).reason).toContain('not verified');
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
  });

  it('a rejected event key cannot be replayed to force the payment through', async () => {
    const { paymentId, totalCents } = await placeOrder(app, cat);
    await settle(paymentId, { eventKey: 'replay-1', amountCents: 1 });
    expect((await settle(paymentId, { eventKey: 'replay-1', amountCents: totalCents })).status).toBe('duplicate');
    expect((await payOf(paymentId)).status).toBe('PENDING');
  });

  it('refuses to settle an unknown payment', async () => {
    await expect(settle('no-such-payment')).rejects.toThrow(/not found/i);
  });
});

describe('retry and abandoned payments', () => {
  it('creates a brand-new payment after a failure and leaves the failed one as history', async () => {
    const { reference, paymentId, totalCents } = await placeOrder(app, cat);
    await mockComplete(app, paymentId, false).expect(200);
    const retry = await http().post(`${API}/orders/${reference}/retry-payment`).send({ method: 'MPESA', mpesaPhone: '0722000111' }).expect(200);
    expect(retry.body.payment.id).not.toBe(paymentId);
    expect(retry.body.order.status).toBe('PENDING_PAYMENT');
    const all = await prisma.payment.findMany({ where: { order: { reference } }, orderBy: { createdAt: 'asc' } });
    expect(all.map((p) => p.status)).toEqual(['FAILED', 'PENDING']);
    expect(all[1]!.amountCents).toBe(totalCents);
    expect(all[1]!.phone).toBe('+254722000111');
    await mockComplete(app, retry.body.payment.id, true).expect(200);
    expect((await orderOf(reference)).status).toBe('PAID');
  });

  it('cancels the previous pending payment when a new attempt starts', async () => {
    const { reference, paymentId } = await placeOrder(app, cat);
    const retry = await http().post(`${API}/orders/${reference}/retry-payment`).send({ method: 'CARD' }).expect(200);
    expect((await payOf(paymentId)).status).toBe('CANCELLED');
    expect((await payOf(retry.body.payment.id)).status).toBe('PENDING');
    expect((await orderOf(reference)).paymentMethod).toBe('CARD');
    // a late success for the cancelled attempt still pays the order and closes the new attempt
    await mockComplete(app, paymentId, true).expect(200);
    expect((await orderOf(reference)).status).toBe('PAID');
    expect((await payOf(retry.body.payment.id)).status).toBe('CANCELLED');
  });

  it('refuses retries on paid, cancelled and unknown orders and validates the body', async () => {
    const owner = await staffAgent(app);
    const paid = await placeOrder(app, cat);
    await mockComplete(app, paid.paymentId, true).expect(200);
    const r = await http().post(`${API}/orders/${paid.reference}/retry-payment`).send({ method: 'MPESA' }).expect(409);
    expect(r.body.code).toBe('NOT_PAYABLE');
    const cancelled = await placeOrder(app, cat);
    await owner.patch(`${API}/admin/orders/${(await orderOf(cancelled.reference)).id}/status`).send({ status: 'CANCELLED' }).expect(200);
    await http().post(`${API}/orders/${cancelled.reference}/retry-payment`).send({ method: 'MPESA' }).expect(409);
    await http().post(`${API}/orders/DP-NOPE00/retry-payment`).send({ method: 'MPESA' }).expect(404);
    await http().post(`${API}/orders/${cancelled.reference}/retry-payment`).send({ method: 'BITCOIN' }).expect(400);
    await http().post(`${API}/orders/${cancelled.reference}/retry-payment`).send({ method: 'MPESA', mpesaPhone: 'nope' }).expect(400);
  });

  it('keeps an abandoned PENDING payment visible to staff and flags it once it is stale', async () => {
    const owner = await staffAgent(app);
    const { reference, paymentId } = await placeOrder(app, cat);
    expect((await http().get(`${API}/orders/${reference}/payment-status`).expect(200)).body).toMatchObject({ status: 'PENDING', orderStatus: 'PENDING_PAYMENT' });
    const pending = await owner.get(`${API}/admin/payments?status=PENDING`).expect(200);
    expect(pending.body.items.map((p: { id: string }) => p.id)).toContain(paymentId);
    const fresh = await owner.get(`${API}/admin/payments/reconciliation`).expect(200);
    expect(fresh.body.unmatched.map((p: { id: string }) => p.id)).not.toContain(paymentId);
    await prisma.payment.update({ where: { id: paymentId }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    const stale = await owner.get(`${API}/admin/payments/reconciliation`).expect(200);
    const expectedStale = new Date(Date.now() - 31 * 60_000).getUTCDate() === new Date().getUTCDate();
    if (expectedStale) expect(stale.body.unmatched.map((p: { id: string }) => p.id)).toContain(paymentId);
    // the order is not auto-paid or cancelled just because time passed
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
    const overview = await owner.get(`${API}/admin/overview`).expect(200);
    expect(overview.body.pendingPayments).toBeGreaterThanOrEqual(1);
  });
});

describe('mock endpoint safety', () => {
  it('validates input, 404s for unknown payments and is unavailable outside mock mode', async () => {
    const { paymentId } = await placeOrder(app, cat);
    await http().post(`${API}/payments/mock/${paymentId}/complete`).send({ success: 'yes' }).expect(400);
    await http().post(`${API}/payments/mock/nope/complete`).send({ success: true }).expect(404);
    process.env.PAYMENTS_MODE = 'live';
    await http().post(`${API}/payments/mock/${paymentId}/complete`).send({ success: true }).expect(404);
    expect((await payOf(paymentId)).status).toBe('PENDING');
  });
});

describe('Paystack webhook signature', () => {
  const sign = (raw: string, key = PAYSTACK_KEY) => createHmac('sha512', key).update(raw).digest('hex');
  const send = (raw: string, signature?: string) =>
    http()
      .post(`${API}/payments/paystack/webhook`)
      .set('Content-Type', 'application/json')
      .set(signature === undefined ? {} : { 'x-paystack-signature': signature })
      .send(raw);

  it('validates the HMAC-SHA512 of the raw body in constant time', () => {
    const p = app.get(PaystackProvider);
    const raw = Buffer.from('{"event":"charge.success"}');
    expect(p.validSignature(raw, sign(raw.toString()))).toBe(true);
    expect(p.validSignature(raw, sign(raw.toString(), 'sk_other'))).toBe(false);
    expect(p.validSignature(raw, sign(raw.toString()).toUpperCase())).toBe(false);
    expect(p.validSignature(raw, 'short')).toBe(false);
    expect(p.validSignature(raw, '')).toBe(false);
    expect(p.validSignature(raw, undefined)).toBe(false);
    expect(p.validSignature(undefined, sign('x'))).toBe(false);
    process.env.PAYSTACK_SECRET_KEY = '';
    expect(p.validSignature(raw, sign(raw.toString(), ''))).toBe(false);
  });

  it('rejects missing, wrong, truncated and body-mismatched signatures with 401 and no side effects', async () => {
    const { reference, paymentId } = await placeOrder(app, cat, { paymentMethod: 'CARD' });
    const verify = vi.spyOn(payments.paystack, 'verify');
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: paymentId, id: 1 } });
    await send(raw).expect(401);
    await send(raw, 'deadbeef').expect(401);
    await send(raw, sign(raw).slice(0, -2)).expect(401);
    await send(raw, sign(raw, 'sk_wrong')).expect(401);
    await send(raw, sign(raw + ' ')).expect(401);
    expect(verify).not.toHaveBeenCalled();
    expect(await events(paymentId)).toBe(0);
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
  });

  it('accepts a valid signature over the exact raw bytes (whitespace and unicode intact) and pays the order once', async () => {
    const { reference, paymentId } = await placeOrder(app, cat, { paymentMethod: 'CARD' });
    const payment = await payOf(paymentId);
    vi.spyOn(payments.paystack, 'verify').mockResolvedValue({ outcome: 'SUCCEEDED', amountCents: payment.amountCents, currency: 'KES', reference: payment.providerRef!, receipt: '4242' });
    const raw = `{ "event" : "charge.success", "data": {"reference":"${paymentId}", "id": 777, "customer": "Wanjiku é"} }`;
    await send(raw, sign(raw)).expect(200);
    expect((await orderOf(reference)).status).toBe('PAID');
    expect((await payOf(paymentId)).receipt).toBe('4242');
    await send(raw, sign(raw)).expect(200);
    await send(raw, sign(raw)).expect(200);
    expect(await events(paymentId)).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { order: { reference }, toStatus: 'PAID' } })).toBe(1);
  });

  it('rejects a verified success whose amount differs, and ignores non-charge events and unknown references', async () => {
    const { reference, paymentId } = await placeOrder(app, cat, { paymentMethod: 'CARD' });
    const payment = await payOf(paymentId);
    const verify = vi.spyOn(payments.paystack, 'verify').mockResolvedValue({ outcome: 'SUCCEEDED', amountCents: payment.amountCents - 100, currency: 'KES', reference: payment.providerRef! });
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: paymentId, id: 5 } });
    await send(raw, sign(raw)).expect(200);
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
    const other = JSON.stringify({ event: 'transfer.success', data: { reference: paymentId, id: 6 } });
    await send(other, sign(other)).expect(200);
    const unknown = JSON.stringify({ event: 'charge.success', data: { reference: 'nope', id: 7 } });
    await send(unknown, sign(unknown)).expect(200);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('a failed charge marks the payment failed, and a later success webhook for the same payment still pays it', async () => {
    const { reference, paymentId } = await placeOrder(app, cat, { paymentMethod: 'CARD' });
    const payment = await payOf(paymentId);
    const verify = vi.spyOn(payments.paystack, 'verify').mockResolvedValue({ outcome: 'FAILED', amountCents: payment.amountCents, currency: 'KES', reference: payment.providerRef!, reason: 'Declined' });
    const failRaw = JSON.stringify({ event: 'charge.failed', data: { reference: paymentId, id: 10 } });
    await send(failRaw, sign(failRaw)).expect(200);
    expect((await orderOf(reference)).status).toBe('PAYMENT_FAILED');
    verify.mockResolvedValue({ outcome: 'SUCCEEDED', amountCents: payment.amountCents, currency: 'KES', reference: payment.providerRef!, receipt: '9' });
    const okRaw = JSON.stringify({ event: 'charge.success', data: { reference: paymentId, id: 11 } });
    await send(okRaw, sign(okRaw)).expect(200);
    expect((await orderOf(reference)).status).toBe('PAID');
  });
});

describe('M-Pesa callback', () => {
  const stk = (checkoutId: string, code: number, amount?: number) => ({
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutId,
        ResultCode: code,
        ResultDesc: code === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user',
        ...(amount !== undefined && { CallbackMetadata: { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: 'RGH1ABC234' }, { Name: 'PhoneNumber', Value: 254712345678 }] } }),
      },
    },
  });
  async function mpesaOrder(checkoutId: string) {
    const o = await placeOrder(app, cat, { paymentMethod: 'MPESA' });
    await prisma.payment.update({ where: { id: o.paymentId }, data: { providerRef: checkoutId } });
    return { ...o, payment: await payOf(o.paymentId) };
  }
  const callback = (secret: string, body: object) => http().post(`${API}/payments/mpesa/callback/${secret}`).send(body);

  it('returns 404 and records nothing for the wrong, empty-looking or guessed secret path', async () => {
    const { paymentId, reference } = await mpesaOrder('ws_CO_wrong');
    process.env.PAYMENTS_MODE = 'live';
    const verify = vi.spyOn(payments.mpesa, 'verify');
    const eventsBefore = await prisma.paymentEvent.count();
    for (const secret of ['wrong', SECRET().slice(0, -1), `${SECRET()}x`, SECRET().toUpperCase(), 'x'.repeat(500), '%20']) {
      const res = await callback(secret, stk('ws_CO_wrong', 0, 1)).expect(404);
      expect(res.body).not.toHaveProperty('ResultCode');
    }
    expect(verify).not.toHaveBeenCalled();
    expect(await prisma.paymentEvent.count()).toBe(eventsBefore);
    expect((await payOf(paymentId)).status).toBe('PENDING');
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
  });

  it('rejects every secret when none is configured', async () => {
    const saved = process.env.MPESA_CALLBACK_SECRET;
    process.env.MPESA_CALLBACK_SECRET = '';
    try {
      await callback('', stk('x', 0)).expect(404);
      await callback('anything', stk('x', 0)).expect(404);
    } finally {
      process.env.MPESA_CALLBACK_SECRET = saved;
    }
  });

  it('acknowledges the right secret without processing in mock mode', async () => {
    const { reference } = await mpesaOrder('ws_CO_mock');
    const res = await callback(SECRET(), stk('ws_CO_mock', 0, 1)).expect(200);
    expect(res.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
  });

  it('confirms with an STK query, pays once, and ignores duplicates and later failures', async () => {
    const { reference, payment } = await mpesaOrder('ws_CO_ok');
    process.env.PAYMENTS_MODE = 'live';
    const verify = vi.spyOn(payments.mpesa, 'verify').mockResolvedValue({ outcome: 'SUCCEEDED' });
    const kes = mpesaAmount(payment.amountCents);
    await callback(SECRET(), stk('ws_CO_ok', 0, kes)).expect(200);
    expect((await orderOf(reference)).status).toBe('PAID');
    expect((await payOf(payment.id)).receipt).toBe('RGH1ABC234');
    await callback(SECRET(), stk('ws_CO_ok', 0, kes)).expect(200);
    await callback(SECRET(), stk('ws_CO_ok', 0, kes)).expect(200);
    verify.mockResolvedValue({ outcome: 'FAILED', reason: 'late' });
    await callback(SECRET(), stk('ws_CO_ok', 1032)).expect(200);
    expect((await orderOf(reference)).status).toBe('PAID');
    expect((await payOf(payment.id)).status).toBe('SUCCEEDED');
    expect(await prisma.orderStatusHistory.count({ where: { order: { reference }, toStatus: 'PAID' } })).toBe(1);
  });

  it('ignores a callback whose paid amount does not match, or that the STK query says is pending', async () => {
    const { reference, payment } = await mpesaOrder('ws_CO_amt');
    process.env.PAYMENTS_MODE = 'live';
    const verify = vi.spyOn(payments.mpesa, 'verify').mockResolvedValue({ outcome: 'SUCCEEDED' });
    await callback(SECRET(), stk('ws_CO_amt', 0, 1)).expect(200);
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
    verify.mockResolvedValue({ outcome: 'PENDING' });
    await callback(SECRET(), stk('ws_CO_amt', 0, mpesaAmount(payment.amountCents))).expect(200);
    expect((await orderOf(reference)).status).toBe('PENDING_PAYMENT');
  });

  it('marks the payment failed when the user cancels, then lets a retry succeed', async () => {
    const { reference, payment } = await mpesaOrder('ws_CO_cancel');
    process.env.PAYMENTS_MODE = 'live';
    vi.spyOn(payments.mpesa, 'verify').mockResolvedValue({ outcome: 'FAILED', reason: 'Request cancelled by user' });
    await callback(SECRET(), stk('ws_CO_cancel', 1032)).expect(200);
    expect((await orderOf(reference)).status).toBe('PAYMENT_FAILED');
    expect((await payOf(payment.id)).failureReason).toContain('cancelled');
  });

  it('acknowledges garbage bodies and unknown checkout ids without side effects or errors', async () => {
    process.env.PAYMENTS_MODE = 'live';
    const verify = vi.spyOn(payments.mpesa, 'verify');
    for (const body of [{}, { Body: {} }, { Body: { stkCallback: {} } }, stk('ws_CO_never_issued', 0, 100)]) {
      expect((await callback(SECRET(), body).expect(200)).body.ResultCode).toBe(0);
    }
    expect(verify).not.toHaveBeenCalled();
  });

  it('never leaks the path secret in the request log line', async () => {
    const { Test } = await import('@nestjs/testing');
    const { Logger } = await import('@nestjs/common');
    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/bootstrap');
    const lines: string[] = [];
    vi.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => void lines.push(String(m)));
    const logged = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication({ rawBody: true, logger: false });
    configureApp(logged, { requestLog: true });
    await logged.init();
    await request(logged.getHttpServer()).post(`${API}/payments/mpesa/callback/${SECRET()}`).send({}).expect(200);
    await request(logged.getHttpServer()).post(`${API}/payments/mpesa/callback/guessed-secret`).send({}).expect(404);
    await logged.close();
    const text = lines.join('\n');
    expect(text).toContain('/mpesa/callback/***');
    expect(text).not.toContain(SECRET());
    expect(text).not.toContain('guessed-secret');
  });
});

