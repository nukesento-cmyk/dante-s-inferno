import type { INestApplication } from '@nestjs/common';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { UPLOADS_DIR } from '../src/catalogue/admin-catalogue.controller';
import { API, catalogue, createApp, customerAgent, IMAGES, placeOrder, prisma, setupDb, staffAgent } from './helpers';

let app: INestApplication;
const written = new Set<string>();
const before = () => new Set(existsSync(UPLOADS_DIR) ? readdirSync(UPLOADS_DIR) : []);
let baseline = new Set<string>();

beforeAll(async () => {
  await setupDb();
  app = await createApp();
  baseline = before();
});
afterEach(() => {
  for (const f of readdirSync(UPLOADS_DIR)) if (!baseline.has(f)) written.add(f);
});
afterAll(async () => {
  for (const f of written) unlinkSync(join(UPLOADS_DIR, f));
  await app.close();
  await prisma.$disconnect();
});

const upload = (agent: request.Agent | typeof request, buf: Buffer, filename = 'pic.png', contentType = 'image/png') =>
  (agent as request.Agent).post(`${API}/admin/uploads/image`).attach('file', buf, { filename, contentType });

describe('image upload', () => {
  it.each(Object.entries(IMAGES))('accepts a real %s and stores it with a generated name', async (kind, buf) => {
    const owner = await staffAgent(app);
    const res = await upload(owner, buf, `x.${kind}`, `image/${kind}`).expect(201);
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.(jpg|png|gif|webp|avif)$/);
    const served = await request(app.getHttpServer()).get(res.body.url).expect(200);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(await prisma.auditLog.count({ where: { action: 'upload.image' } })).toBeGreaterThan(0);
  });

  it('derives the extension from the bytes, not the declared type or file name', async () => {
    const owner = await staffAgent(app);
    const res = await upload(owner, IMAGES.png, '../../../etc/evil.php', 'image/jpeg').expect(201);
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(existsSync(join(UPLOADS_DIR, res.body.url.replace('/uploads/', '')))).toBe(true);
  });

  it('rejects non-images', async () => {
    const owner = await staffAgent(app);
    await upload(owner, Buffer.from('hello world, I am text'), 'notes.txt', 'text/plain').expect(400);
    await upload(owner, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml').expect(400);
    await upload(owner, Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.php', 'application/x-php').expect(400);
  });

  it('rejects a fake .jpg whose magic bytes are wrong, even with an image content type', async () => {
    const owner = await staffAgent(app);
    await upload(owner, Buffer.from('MZ\x90\x00 this is really an executable'), 'photo.jpg', 'image/jpeg').expect(400);
    await upload(owner, Buffer.from('<html><script>alert(1)</script></html>'), 'photo.png', 'image/png').expect(400);
    await upload(owner, Buffer.alloc(0), 'empty.png', 'image/png').expect(400);
    expect([...before()].filter((f) => !baseline.has(f) && !written.has(f))).toEqual([]);
  });

  it('rejects files over 5 MB', async () => {
    const owner = await staffAgent(app);
    const big = Buffer.concat([IMAGES.png, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(owner, big).expect(413);
    expect(res.body.statusCode).toBe(413);
  });

  it('requires a file field', async () => {
    const owner = await staffAgent(app);
    await owner.post(`${API}/admin/uploads/image`).field('note', 'nothing').expect(400);
  });

  it('is limited to OWNER and MANAGER', async () => {
    await upload(request.agent(app.getHttpServer()), IMAGES.png).expect(401);
    await upload((await customerAgent(app)).agent, IMAGES.png).expect(401);
    await upload(await staffAgent(app, 'KITCHEN'), IMAGES.png).expect(403);
    await upload(await staffAgent(app, 'ORDER_STAFF'), IMAGES.png).expect(403);
    await upload(await staffAgent(app, 'MANAGER'), IMAGES.png).expect(201);
  });

  it('does not serve files outside the uploads directory', async () => {
    for (const path of ['/uploads/../package.json', '/uploads/%2e%2e/package.json', '/uploads/..%2fpackage.json', '/uploads/%2e%2e%2f%2e%2e%2fpackage.json', '/uploads/.env']) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status, path).not.toBe(200);
    }
  });
});

describe('order stream (SSE)', () => {
  let listening = false;
  async function open(cookie?: string) {
    if (!listening) await app.listen(0, '127.0.0.1');
    listening = true;
    const url = `${await app.getUrl()}${API}/admin/orders/stream`;
    const ac = new AbortController();
    const res = await fetch(url, { headers: cookie ? { cookie } : {}, signal: ac.signal });
    return { res, close: () => ac.abort() };
  }
  const cookieOf = (agentRes: request.Response) => String(agentRes.headers['set-cookie']).split(';')[0]!;

  it('requires staff authentication', async () => {
    expect((await open()).res.status).toBe(401);
    const cust = await customerAgent(app);
    const login = await request(app.getHttpServer()).post(`${API}/auth/customer/login`).send({ email: cust.email, password: cust.password }).expect(200);
    expect((await open(cookieOf(login))).res.status).toBe(401);
  });

  it('streams to any staff role and delivers order events', async () => {
    const login = await request(app.getHttpServer()).post(`${API}/auth/staff/login`).send({ email: process.env.SEED_OWNER_EMAIL ?? 'owner@dantespizza.co.ke', password: process.env.SEED_OWNER_PASSWORD ?? 'change-me-now' }).expect(200);
    const { res, close } = await open(cookieOf(login));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    await placeOrder(app, await catalogue());
    const reader = res.body!.getReader();
    let text = '';
    const end = Date.now() + 5000;
    while (!text.includes('event: order.created') && Date.now() < end) text += new TextDecoder().decode((await reader.read()).value);
    close();
    expect(text).toContain('event: order.created');
    expect(text).toMatch(/"reference":"DP-/);
  });
});

describe('rate limits', () => {
  let limited: INestApplication;
  const saved = { ...process.env };
  beforeAll(async () => {
    process.env.LOGIN_RATE_LIMIT = '3';
    process.env.CHECKOUT_RATE_LIMIT = '2';
    process.env.LOOKUP_RATE_LIMIT = '2';
    limited = await createApp();
  });
  afterAll(async () => {
    process.env.LOGIN_RATE_LIMIT = saved.LOGIN_RATE_LIMIT;
    process.env.CHECKOUT_RATE_LIMIT = saved.CHECKOUT_RATE_LIMIT;
    process.env.LOOKUP_RATE_LIMIT = saved.LOOKUP_RATE_LIMIT;
    await limited.close();
  });

  const hits = async (fn: () => request.Test, n: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((await fn()).status);
    return out;
  };
  const http = () => request(limited.getHttpServer());

  it('limits staff login attempts', async () => {
    const s = await hits(() => http().post(`${API}/auth/staff/login`).send({ email: 'a@b.com', password: 'wrong-password' }), 5);
    expect(s).toEqual([401, 401, 401, 429, 429]);
  });
  it('limits customer login, register and forgot-password', async () => {
    expect(await hits(() => http().post(`${API}/auth/customer/login`).send({ email: 'a@b.com', password: 'wrong-password' }), 4)).toEqual([401, 401, 401, 429]);
    expect((await hits(() => http().post(`${API}/auth/customer/register`).send({ bad: true }), 4)).at(-1)).toBe(429);
    expect(await hits(() => http().post(`${API}/auth/customer/forgot-password`).send({ email: 'a@b.com' }), 4)).toEqual([200, 200, 200, 429]);
    expect((await hits(() => http().post(`${API}/auth/customer/reset-password`).send({ token: 'x'.repeat(20), password: 'Sup3r-secret-pw' }), 4)).at(-1)).toBe(429);
  });
  it('limits checkout and payment retries', async () => {
    expect(await hits(() => http().post(`${API}/checkout`).send({}), 3)).toEqual([400, 400, 429]);
    expect((await hits(() => http().post(`${API}/orders/DP-AAAAAA/retry-payment`).send({ method: 'CARD' }), 3)).at(-1)).toBe(429);
  });
  it('limits guest order lookups (brute force of reference or phone)', async () => {
    expect(await hits(() => http().get(`${API}/orders/DP-AAAAAA`).query({ phone: '0712345678' }), 3)).toEqual([404, 404, 429]);
  });
});
