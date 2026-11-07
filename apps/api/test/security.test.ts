import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { validateEnv } from '../src/config/env';
import { maskSensitive } from '../src/common/mask';
import { passwordProblem } from '../src/common/password-policy';
import { PrismaService } from '../src/core/prisma.service';
import { API, catalogue, createApp, customerAgent, OWNER, prisma, setupDb, staffAgent } from './helpers';

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
const http = () => request(app.getHttpServer());
const STOREFRONT = process.env.STOREFRONT_URL ?? 'http://localhost:5173';

beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
afterEach(() => vi.restoreAllMocks());

describe('environment validation', () => {
  const good = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://x@localhost/db',
    JWT_SECRET: 'x'.repeat(8) + 'Q7!rT2mZp9vLkW4sD1fGh6JcB3nYa0Ue',
    STOREFRONT_URL: 'https://dantespizza.co.ke',
    ADMIN_URL: 'https://admin.dantespizza.co.ke',
    PAYMENTS_MODE: 'live',
    MPESA_CALLBACK_SECRET: 'p'.repeat(10) + 'R4nd0mCallbackPathSecret',
    PAYSTACK_SECRET_KEY: 'sk_live_x',
  };
  it('accepts a complete production configuration', () => {
    expect(() => validateEnv(good)).not.toThrow();
  });
  it.each([
    ['a default JWT secret', { JWT_SECRET: 'dev-secret' }, 'JWT_SECRET'],
    ['a change-me JWT secret', { JWT_SECRET: 'change-me-change-me-change-me-change-me' }, 'JWT_SECRET'],
    ['a short JWT secret', { JWT_SECRET: 'short' }, 'JWT_SECRET'],
    ['a missing JWT secret', { JWT_SECRET: undefined }, 'JWT_SECRET'],
    ['mock payments', { PAYMENTS_MODE: 'mock' }, 'PAYMENTS_MODE'],
    ['a weak M-Pesa callback secret', { MPESA_CALLBACK_SECRET: 'abc' }, 'MPESA_CALLBACK_SECRET'],
    ['http origins', { STOREFRONT_URL: 'http://dantespizza.co.ke' }, 'STOREFRONT_URL'],
    ['a missing admin url', { ADMIN_URL: undefined }, 'ADMIN_URL'],
  ])('refuses production with %s', (_n, over, key) => {
    expect(() => validateEnv({ ...good, ...over } as NodeJS.ProcessEnv)).toThrow(new RegExp(key));
  });
  it('does not echo secret values in the error', () => {
    try {
      validateEnv({ ...good, JWT_SECRET: 'super-secret-short' });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain('super-secret-short');
    }
  });
  it('rejects malformed values in any environment', () => {
    expect(() => validateEnv({ DATABASE_URL: 'x', API_PORT: 'abc' })).toThrow(/API_PORT/);
    expect(() => validateEnv({ DATABASE_URL: 'x', PAYMENTS_MODE: 'sometimes' } as never)).toThrow(/PAYMENTS_MODE/);
  });
  it('refuses to boot the app in production with the default secret', async () => {
    const saved = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret';
    try {
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(/JWT_SECRET/);
    } finally {
      process.env = saved;
    }
  });
});

describe('security headers and CORS', () => {
  it('sends helmet headers and hides the framework', async () => {
    const res = await http().get(`${API}/public/settings`).expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('disables caching of authenticated and account responses', async () => {
    const owner = await staffAgent(app);
    expect((await owner.get(`${API}/admin/orders`).expect(200)).headers['cache-control']).toBe('no-store');
    expect((await http().get(`${API}/orders/DP-NOPE00`).query({ phone: '0712345678' })).headers['cache-control']).toBe('no-store');
  });

  it('only allows the storefront and admin origins', async () => {
    const allowed = await http().get(`${API}/health`).set('Origin', STOREFRONT);
    expect(allowed.headers['access-control-allow-origin']).toBe(STOREFRONT);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const evil = await http().get(`${API}/health`).set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await http().options(`${API}/auth/staff/login`).set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    const okPreflight = await http().options(`${API}/auth/staff/login`).set('Origin', STOREFRONT).set('Access-Control-Request-Method', 'POST');
    expect(okPreflight.headers['access-control-allow-origin']).toBe(STOREFRONT);
    expect(okPreflight.headers['access-control-allow-methods']).not.toContain('TRACE');
  });
});

describe('cookies', () => {
  it('sets httpOnly, SameSite=Lax cookies, and Secure in production', async () => {
    const dev = String((await http().post(`${API}/auth/staff/login`).send(OWNER).expect(200)).headers['set-cookie']);
    expect(dev).toMatch(/HttpOnly/);
    expect(dev).toMatch(/SameSite=Lax/);
    expect(dev).not.toMatch(/Secure/);
    process.env.NODE_ENV = 'production';
    try {
      const prod = String((await http().post(`${API}/auth/staff/login`).send(OWNER).expect(200)).headers['set-cookie']);
      expect(prod).toMatch(/Secure/);
      expect(prod).toMatch(/HttpOnly/);
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });

  it('clears the cookie on logout with matching attributes', async () => {
    const res = await (await staffAgent(app)).post(`${API}/auth/staff/logout`).expect(200);
    expect(String(res.headers['set-cookie'])).toMatch(/dp_staff=;/);
  });
});

describe('CSRF guards and body limits', () => {
  it('rejects state-changing requests from a foreign Origin', async () => {
    const owner = await staffAgent(app);
    await owner.post(`${API}/admin/products/reorder`).set('Origin', 'https://evil.example').send({ ids: ['x'] }).expect(403);
    await owner.post(`${API}/auth/staff/logout`).set('Origin', 'https://evil.example').expect(403);
    await owner.post(`${API}/auth/staff/logout`).set('Origin', STOREFRONT).expect(200);
  });

  it('requires application/json when a body is sent', async () => {
    await http().post(`${API}/auth/staff/login`).type('form').send({ email: OWNER.email, password: OWNER.password }).expect(415);
    await http().post(`${API}/auth/staff/login`).set('Content-Type', 'text/plain').send(JSON.stringify(OWNER)).expect(415);
    await http().post(`${API}/auth/staff/login`).send(OWNER).expect(200);
  });

  it('does not apply the JSON rule to webhooks', async () => {
    await http().post(`${API}/payments/paystack/webhook`).set('Content-Type', 'text/plain').send('{}').expect(401);
  });

  it('answers 413 with the standard error shape for oversized JSON', async () => {
    const res = await http().post(`${API}/auth/staff/login`).send({ email: OWNER.email, password: 'a'.repeat(300_000) }).expect(413);
    expect(res.body).toMatchObject({ statusCode: 413, error: 'Payload Too Large' });
    expect(JSON.stringify(res.body)).not.toMatch(/at \w|node_modules/);
  });

  it('answers 400 for malformed JSON without a stack trace', async () => {
    const res = await http().post(`${API}/auth/staff/login`).set('Content-Type', 'application/json').send('{"email": ').expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, message: 'Malformed request body' });
    expect(res.text).not.toMatch(/SyntaxError|node_modules/);
  });
});

describe('error hygiene', () => {
  it('hides Prisma and internal errors behind a generic 500', async () => {
    const prismaService = app.get(PrismaService);
    const secret = 'SELECT * FROM "User" WHERE password=hunter2';
    vi.spyOn(prismaService, '$transaction').mockRejectedValue(new Prisma.PrismaClientKnownRequestError(secret, { code: 'P1001', clientVersion: 'x' }));
    const owner = await staffAgent(app);
    const res = await owner.put(`${API}/admin/settings/notifications/settings`).send([]).expect(500);
    expect(res.body).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' });
    expect(res.text).not.toContain('hunter2');
    expect(res.text).not.toContain('Prisma');
  });

  it('maps unique violations to a clean 409', async () => {
    const owner = await staffAgent(app);
    const res = await owner.post(`${API}/admin/categories`).send({ name: 'Classics', slug: 'classics' }).expect(409);
    expect(res.body.message).toBe('That value already exists');
  });

  it('returns validation issues without internals', async () => {
    const res = await http().post(`${API}/auth/staff/login`).send({ email: 'nope' }).expect(400);
    expect(res.body.issues).toBeInstanceOf(Array);
    expect(res.body).not.toHaveProperty('stack');
  });

  it('masks phones, card numbers and tokens in log text', () => {
    expect(maskSensitive('SMS to +254712345678 and 0712345678')).toBe('SMS to +2547******78 and 07******78');
    expect(maskSensitive('SMS to +254712345678')).not.toContain('2345678');
    expect(maskSensitive('card 4242 4242 4242 4242 paid')).not.toContain('4242 4242');
    expect(maskSensitive('Authorization: Bearer abc.def.ghi')).toContain('Bearer ***');
    expect(maskSensitive('cookie dp_staff=eyJhbGciOi; x')).toContain('dp_staff=***');
  });
});

describe('health', () => {
  it('reports db ok', async () => {
    expect((await http().get(`${API}/health`).expect(200)).body).toEqual({ status: 'ok', db: 'ok' });
    expect((await http().get(`${API}/health/ready`).expect(200)).body).toEqual({ status: 'ready', db: 'ok', seeded: true });
  });

  it('returns 503 when the database is down', async () => {
    vi.spyOn(app.get(PrismaService), '$queryRaw').mockRejectedValue(new Error('connection refused'));
    const res = await http().get(`${API}/health`).expect(503);
    expect(res.body).toEqual({ status: 'degraded', db: 'error' });
    expect((await http().get(`${API}/health/ready`).expect(503)).body).toMatchObject({ status: 'not_ready', db: 'error' });
  });
});

describe('passwords and sessions', () => {
  it('applies the password policy to registration, reset and staff creation', async () => {
    const body = { name: 'Weak One', email: 'weak@example.com', phone: '0711000111' };
    for (const password of ['password', '12345678', 'aaaaaaaa', 'weak@example.com', 'short']) {
      const res = await http().post(`${API}/auth/customer/register`).send({ ...body, password }).expect(400);
      expect(res.body.issues[0].path).toBe('password');
    }
    expect(passwordProblem('Sup3r-secret-pw')).toBeNull();
    const owner = await staffAgent(app);
    await owner.post(`${API}/admin/staff`).send({ name: 'Weak Staff', email: 'weakstaff@x.com', role: 'KITCHEN', password: 'password1' }).expect(400);
  });

  it('hashes with argon2id and explicit parameters', async () => {
    const c = await customerAgent(app);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: c.email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  });

  it('rehashes old-parameter hashes on login', async () => {
    const argon2 = await import('argon2');
    const c = await customerAgent(app);
    await prisma.user.update({ where: { email: c.email }, data: { passwordHash: await argon2.hash(c.password, { type: argon2.argon2id, memoryCost: 8192, timeCost: 2, parallelism: 1 }) } });
    await http().post(`${API}/auth/customer/login`).send({ email: c.email, password: c.password }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: c.email } })).passwordHash).toContain('m=65536,t=3,p=1');
  });

  it('revokes staff sessions when their password is changed', async () => {
    const owner = await staffAgent(app);
    const created = await owner.post(`${API}/admin/staff`).send({ name: 'Temp Cook', email: 'tempcook@example.com', role: 'KITCHEN', password: 'Original-pass-77' }).expect(201);
    const victim = request.agent(app.getHttpServer());
    await victim.post(`${API}/auth/staff/login`).send({ email: 'tempcook@example.com', password: 'Original-pass-77' }).expect(200);
    await victim.get(`${API}/admin/orders`).expect(200);
    await owner.put(`${API}/admin/staff/${created.body.id}`).send({ name: 'Temp Cook', email: 'tempcook@example.com', role: 'KITCHEN', password: 'Replaced-pass-88', active: true }).expect(200);
    await victim.get(`${API}/admin/orders`).expect(401);
    await victim.post(`${API}/auth/staff/login`).send({ email: 'tempcook@example.com', password: 'Original-pass-77' }).expect(401);
    await victim.post(`${API}/auth/staff/login`).send({ email: 'tempcook@example.com', password: 'Replaced-pass-88' }).expect(200);
  });

  it('does not reveal whether an email exists on login', async () => {
    const a = await http().post(`${API}/auth/customer/login`).send({ email: 'nobody@example.com', password: 'Whatever-123' }).expect(401);
    const c = await customerAgent(app);
    const b = await http().post(`${API}/auth/customer/login`).send({ email: c.email, password: 'Wrong-pass-123' }).expect(401);
    expect(a.body).toEqual(b.body);
  });
});

describe('CSV export', () => {
  it('neutralises spreadsheet formulas in customer-controlled fields', async () => {
    const { placeOrder: place } = await import('./helpers');
    await place(app, cat, { customer: { name: '=HYPERLINK("http://evil.example","x")', phone: '0712000999' } });
    await place(app, cat, { customer: { name: '@SUM(1+1)', phone: '0712000998' } });
    const owner = await staffAgent(app);
    const csvText = (await owner.get(`${API}/admin/reports/export.csv`).expect(200)).text;
    expect(csvText).not.toMatch(/(^|,)=HYPERLINK/m);
    expect(csvText).toContain(`'=HYPERLINK`);
    expect(csvText).toContain(`'@SUM`);
    expect(csvText).toContain('+254712000999');
  });
});

describe('mass assignment and IDOR', () => {
  it('ignores privileged fields on customer registration', async () => {
    const res = await http()
      .post(`${API}/auth/customer/register`)
      .send({ name: 'Mallory', email: 'mallory@example.com', phone: '0711999888', password: 'Sup3r-secret-pw', role: 'OWNER', kind: 'STAFF', active: false, tokenVersion: 50 })
      .expect(201);
    expect(res.body).not.toHaveProperty('role');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'mallory@example.com' } });
    expect(user).toMatchObject({ kind: 'CUSTOMER', role: null, active: true, tokenVersion: 0 });
  });

  it('ignores client-supplied prices and statuses at checkout and in the cart', async () => {
    const token = (await http().post(`${API}/cart`).expect(201)).body.token as string;
    const item = await http()
      .post(`${API}/cart/items`)
      .set('X-Cart-Token', token)
      .send({ productId: cat.product('margherita').id, sizeId: cat.size('M').id, crustId: cat.crust('Classic').id, quantity: 1, unitPriceCents: 1, lineTotalCents: 1, priceCents: 1 })
      .expect(201);
    expect(item.body.items[0].unitPriceCents).toBeGreaterThan(10_000);
    const res = await http()
      .post(`${API}/checkout`)
      .set('X-Cart-Token', token)
      .send({ customer: { name: 'Amina Wanjiru', phone: '0712345678' }, fulfilment: 'COLLECTION', paymentMethod: 'MPESA', totalCents: 1, status: 'PAID', paidAt: new Date(), subtotalCents: 1 })
      .expect(201);
    expect(res.body.order.status).toBe('PENDING_PAYMENT');
    expect(res.body.order.totalCents).toBeGreaterThan(10_000);
  });

  it('ignores unknown fields on staff and catalogue writes', async () => {
    const owner = await staffAgent(app);
    const created = await owner.post(`${API}/admin/staff`).send({ name: 'New Kitchen', email: 'newk@example.com', role: 'KITCHEN', password: 'Kitchen-pass-9', tokenVersion: 99, kind: 'CUSTOMER', passwordHash: 'x' }).expect(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row).toMatchObject({ kind: 'STAFF', tokenVersion: 0 });
    expect(row.passwordHash).toMatch(/^\$argon2id/);
    expect(created.body).not.toHaveProperty('passwordHash');
  });

  it('keeps carts private to their token', async () => {
    const a = (await http().post(`${API}/cart`)).body.token as string;
    const b = (await http().post(`${API}/cart`)).body.token as string;
    const added = await http().post(`${API}/cart/items`).set('X-Cart-Token', a).send({ productId: cat.product('margherita').id, sizeId: cat.size('M').id, crustId: cat.crust('Classic').id, quantity: 1 }).expect(201);
    const itemId = added.body.items[0].id as string;
    await http().patch(`${API}/cart/items/${itemId}`).set('X-Cart-Token', b).send({ quantity: 5 }).expect(404);
    await http().delete(`${API}/cart/items/${itemId}`).set('X-Cart-Token', b).expect(404);
    await http().get(`${API}/cart`).set('X-Cart-Token', 'not-a-token').expect(404);
  });

  it('does not accept a customer cookie on staff routes, or the reverse', async () => {
    const c = await customerAgent(app);
    await c.agent.get(`${API}/admin/orders`).expect(401);
    await c.agent.get(`${API}/auth/staff/me`).expect(401);
    const owner = await staffAgent(app);
    await owner.get(`${API}/auth/customer/me`).expect(401);
    await owner.get(`${API}/account/orders`).expect(401);
  });

  it('returns 404 for unknown ids on admin :id routes (no 500s)', async () => {
    const owner = await staffAgent(app);
    for (const path of ['orders', 'products', 'payments', 'customers']) {
      await owner.get(`${API}/admin/${path}/does-not-exist`).expect(404);
    }
    await owner.put(`${API}/admin/staff/nope`).send({ name: 'Nobody', email: 'n@x.com', role: 'KITCHEN', active: true }).expect(404);
    await owner.post(`${API}/admin/staff/nope/deactivate`).expect(404);
  });
});
