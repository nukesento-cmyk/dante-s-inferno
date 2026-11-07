import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, type MockInstance, vi } from 'vitest';
import { EmailProvider } from '../src/notifications/providers/email.provider';
import { API, catalogue, createApp, customerAgent, OWNER, placeOrder, prisma, setupDb, waitFor } from './helpers';

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
const http = () => request(app.getHttpServer());
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('customer account', () => {
  const body = { name: 'Wanjiku Kamau', email: 'Wanjiku@Example.com', phone: '0722 111 222', password: 'Sup3r-secret-pw' };

  it('registers, normalises email/phone, sets an httpOnly cookie and returns the profile', async () => {
    const res = await http().post(`${API}/auth/customer/register`).send(body).expect(201);
    expect(res.body).toEqual({ id: expect.any(String), name: 'Wanjiku Kamau', email: 'wanjiku@example.com', phone: '+254722111222' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/dp_customer=.*HttpOnly.*SameSite=Lax/);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate emails (any case), bad phones and short passwords', async () => {
    await http().post(`${API}/auth/customer/register`).send({ ...body, email: 'WANJIKU@example.com' }).expect(409);
    await http().post(`${API}/auth/customer/register`).send({ ...body, email: 'x@example.com', phone: '123' }).expect(400);
    await http().post(`${API}/auth/customer/register`).send({ ...body, email: 'y@example.com', password: 'short' }).expect(400);
  });

  it('logs in, serves /me, and logs out', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.get(`${API}/auth/customer/me`).expect(401);
    await agent.post(`${API}/auth/customer/login`).send({ email: 'wanjiku@example.com', password: body.password }).expect(200);
    expect((await agent.get(`${API}/auth/customer/me`).expect(200)).body).toMatchObject({ email: 'wanjiku@example.com', phone: '+254722111222' });
    const out = await agent.post(`${API}/auth/customer/logout`).expect(200);
    expect(String(out.headers['set-cookie'])).toMatch(/dp_customer=;/);
    await agent.get(`${API}/auth/customer/me`).expect(401);
  });

  it('rejects wrong passwords, unknown emails and staff credentials on the customer login', async () => {
    await http().post(`${API}/auth/customer/login`).send({ email: 'wanjiku@example.com', password: 'Wrong-pass-123' }).expect(401);
    await http().post(`${API}/auth/customer/login`).send({ email: 'ghost@example.com', password: 'Wrong-pass-123' }).expect(401);
    await http().post(`${API}/auth/customer/login`).send(OWNER).expect(401);
    await http().post(`${API}/auth/staff/login`).send({ email: 'wanjiku@example.com', password: body.password }).expect(401);
  });

  it('rejects a tampered or expired customer session', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/customer/login`).send({ email: 'wanjiku@example.com', password: body.password }).expect(200);
    await http().get(`${API}/auth/customer/me`).set('Cookie', 'dp_customer=abc.def.ghi').expect(401);
    await prisma.user.update({ where: { email: 'wanjiku@example.com' }, data: { active: false } });
    await agent.get(`${API}/auth/customer/me`).expect(401);
    await prisma.user.update({ where: { email: 'wanjiku@example.com' }, data: { active: true } });
  });
});

describe('forgot and reset password', () => {
  const email = 'reset.me@example.com';
  const original = 'Original-pass-12';
  let send: MockInstance<EmailProvider['send']>;

  beforeAll(async () => {
    await http().post(`${API}/auth/customer/register`).send({ name: 'Reset Me', email, phone: '0733444555', password: original }).expect(201);
    send = vi.spyOn(app.get(EmailProvider), 'send').mockResolvedValue({ note: 'spy' });
  });
  afterAll(() => send.mockRestore());

  const forgot = (e: string) => http().post(`${API}/auth/customer/forgot-password`).send({ email: e });
  async function issueToken() {
    send.mockClear();
    await forgot(email).expect(200);
    await waitFor(async () => send.mock.calls.length > 0);
    const text = String(send.mock.calls[0]![2]);
    return /token=([a-f0-9]+)/.exec(text)![1]!;
  }

  it('answers identically for known and unknown emails and only emails real accounts', async () => {
    const known = await forgot(email).expect(200);
    const unknown = await forgot('nobody@example.com').expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(send.mock.calls.every((c) => c[0] === email)).toBe(true);
  });

  it('does not email staff accounts, and stores only a hash of the token', async () => {
    send.mockClear();
    await forgot(OWNER.email).expect(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(send).not.toHaveBeenCalled();
    const token = await issueToken();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.resetTokenHash).toBe(sha256(token));
    expect(user.resetTokenHash).not.toBe(token);
    expect(user.resetTokenExpires!.getTime()).toBeGreaterThan(Date.now());
    expect(user.resetTokenExpires!.getTime()).toBeLessThanOrEqual(Date.now() + 3600_000 + 5000);
  });

  it('resets once, revokes old sessions, and refuses the token a second time', async () => {
    const old = request.agent(app.getHttpServer());
    await old.post(`${API}/auth/customer/login`).send({ email, password: original }).expect(200);
    const token = await issueToken();
    const newPassword = 'Brand-new-pass-34';
    await http().post(`${API}/auth/customer/reset-password`).send({ token, password: newPassword }).expect(200);
    await http().post(`${API}/auth/customer/reset-password`).send({ token, password: 'Another-pass-56' }).expect(400);
    await old.get(`${API}/auth/customer/me`).expect(401);
    await http().post(`${API}/auth/customer/login`).send({ email, password: original }).expect(401);
    await http().post(`${API}/auth/customer/login`).send({ email, password: newPassword }).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.resetTokenHash).toBeNull();
    expect(user.resetTokenExpires).toBeNull();
  });

  it('refuses an expired token and leaves the password unchanged', async () => {
    const token = await issueToken();
    await prisma.user.update({ where: { email }, data: { resetTokenExpires: new Date(Date.now() - 1000) } });
    await http().post(`${API}/auth/customer/reset-password`).send({ token, password: 'Expired-try-78' }).expect(400);
    await http().post(`${API}/auth/customer/login`).send({ email, password: 'Expired-try-78' }).expect(401);
  });

  it('refuses garbage tokens and weak new passwords (without burning the token)', async () => {
    await http().post(`${API}/auth/customer/reset-password`).send({ token: 'f'.repeat(64), password: 'Whatever-pass-9' }).expect(400);
    await http().post(`${API}/auth/customer/reset-password`).send({ token: 'short', password: 'Whatever-pass-9' }).expect(400);
    const token = await issueToken();
    await http().post(`${API}/auth/customer/reset-password`).send({ token, password: 'password' }).expect(400);
    await http().post(`${API}/auth/customer/reset-password`).send({ token, password: 'Strong-enough-pw-1' }).expect(200);
  });

  it('a new forgot request invalidates the previous token', async () => {
    const first = await issueToken();
    const second = await issueToken();
    expect(second).not.toBe(first);
    await http().post(`${API}/auth/customer/reset-password`).send({ token: first, password: 'Strong-enough-pw-2' }).expect(400);
    await http().post(`${API}/auth/customer/reset-password`).send({ token: second, password: 'Strong-enough-pw-2' }).expect(200);
  });
});

describe('account orders isolation', () => {
  it('shows each customer only their own orders', async () => {
    const a = await customerAgent(app, { phone: '0711000001' });
    const b = await customerAgent(app, { phone: '0711000002' });
    const orderA = await placeOrder(app, cat, { agent: a.agent, customer: { name: a.name, phone: a.phone } });
    const orderB1 = await placeOrder(app, cat, { agent: b.agent, customer: { name: b.name, phone: b.phone } });
    const orderB2 = await placeOrder(app, cat, { agent: b.agent, customer: { name: b.name, phone: b.phone } });
    const listA = (await a.agent.get(`${API}/account/orders`).expect(200)).body as { reference: string }[];
    const listB = (await b.agent.get(`${API}/account/orders`).expect(200)).body as { reference: string }[];
    expect(listA.map((o) => o.reference)).toEqual([orderA.reference]);
    expect(listB.map((o) => o.reference).sort()).toEqual([orderB1.reference, orderB2.reference].sort());
    await http().get(`${API}/account/orders`).expect(401);
  });

  it('does not let customer A open B\'s order by reference, only the owner or the right phone can', async () => {
    const a = await customerAgent(app, { phone: '0711000003' });
    const b = await customerAgent(app, { phone: '0711000004' });
    const orderB = await placeOrder(app, cat, { agent: b.agent, customer: { name: b.name, phone: b.phone } });
    await a.agent.get(`${API}/orders/${orderB.reference}`).expect(404);
    await a.agent.get(`${API}/orders/${orderB.reference}`).query({ phone: a.phone }).expect(404);
    await b.agent.get(`${API}/orders/${orderB.reference}`).expect(200);
    await a.agent.get(`${API}/orders/${orderB.reference}`).query({ phone: b.phone }).expect(200);
  });

  it('does not attach a guest order to an account that shares a phone number', async () => {
    const owner = await customerAgent(app, { phone: '0711000005' });
    const guest = await placeOrder(app, cat, { customer: { name: 'Guest', phone: owner.phone } });
    const list = (await owner.agent.get(`${API}/account/orders`).expect(200)).body as { reference: string }[];
    expect(list.map((o) => o.reference)).not.toContain(guest.reference);
  });
});

describe('guest order lookup', () => {
  it('requires the correct phone and leaks nothing about which half was wrong', async () => {
    const { reference } = await placeOrder(app, cat, { customer: { name: 'Amina Wanjiru', phone: '0712345678' } });
    for (const phone of ['0712345678', '+254712345678', '254712345678', '0712 345 678']) {
      const ok = await http().get(`${API}/orders/${reference}`).query({ phone }).expect(200);
      expect(ok.body.reference).toBe(reference);
      expect(JSON.stringify(ok.body)).not.toMatch(/712345678|passwordHash|email/);
    }
    await http().get(`${API}/orders/${reference.toLowerCase()}`).query({ phone: '0712345678' }).expect(200);

    const wrongPhone = await http().get(`${API}/orders/${reference}`).query({ phone: '0799999999' });
    const wrongRef = await http().get(`${API}/orders/DP-ZZZZZZ`).query({ phone: '0712345678' });
    const bothWrong = await http().get(`${API}/orders/DP-ZZZZZZ`).query({ phone: '0799999999' });
    const noPhone = await http().get(`${API}/orders/${reference}`);
    const junkPhone = await http().get(`${API}/orders/${reference}`).query({ phone: 'abc' });
    const arrayPhone = await http().get(`${API}/orders/${reference}?phone=0712345678&phone=0799999999`);
    for (const r of [wrongPhone, wrongRef, bothWrong, noPhone, junkPhone]) expect(r.status).toBe(404);
    expect(arrayPhone.status).toBe(404);
    expect(wrongPhone.body).toEqual(wrongRef.body);
    expect(wrongPhone.body).toEqual(bothWrong.body);
    expect(wrongPhone.body).toEqual(noPhone.body);
    expect(wrongPhone.body).toEqual({ statusCode: 404, error: 'Not Found', message: 'Order not found' });
  });
});
