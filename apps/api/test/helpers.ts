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
