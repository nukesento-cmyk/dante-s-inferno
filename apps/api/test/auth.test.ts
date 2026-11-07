import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, OWNER, prisma, setupDb, staffAgent } from './helpers';

let app: INestApplication;
beforeAll(async () => {
  await setupDb();
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('staff auth and roles', () => {
  it('logs the owner in with an httpOnly lax cookie and returns /me', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send(OWNER).expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('dp_staff=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const agent = await staffAgent(app);
    const me = await agent.get('/api/v1/auth/staff/me').expect(200);
    expect(me.body).toMatchObject({ email: OWNER.email, role: 'OWNER' });
  });

  it('rejects a wrong password', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ email: OWNER.email, password: 'wrong-password' }).expect(401);
  });

  it('answers 401 for anonymous /admin/* requests', async () => {
    for (const path of ['/admin/orders', '/admin/products', '/admin/settings', '/admin/pricing', '/admin/staff', '/admin/overview']) {
      await request(app.getHttpServer()).get(`/api/v1${path}`).expect(401);
    }
  });

  it('lets KITCHEN read orders but not change settings or catalogue', async () => {
    const kitchen = await staffAgent(app, 'KITCHEN');
    await kitchen.get('/api/v1/admin/orders').expect(200);
    await kitchen.put('/api/v1/admin/settings').send({ pauseMessage: 'x' }).expect(403);
    await kitchen.get('/api/v1/admin/products').expect(403);
    await kitchen.get('/api/v1/admin/payments').expect(403);
  });

  it('gives ORDER_STAFF orders and payments but not staff or settings', async () => {
    const agent = await staffAgent(app, 'ORDER_STAFF');
    await agent.get('/api/v1/admin/payments').expect(200);
    await agent.get('/api/v1/admin/staff').expect(403);
    await agent.put('/api/v1/admin/settings').send({ pauseMessage: 'x' }).expect(403);
  });

  it('lets MANAGER manage the catalogue but not staff or settings', async () => {
    const agent = await staffAgent(app, 'MANAGER');
    await agent.get('/api/v1/admin/products').expect(200);
    await agent.get('/api/v1/admin/staff').expect(403);
    await agent.put('/api/v1/admin/settings').send({ pauseMessage: 'x' }).expect(403);
  });

  it('writes an AuditLog entry with before and after when settings change', async () => {
    const owner = await staffAgent(app);
    await owner.put('/api/v1/admin/settings').send({ pauseMessage: 'Back at 6pm', packagingFeeCents: 5000 }).expect(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'settings.update' }, orderBy: { createdAt: 'desc' } });
    expect(log).toBeTruthy();
    expect((log!.before as { packagingFeeCents: number }).packagingFeeCents).toBe(0);
    expect((log!.after as { packagingFeeCents: number; pauseMessage: string }).packagingFeeCents).toBe(5000);
    expect(log!.userId).toBeTruthy();
    await owner.put('/api/v1/admin/settings').send({ pauseMessage: '', packagingFeeCents: 0 }).expect(200);
  });

  it('revokes sessions when staff are deactivated', async () => {
    const agent = await staffAgent(app, 'KITCHEN');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'kitchen@test.local' } });
    const owner = await staffAgent(app);
    await owner.post(`/api/v1/admin/staff/${user.id}/deactivate`).expect(200);
    await agent.get('/api/v1/auth/staff/me').expect(401);
  });
});
