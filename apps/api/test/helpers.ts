import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type StaffRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { seed } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

export const prisma = new PrismaClient();
export const OWNER = { email: process.env.SEED_OWNER_EMAIL ?? 'owner@dantespizza.co.ke', password: process.env.SEED_OWNER_PASSWORD ?? 'change-me-now' };

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
        EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;`);
}

export async function setupDb() {
  await resetDb();
  await seed(prisma);
  await openRestaurant();
}

/** Open around the clock so tests do not depend on the wall clock. */
export async function openRestaurant() {
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    await prisma.openingHours.update({ where: { dayOfWeek }, data: { openTime: '00:00', closeTime: '23:59', closed: false } });
  }
  await prisma.restaurantSettings.update({ where: { id: 1 }, data: { orderingPaused: false, lastOrderMinutesBeforeClose: 0, deliveryEnabled: true, collectionEnabled: true } });
}

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  await app.init();
  return app;
}

export async function staffAgent(app: INestApplication, role: StaffRole | 'OWNER' = 'OWNER') {
  const agent = request.agent(app.getHttpServer());
  let creds = OWNER;
  if (role !== 'OWNER') {
    creds = { email: `${role.toLowerCase()}@test.local`, password: 'password123' };
    await prisma.user.upsert({
      where: { email: creds.email },
      update: {},
      create: { kind: 'STAFF', role, name: role, email: creds.email, passwordHash: await argon2.hash(creds.password) },
    });
  }
  await agent.post('/api/v1/auth/staff/login').send(creds).expect(200);
  return agent;
}

export async function catalogue() {
  const [sizes, crusts, zones, ingredients, products] = await Promise.all([
    prisma.size.findMany(),
    prisma.crustOption.findMany({ include: { adjustments: true } }),
    prisma.deliveryZone.findMany(),
    prisma.ingredient.findMany({ include: { group: true } }),
    prisma.product.findMany({ include: { prices: true, ingredients: true } }),
  ]);
  return {
    size: (code: string) => sizes.find((s) => s.code === code)!,
    crust: (name: string) => crusts.find((c) => c.name === name)!,
    zone: (name: string) => zones.find((z) => z.name === name)!,
    ingredient: (slug: string) => ingredients.find((i) => i.slug === slug)!,
    product: (slug: string) => products.find((p) => p.slug === slug)!,
  };
}

export const CUSTOMER = { name: 'Amina Wanjiru', phone: '0712 345 678' };

export async function newCart(app: INestApplication) {
  const res = await request(app.getHttpServer()).post('/api/v1/cart').expect(201);
  return res.body.token as string;
}

export function addItem(app: INestApplication, token: string, item: Record<string, unknown>) {
  return request(app.getHttpServer()).post('/api/v1/cart/items').set('X-Cart-Token', token).send(item);
}

export function checkout(app: INestApplication, token: string, body: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .post('/api/v1/checkout')
    .set('X-Cart-Token', token)
    .send({ customer: CUSTOMER, fulfilment: 'COLLECTION', paymentMethod: 'MPESA', ...body });
}

export const API = '/api/v1';

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 4000): Promise<T | null | undefined | false> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 40));
  }
}

/** Places a COLLECTION order for a pepperoni pizza (mock payments), optionally as a logged-in customer agent. */
export async function placeOrder(
  app: INestApplication,
  cat: Awaited<ReturnType<typeof catalogue>>,
  opts: { paymentMethod?: 'MPESA' | 'CARD'; customer?: { name: string; phone: string; email?: string }; agent?: ReturnType<typeof request.agent>; quantity?: number } = {},
) {
  const http = opts.agent ?? request(app.getHttpServer());
  const token = ((await http.post(`${API}/cart`).expect(201)).body as { token: string }).token;
  await http
    .post(`${API}/cart/items`)
    .set('X-Cart-Token', token)
    .send({ productId: cat.product('pepperoni').id, sizeId: cat.size('M').id, crustId: cat.crust('Thin').id, quantity: opts.quantity ?? 1 })
    .expect(201);
  const res = await http
    .post(`${API}/checkout`)
    .set('X-Cart-Token', token)
    .send({ customer: opts.customer ?? CUSTOMER, fulfilment: 'COLLECTION', paymentMethod: opts.paymentMethod ?? 'MPESA' })
    .expect(201);
  return { reference: res.body.order.reference as string, paymentId: res.body.payment.id as string, totalCents: res.body.order.totalCents as number };
}

export const mockComplete = (app: INestApplication, paymentId: string, success: boolean) =>
  request(app.getHttpServer()).post(`${API}/payments/mock/${paymentId}/complete`).send({ success });

/** Registers a customer and returns a cookie-keeping agent. */
export async function customerAgent(app: INestApplication, over: Partial<{ name: string; email: string; phone: string; password: string }> = {}) {
  const body = { name: 'Test Customer', email: `c${Math.random().toString(36).slice(2, 8)}@example.com`, phone: '0711222333', password: 'Sup3r-secret-pw', ...over };
  const agent = request.agent(app.getHttpServer());
  await agent.post(`${API}/auth/customer/register`).send(body).expect(201);
  return { agent, ...body };
}

/** Minimal valid-by-magic-bytes image buffers. */
export const IMAGES = {
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]),
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]),
  gif: Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(32)]),
  webp: Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), Buffer.alloc(32)]),
  avif: Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif', 'latin1'), Buffer.alloc(32)]),
};
