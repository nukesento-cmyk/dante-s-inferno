import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service';
import { EmailProvider } from '../src/notifications/providers/email.provider';
import { SmsProvider } from '../src/notifications/providers/sms.provider';
import { API, catalogue, createApp, mockComplete, placeOrder, prisma, setupDb, staffAgent, waitFor } from './helpers';

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
let svc: NotificationsService;
const STAFF_PHONE = '+254711000111';
const STAFF_EMAIL = 'kitchen-alerts@dantespizza.co.ke';

beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
  svc = app.get(NotificationsService);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
afterEach(() => vi.restoreAllMocks());

/** Puts notification configuration into a known state: SMS+EMAIL channels on, WhatsApp off, only the listed settings enabled. */
async function configure(opts: { channels?: Record<string, boolean>; enabled?: string[]; phones?: string[]; emails?: string[] } = {}) {
  const channels = { SMS: true, EMAIL: true, WHATSAPP: false, ...opts.channels };
  for (const [channel, enabled] of Object.entries(channels)) {
    await prisma.notificationChannelConfig.upsert({ where: { channel: channel as 'SMS' }, update: { enabled }, create: { channel: channel as 'SMS', enabled } });
  }
  const on = new Set(opts.enabled ?? ['SMS:CUSTOMER:PAYMENT_CONFIRMED', 'EMAIL:CUSTOMER:PAYMENT_CONFIRMED', 'SMS:STAFF:PAYMENT_CONFIRMED', 'EMAIL:STAFF:PAYMENT_CONFIRMED', 'WHATSAPP:CUSTOMER:PAYMENT_CONFIRMED']);
  for (const s of await prisma.notificationSetting.findMany({ where: { event: 'PAYMENT_CONFIRMED' } })) {
    await prisma.notificationSetting.update({ where: { id: s.id }, data: { enabled: on.has(`${s.channel}:${s.audience}:${s.event}`) } });
  }
  await prisma.restaurantSettings.update({ where: { id: 1 }, data: { staffAlertPhones: opts.phones ?? [STAFF_PHONE], staffAlertEmails: opts.emails ?? [STAFF_EMAIL] } });
}

async function orderWithEmail() {
  const { reference } = await placeOrder(app, cat, { customer: { name: 'Amina Wanjiru', phone: '0712345678', email: 'amina@example.com' } });
  await new Promise((r) => setTimeout(r, 150)); // let the fire-and-forget ORDER_RECEIVED dispatch settle
  const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
  await prisma.notification.deleteMany({});
  return order;
}

const rows = async (orderId: string, event = 'PAYMENT_CONFIRMED') =>
  (await prisma.notification.findMany({ where: { orderId, event: event as 'PAYMENT_CONFIRMED' }, orderBy: [{ channel: 'asc' }, { audience: 'asc' }] })).map((n) => `${n.channel}:${n.audience}:${n.recipient}`);

describe('dispatch gating', () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany({});
  });

  it('sends to every enabled channel x audience pair and to the right recipients', async () => {
    await configure();
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    expect((await rows(order.id)).sort()).toEqual(
      ['EMAIL:CUSTOMER:amina@example.com', `EMAIL:STAFF:${STAFF_EMAIL}`, 'SMS:CUSTOMER:+254712345678', `SMS:STAFF:${STAFF_PHONE}`].sort(),
    );
  });

  it('skips a channel that is switched off, even if its settings are on', async () => {
    await configure({ channels: { SMS: false } });
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    expect((await rows(order.id)).some((r) => r.startsWith('SMS'))).toBe(false);
    expect((await rows(order.id)).length).toBe(2);
  });

  it('never sends WhatsApp while the channel is off', async () => {
    await configure({ channels: { WHATSAPP: false } });
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    expect((await rows(order.id)).some((r) => r.startsWith('WHATSAPP'))).toBe(false);
    await configure({ channels: { WHATSAPP: true } });
    await prisma.notification.deleteMany({});
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    expect(await rows(order.id)).toContain('WHATSAPP:CUSTOMER:+254712345678');
  });

  it('skips a pair whose setting is off', async () => {
    await configure({ enabled: ['SMS:CUSTOMER:PAYMENT_CONFIRMED'] });
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    expect(await rows(order.id)).toEqual(['SMS:CUSTOMER:+254712345678']);
  });

  it('sends nothing for events without enabled settings', async () => {
    await configure();
    const order = await orderWithEmail();
    await svc.dispatch('ORDER_COMPLETED', order.id);
    expect(await rows(order.id, 'ORDER_COMPLETED')).toEqual([]);
  });

  it('skips a pair that has no template', async () => {
    await configure();
    await prisma.notificationTemplate.deleteMany({ where: { channel: 'SMS', audience: 'CUSTOMER', event: 'PAYMENT_CONFIRMED' } });
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    expect(await rows(order.id)).not.toContain('SMS:CUSTOMER:+254712345678');
    expect(await rows(order.id)).toContain(`SMS:STAFF:${STAFF_PHONE}`);
    await prisma.notificationTemplate.create({ data: { channel: 'SMS', audience: 'CUSTOMER', event: 'PAYMENT_CONFIRMED', body: 'Hi {customerName}, order {orderReference} is paid.' } });
  });

  it('sends staff alerts to every configured phone and email, none when the lists are empty', async () => {
    await configure({ phones: ['+254711000111', '+254722000222'], emails: ['a@x.com', 'b@x.com'] });
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    const r = await rows(order.id);
    expect(r.filter((x) => x.startsWith('SMS:STAFF')).sort()).toEqual(['SMS:STAFF:+254711000111', 'SMS:STAFF:+254722000222']);
    expect(r.filter((x) => x.startsWith('EMAIL:STAFF')).sort()).toEqual(['EMAIL:STAFF:a@x.com', 'EMAIL:STAFF:b@x.com']);
    await prisma.notification.deleteMany({});
    await configure({ phones: [], emails: [] });
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    expect((await rows(order.id)).filter((x) => x.includes(':STAFF:'))).toEqual([]);
  });

  it('does not email customers who gave no email address', async () => {
    await configure();
    const { reference } = await placeOrder(app, cat, { customer: { name: 'No Email', phone: '0700123123' } });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
    await prisma.notification.deleteMany({});
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    expect((await rows(order.id)).some((r) => r.startsWith('EMAIL:CUSTOMER'))).toBe(false);
  });

  it('renders the template placeholders into the stored message', async () => {
    await configure({ enabled: ['SMS:CUSTOMER:PAYMENT_CONFIRMED'] });
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    const n = await prisma.notification.findFirstOrThrow({ where: { orderId: order.id } });
    expect(n.body).toContain(order.reference);
    expect(n.body).toContain('Amina');
    expect(n.body).not.toMatch(/\{\w+\}/);
  });

  it('can be reconfigured through the admin API and the change takes effect', async () => {
    await configure({ enabled: [] });
    const owner = await staffAgent(app);
    await owner.put(`${API}/admin/settings/notifications/settings`).send([{ channel: 'SMS', event: 'PAYMENT_CONFIRMED', audience: 'CUSTOMER', enabled: true }]).expect(200);
    await owner.put(`${API}/admin/settings/notifications/channels`).send({ channel: 'SMS', enabled: true }).expect(200);
    await owner.put(`${API}/admin/settings/notifications/templates/SMS/PAYMENT_CONFIRMED/CUSTOMER`).send({ subject: null, body: 'Paid {orderReference} {total}' }).expect(200);
    await owner.put(`${API}/admin/settings/notifications/templates/SMS/PAYMENT_CONFIRMED/CUSTOMER`).send({ subject: null, body: '' }).expect(400);
    await owner.put(`${API}/admin/settings/notifications/templates/FAX/PAYMENT_CONFIRMED/CUSTOMER`).send({ subject: null, body: 'x' }).expect(400);
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    const n = await prisma.notification.findFirstOrThrow({ where: { orderId: order.id } });
    expect(n.body).toMatch(/^Paid DP-[A-Z0-9]+ KES/);
    const snapshot = (await owner.get(`${API}/admin/settings/notifications`).expect(200)).body;
    expect(snapshot.channels.find((c: { channel: string }) => c.channel === 'SMS')).toEqual({ channel: 'SMS', enabled: true, configured: false });
  });
});

describe('providers', () => {
  it('log and mark SENT with the note "logged" when credentials are missing', async () => {
    await configure({ enabled: ['SMS:CUSTOMER:PAYMENT_CONFIRMED', 'EMAIL:CUSTOMER:PAYMENT_CONFIRMED'] });
    const order = await orderWithEmail();
    await svc.dispatch('PAYMENT_CONFIRMED', order.id);
    const all = await prisma.notification.findMany({ where: { orderId: order.id } });
    expect(all).toHaveLength(2);
    for (const n of all) expect(n).toMatchObject({ status: 'SENT', note: 'logged', error: null, sentAt: expect.any(Date) });
    expect(app.get(SmsProvider).configured).toBe(false);
    expect(app.get(EmailProvider).configured).toBe(false);
  });

  it('record FAILED with an error when a provider throws, without throwing themselves', async () => {
    await configure({ enabled: ['SMS:CUSTOMER:PAYMENT_CONFIRMED', 'EMAIL:CUSTOMER:PAYMENT_CONFIRMED'] });
    vi.spyOn(app.get(SmsProvider), 'send').mockRejectedValue(new Error('Africa\'s Talking responded 500'));
    const order = await orderWithEmail();
    await expect(svc.dispatch('PAYMENT_CONFIRMED', order.id)).resolves.toBeUndefined();
    const sms = await prisma.notification.findFirstOrThrow({ where: { orderId: order.id, channel: 'SMS' } });
    expect(sms).toMatchObject({ status: 'FAILED', error: expect.stringContaining('500'), sentAt: null });
    // one failure does not stop the others
    expect(await prisma.notification.findFirstOrThrow({ where: { orderId: order.id, channel: 'EMAIL' } })).toMatchObject({ status: 'SENT' });
  });

  it('a failing provider never fails the payment request, and the order is still PAID', async () => {
    await configure();
    vi.spyOn(app.get(SmsProvider), 'send').mockRejectedValue(new Error('boom'));
    vi.spyOn(app.get(EmailProvider), 'send').mockRejectedValue(new Error('smtp down'));
    const { reference, paymentId } = await placeOrder(app, cat, { customer: { name: 'Amina', phone: '0712345678', email: 'amina@example.com' } });
    const res = await mockComplete(app, paymentId, true).expect(200);
    expect(res.body).toMatchObject({ status: 'applied', orderStatus: 'PAID' });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
    const failed = await waitFor(async () => (await prisma.notification.count({ where: { orderId: order.id, event: 'PAYMENT_CONFIRMED', status: 'FAILED' } })) >= 3);
    expect(failed).toBe(true);
  });

  it('a crashing dispatch never fails checkout or the admin status change', async () => {
    vi.spyOn(svc, 'dispatch').mockRejectedValue(new Error('dispatch exploded'));
    const { reference, paymentId } = await placeOrder(app, cat);
    await mockComplete(app, paymentId, true).expect(200);
    const owner = await staffAgent(app);
    const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
    await owner.patch(`${API}/admin/orders/${order.id}/status`).send({ status: 'ACCEPTED' }).expect(200);
    expect(() => svc.notify('ORDER_ACCEPTED', 'missing-order')).not.toThrow();
    expect((await prisma.order.findUniqueOrThrow({ where: { reference } })).status).toBe('ACCEPTED');
  });

  it('ignore orders that no longer exist', async () => {
    await expect(svc.dispatch('PAYMENT_CONFIRMED', 'gone')).resolves.toBeUndefined();
  });
});

describe('preview and test-send endpoints', () => {
  it('previews a template with sample data and leaves unknown placeholders alone', async () => {
    const manager = await staffAgent(app, 'MANAGER');
    const res = await manager.post(`${API}/admin/settings/notifications/preview`).send({ body: 'Hi {customerName}, {orderReference} {total} {mystery}' }).expect(200);
    expect(res.body).toEqual({ rendered: 'Hi Amina, DP-7K3M9Q KES 1,950 {mystery}' });
    await manager.post(`${API}/admin/settings/notifications/preview`).send({ body: 'x'.repeat(1001) }).expect(400);
    await manager.post(`${API}/admin/settings/notifications/preview`).send({}).expect(400);
    await (await staffAgent(app, 'KITCHEN')).post(`${API}/admin/settings/notifications/preview`).send({ body: 'x' }).expect(403);
  });

  it('test-sends over a channel with no credentials: SENT, logged, recorded as a STAFF notification', async () => {
    const owner = await staffAgent(app);
    await prisma.notification.deleteMany({});
    const res = await owner.post(`${API}/admin/settings/notifications/test`).send({ channel: 'SMS', recipient: '0712 000 111' }).expect(200);
    expect(res.body).toEqual({ status: 'SENT', note: 'logged', error: null });
    expect(await prisma.notification.findFirstOrThrow({})).toMatchObject({ channel: 'SMS', audience: 'STAFF', recipient: '+254712000111', orderId: null, event: null });
    const email = await owner.post(`${API}/admin/settings/notifications/test`).send({ channel: 'EMAIL', recipient: 'boss@example.com' }).expect(200);
    expect(email.body.status).toBe('SENT');
  });

  it('reports a provider failure in the response body without a 5xx', async () => {
    vi.spyOn(app.get(SmsProvider), 'send').mockRejectedValue(new Error('gateway timeout'));
    const owner = await staffAgent(app);
    const res = await owner.post(`${API}/admin/settings/notifications/test`).send({ channel: 'SMS', recipient: '0712000111' }).expect(200);
    expect(res.body).toMatchObject({ status: 'FAILED', error: 'gateway timeout' });
  });

  it('validates the recipient and is owner-only', async () => {
    const owner = await staffAgent(app);
    await owner.post(`${API}/admin/settings/notifications/test`).send({ channel: 'SMS', recipient: 'not a phone' }).expect(400);
    await owner.post(`${API}/admin/settings/notifications/test`).send({ channel: 'PIGEON', recipient: '0712000111' }).expect(400);
    await (await staffAgent(app, 'MANAGER')).post(`${API}/admin/settings/notifications/test`).send({ channel: 'SMS', recipient: '0712000111' }).expect(403);
    await request(app.getHttpServer()).post(`${API}/admin/settings/notifications/test`).send({ channel: 'SMS', recipient: '0712000111' }).expect(401);
  });
});
