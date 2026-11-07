import type { INestApplication } from '@nestjs/common';
import { ORDER_STATUSES, ORDER_TRANSITIONS } from '@dantes/shared';
import type { StaffRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, catalogue, createApp, customerAgent, IMAGES, mockComplete, placeOrder, prisma, setupDb, staffAgent } from './helpers';

let app: INestApplication;
let cat: Awaited<ReturnType<typeof catalogue>>;
type Role = StaffRole;
const ALL: Role[] = ['OWNER', 'MANAGER', 'ORDER_STAFF', 'KITCHEN'];
const OM: Role[] = ['OWNER', 'MANAGER'];
const OMO: Role[] = ['OWNER', 'MANAGER', 'ORDER_STAFF'];
const OWNER_ONLY: Role[] = ['OWNER'];

beforeAll(async () => {
  await setupDb();
  cat = await catalogue();
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

interface Route {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  roles: Role[];
  body?: object;
}
const NOPE = 'does-not-exist';

/** Every admin route group, with the roles allowed to reach the handler (per the contract). */
const ROUTES: Route[] = [
  // orders (all staff)
  { method: 'get', path: '/admin/orders', roles: ALL },
  { method: 'get', path: `/admin/orders/${NOPE}`, roles: ALL },
  { method: 'patch', path: `/admin/orders/${NOPE}/status`, roles: ALL, body: { status: 'PREPARING' } },
  // dashboard + payments (read)
  { method: 'get', path: '/admin/overview', roles: OMO },
  { method: 'get', path: '/admin/payments', roles: OMO },
  { method: 'get', path: `/admin/payments/${NOPE}`, roles: OMO },
  { method: 'get', path: '/admin/payments/reconciliation', roles: OMO },
  // catalogue (owner, manager)
  { method: 'get', path: '/admin/products', roles: OM },
  { method: 'post', path: '/admin/products', roles: OM, body: {} },
  { method: 'post', path: '/admin/products/reorder', roles: OM, body: { ids: ['x'] } },
  { method: 'get', path: `/admin/products/${NOPE}`, roles: OM },
  { method: 'put', path: `/admin/products/${NOPE}`, roles: OM, body: {} },
  { method: 'delete', path: `/admin/products/${NOPE}`, roles: OM },
  { method: 'patch', path: `/admin/products/${NOPE}/availability`, roles: OM, body: { available: true } },
  { method: 'get', path: '/admin/categories', roles: OM },
  { method: 'post', path: '/admin/categories', roles: OM, body: {} },
  { method: 'post', path: '/admin/categories/reorder', roles: OM, body: { ids: ['x'] } },
  { method: 'put', path: `/admin/categories/${NOPE}`, roles: OM, body: {} },
  { method: 'delete', path: `/admin/categories/${NOPE}`, roles: OM },
  { method: 'get', path: '/admin/ingredients', roles: OM },
  { method: 'post', path: '/admin/ingredients', roles: OM, body: {} },
  { method: 'put', path: `/admin/ingredients/${NOPE}`, roles: OM, body: {} },
  { method: 'delete', path: `/admin/ingredients/${NOPE}`, roles: OM },
  { method: 'get', path: '/admin/topping-groups', roles: OM },
  { method: 'post', path: '/admin/topping-groups', roles: OM, body: {} },
  { method: 'put', path: `/admin/topping-groups/${NOPE}`, roles: OM, body: {} },
  { method: 'delete', path: `/admin/topping-groups/${NOPE}`, roles: OM },
  { method: 'get', path: '/admin/sizes', roles: OM },
  { method: 'post', path: '/admin/sizes', roles: OM, body: {} },
  { method: 'put', path: `/admin/sizes/${NOPE}`, roles: OM, body: {} },
  { method: 'delete', path: `/admin/sizes/${NOPE}`, roles: OM },
  { method: 'get', path: '/admin/crusts', roles: OM },
  { method: 'post', path: '/admin/crusts', roles: OM, body: {} },
  { method: 'put', path: `/admin/crusts/${NOPE}`, roles: OM, body: {} },
  { method: 'delete', path: `/admin/crusts/${NOPE}`, roles: OM },
  { method: 'get', path: '/admin/delivery-zones', roles: OM },
  { method: 'post', path: '/admin/delivery-zones', roles: OM, body: {} },
  { method: 'post', path: '/admin/delivery-zones/reorder', roles: OM, body: { ids: ['x'] } },
  { method: 'put', path: `/admin/delivery-zones/${NOPE}`, roles: OM, body: {} },
  { method: 'delete', path: `/admin/delivery-zones/${NOPE}`, roles: OM },
  { method: 'get', path: '/admin/pricing', roles: OM },
  { method: 'put', path: '/admin/pricing', roles: OM, body: {} },
  // customers, audit, reports
  { method: 'get', path: '/admin/customers', roles: OM },
  { method: 'get', path: `/admin/customers/${NOPE}`, roles: OM },
  { method: 'get', path: '/admin/audit', roles: OM },
  { method: 'get', path: '/admin/reports/sales', roles: OM },
  { method: 'get', path: '/admin/reports/products', roles: OM },
  { method: 'get', path: '/admin/reports/export.csv', roles: OM },
  // settings: manager read, owner write
  { method: 'get', path: '/admin/settings', roles: OM },
  { method: 'put', path: '/admin/settings', roles: OWNER_ONLY, body: {} },
  { method: 'get', path: '/admin/settings/hours', roles: OM },
  { method: 'put', path: '/admin/settings/hours', roles: OWNER_ONLY, body: [] },
  { method: 'get', path: '/admin/settings/closures', roles: OM },
  { method: 'post', path: '/admin/settings/closures', roles: OWNER_ONLY, body: {} },
  { method: 'delete', path: `/admin/settings/closures/${NOPE}`, roles: OWNER_ONLY },
  { method: 'get', path: '/admin/settings/notifications', roles: OM },
  { method: 'put', path: '/admin/settings/notifications/channels', roles: OWNER_ONLY, body: [] },
  { method: 'put', path: '/admin/settings/notifications/settings', roles: OWNER_ONLY, body: [] },
  { method: 'put', path: '/admin/settings/notifications/templates/SMS/ORDER_RECEIVED/STAFF', roles: OWNER_ONLY, body: { subject: null, body: 'x' } },
  { method: 'post', path: '/admin/settings/notifications/test', roles: OWNER_ONLY, body: {} },
  { method: 'post', path: '/admin/settings/notifications/preview', roles: OM, body: { body: 'Hi {customerName}' } },
  // staff: owner only
  { method: 'get', path: '/admin/staff', roles: OWNER_ONLY },
  { method: 'post', path: '/admin/staff', roles: OWNER_ONLY, body: {} },
  { method: 'put', path: `/admin/staff/${NOPE}`, roles: OWNER_ONLY, body: {} },
  { method: 'post', path: `/admin/staff/${NOPE}/deactivate`, roles: OWNER_ONLY },
];

describe('role matrix', () => {
  it('covers every admin route registered in the app', () => {
    const router = (app.getHttpAdapter().getInstance() as { router?: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } }).router;
    const registered = (router?.stack ?? [])
      .flatMap((l) => (l.route ? Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route!.path}`) : []))
      .filter((r) => r.includes('/api/v1/admin/') && !r.includes('/stream') && !r.includes('/uploads'));
    const known = new Set(ROUTES.map((r) => `${r.method.toUpperCase()} ${API}${r.path.replace(NOPE, ':id').replace(/\/templates\/.*/, '/templates/:channel/:event/:audience')}`));
    const normalise = (r: string) => r.replace(/:[a-zA-Z]+/g, ':id');
    const knownN = new Set([...known].map(normalise));
    const missing = registered.filter((r) => !knownN.has(normalise(r)));
    expect(missing, 'admin routes missing from the role matrix').toEqual([]);
  });

  it('answers 401 to anonymous callers and to customer sessions on every route', async () => {
    const customer = await customerAgent(app);
    for (const r of ROUTES) {
      const anon = await request(app.getHttpServer())[r.method](`${API}${r.path}`).send(r.body);
      expect(anon.status, `anonymous ${r.method} ${r.path}`).toBe(401);
      const cust = await customer.agent[r.method](`${API}${r.path}`).send(r.body);
      expect(cust.status, `customer ${r.method} ${r.path}`).toBe(401);
    }
  });

  it.each(ALL)('%s is allowed exactly where documented and denied (403) elsewhere', async (role) => {
    const agent = await staffAgent(app, role);
    for (const r of ROUTES) {
      const res = await agent[r.method](`${API}${r.path}`).send(r.body);
      if (r.roles.includes(role)) {
        expect([401, 403], `${role} should reach ${r.method} ${r.path}`).not.toContain(res.status);
        expect(res.status, `${role} ${r.method} ${r.path}`).toBeLessThan(500);
      } else {
        expect(res.status, `${role} must not reach ${r.method} ${r.path}`).toBe(403);
        expect(res.body.message).toBe('Your role cannot do this');
      }
    }
  });

  it('MANAGER can read but not write settings; only OWNER manages staff', async () => {
    const manager = await staffAgent(app, 'MANAGER');
    const owner = await staffAgent(app);
    await manager.get(`${API}/admin/settings`).expect(200);
    await manager.put(`${API}/admin/settings`).send({ pauseMessage: 'hi' }).expect(403);
    await owner.put(`${API}/admin/settings`).send({ pauseMessage: 'hi' }).expect(200);
    await owner.put(`${API}/admin/settings`).send({ pauseMessage: '' }).expect(200);
    for (const role of ['MANAGER', 'ORDER_STAFF', 'KITCHEN'] as Role[]) {
      const a = await staffAgent(app, role);
      await a.get(`${API}/admin/staff`).expect(403);
      await a.post(`${API}/admin/staff`).send({ name: 'Evil Admin', email: 'evil@x.com', role: 'OWNER', password: 'Evil-pass-1234' }).expect(403);
    }
    expect(await prisma.user.count({ where: { email: 'evil@x.com' } })).toBe(0);
  });

  it('an owner cannot demote or deactivate themselves', async () => {
    const owner = await staffAgent(app);
    const me = (await owner.get(`${API}/auth/staff/me`)).body as { id: string; email: string; name: string };
    await owner.put(`${API}/admin/staff/${me.id}`).send({ name: me.name, email: me.email, role: 'KITCHEN', active: true }).expect(409);
    await owner.post(`${API}/admin/staff/${me.id}/deactivate`).expect(409);
  });
});

describe('order status transition matrix', () => {
  async function freshOrder() {
    const { reference } = await placeOrder(app, cat);
    return prisma.order.findUniqueOrThrow({ where: { reference } });
  }

  it('allows exactly the transitions in ORDER_TRANSITIONS and answers 409 for every other pair', async () => {
    const owner = await staffAgent(app);
    const order = await freshOrder();
    let valid = 0;
    let invalid = 0;
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        await prisma.order.update({ where: { id: order.id }, data: { status: from, fulfilment: 'DELIVERY' } });
        const res = await owner.patch(`${API}/admin/orders/${order.id}/status`).send({ status: to, note: 'matrix' });
        const allowed = ORDER_TRANSITIONS[from].includes(to);
        if (allowed) {
          expect(res.status, `${from} -> ${to}`).toBe(200);
          expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(to);
          valid++;
        } else {
          expect(res.status, `${from} -> ${to}`).toBe(409);
          expect(res.body.code).toBe('INVALID_TRANSITION');
          expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(from);
          invalid++;
        }
      }
    }
    expect(valid).toBe(Object.values(ORDER_TRANSITIONS).flat().length);
    expect(invalid).toBe(ORDER_STATUSES.length ** 2 - valid);
  });

  it('only delivery orders can go out for delivery', async () => {
    const owner = await staffAgent(app);
    const order = await freshOrder();
    await prisma.order.update({ where: { id: order.id }, data: { status: 'READY', fulfilment: 'COLLECTION' } });
    await owner.patch(`${API}/admin/orders/${order.id}/status`).send({ status: 'OUT_FOR_DELIVERY' }).expect(400);
  });

  it('kitchen staff can only set PREPARING or READY, whatever the current state', async () => {
    const kitchen = await staffAgent(app, 'KITCHEN');
    const order = await freshOrder();
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        await prisma.order.update({ where: { id: order.id }, data: { status: from, fulfilment: 'DELIVERY' } });
        const res = await kitchen.patch(`${API}/admin/orders/${order.id}/status`).send({ status: to });
        if (!['PREPARING', 'READY'].includes(to)) {
          expect(res.status, `kitchen ${from} -> ${to}`).toBe(409);
          expect(res.body.code).toBe('FORBIDDEN_STATUS');
        } else {
          expect(res.status, `kitchen ${from} -> ${to}`).toBe(ORDER_TRANSITIONS[from].includes(to) ? 200 : 409);
        }
      }
    }
  });

  it('validates the status value and unknown ids', async () => {
    const owner = await staffAgent(app);
    const order = await freshOrder();
    await owner.patch(`${API}/admin/orders/${order.id}/status`).send({ status: 'TELEPORTED' }).expect(400);
    await owner.patch(`${API}/admin/orders/${order.id}/status`).send({}).expect(400);
    await owner.patch(`${API}/admin/orders/nope/status`).send({ status: 'CANCELLED' }).expect(404);
  });

  it('cancelling an order cancels its open payments', async () => {
    const owner = await staffAgent(app);
    const { reference, paymentId } = await placeOrder(app, cat);
    const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
    await owner.patch(`${API}/admin/orders/${order.id}/status`).send({ status: 'CANCELLED' }).expect(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('CANCELLED');
    // a late success for a cancelled order must not resurrect it
    const late = await mockComplete(app, paymentId, true).expect(200);
    expect(late.body.orderStatus).toBe('CANCELLED');
  });
});

describe('audit coverage of admin mutations', () => {
  it('writes an AuditLog row for every admin mutation', async () => {
    const owner = await staffAgent(app);
    const checks: string[] = [];
    const audited = async (label: string, run: () => Promise<request.Response>, expectStatus: number | number[] = [200, 201]) => {
      const before = await prisma.auditLog.count();
      const res = await run();
      expect([expectStatus].flat(), `${label} -> ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain(res.status);
      const after = await prisma.auditLog.count();
      expect(after, `${label} must write an audit entry`).toBeGreaterThan(before);
      checks.push(label);
      return res;
    };
    const o = (m: 'post' | 'put' | 'patch' | 'delete', path: string, body?: object) => () => owner[m](`${API}${path}`).send(body);

    const category = (await audited('category.create', o('post', '/admin/categories', { name: 'Audit Cat', slug: 'audit-cat' }))).body;
    await audited('category.update', o('put', `/admin/categories/${category.id}`, { name: 'Audit Cat 2', slug: 'audit-cat' }));
    await audited('category.reorder', o('post', '/admin/categories/reorder', { ids: [category.id] }));
    const group = (await audited('group.create', o('post', '/admin/topping-groups', { name: 'Audit Group', surchargeCents: 100 }))).body;
    await audited('group.update', o('put', `/admin/topping-groups/${group.id}`, { name: 'Audit Group 2', surchargeCents: 200 }));
    const ingredient = (await audited('ingredient.create', o('post', '/admin/ingredients', { name: 'Audit Herb', slug: 'audit-herb', groupId: group.id }))).body;
    await audited('ingredient.update', o('put', `/admin/ingredients/${ingredient.id}`, { name: 'Audit Herb 2', slug: 'audit-herb', groupId: group.id }));
    const size = (await audited('size.create', o('post', '/admin/sizes', { code: 'XL', name: 'Audit XL', inches: 18 }))).body;
    await audited('size.update', o('put', `/admin/sizes/${size.id}`, { code: 'XL', name: 'Audit XL2', inches: 18 }));
    const crust = (await audited('crust.create', o('post', '/admin/crusts', { name: 'Audit crust', adjustments: [{ sizeId: size.id, adjustmentCents: 0 }] }))).body;
    await audited('crust.update', o('put', `/admin/crusts/${crust.id}`, { name: 'Audit crust 2', adjustments: [{ sizeId: size.id, adjustmentCents: 100 }] }));
    const zone = (await audited('zone.create', o('post', '/admin/delivery-zones', { name: 'Audit Zone', feeCents: 10000, etaMinMinutes: 20, etaMaxMinutes: 40 }))).body;
    await audited('zone.update', o('put', `/admin/delivery-zones/${zone.id}`, { name: 'Audit Zone 2', feeCents: 20000, etaMinMinutes: 20, etaMaxMinutes: 40 }));
    await audited('zone.reorder', o('post', '/admin/delivery-zones/reorder', { ids: [zone.id] }));
    const product = (
      await audited('product.create', o('post', '/admin/products', { name: 'Audit Pizza', slug: 'audit-pizza', categoryId: category.id, prices: [{ sizeId: size.id, priceCents: 90000 }], defaultIngredientIds: [ingredient.id] }))
    ).body;
    await audited('product.update', o('put', `/admin/products/${product.id}`, { name: 'Audit Pizza 2', slug: 'audit-pizza', categoryId: category.id, prices: [{ sizeId: size.id, priceCents: 95000 }] }));
    await audited('product.availability', o('patch', `/admin/products/${product.id}/availability`, { available: false }));
    await audited('product.reorder', o('post', '/admin/products/reorder', { ids: [product.id] }));
    await audited('pricing.update', o('put', '/admin/pricing', { settings: { packagingFeeCents: 0 } }));
    await audited('product.archive', o('delete', `/admin/products/${product.id}`));
    await audited('crust.delete', o('delete', `/admin/crusts/${crust.id}`));
    await audited('size.delete', o('delete', `/admin/sizes/${size.id}`));
    await audited('ingredient.delete', o('delete', `/admin/ingredients/${ingredient.id}`));
    await audited('group.delete', o('delete', `/admin/topping-groups/${group.id}`));
    await audited('zone.delete', o('delete', `/admin/delivery-zones/${zone.id}`));
    const spare = (await audited('category.create2', o('post', '/admin/categories', { name: 'Spare Cat', slug: 'spare-cat' }))).body;
    await audited('category.delete', o('delete', `/admin/categories/${spare.id}`));

    await audited('settings.update', o('put', '/admin/settings', { pauseMessage: 'audit' }));
    const hours = (await owner.get(`${API}/admin/settings/hours`)).body;
    await audited('settings.hours', o('put', '/admin/settings/hours', hours));
    const closure = (await audited('closure.save', o('post', '/admin/settings/closures', { date: '2031-01-01', label: 'Audit day', closed: true, openTime: null, closeTime: null }))).body;
    await audited('closure.delete', o('delete', `/admin/settings/closures/${closure.id}`));
    await audited('notifications.channels', o('put', '/admin/settings/notifications/channels', [{ channel: 'SMS', enabled: true }]));
    await audited('notifications.settings', o('put', '/admin/settings/notifications/settings', [{ channel: 'SMS', event: 'ORDER_RECEIVED', audience: 'STAFF', enabled: false }]));
    await audited('notifications.template', o('put', '/admin/settings/notifications/templates/SMS/ORDER_RECEIVED/STAFF', { subject: null, body: 'New order {orderReference}' }));
    await audited('notifications.test', o('post', '/admin/settings/notifications/test', { channel: 'SMS', recipient: '0712000111' }));

    const staff = (await audited('staff.create', o('post', '/admin/staff', { name: 'Audit Staff', email: 'auditstaff@example.com', role: 'KITCHEN', password: 'Audit-staff-pw-1' }))).body;
    await audited('staff.update', o('put', `/admin/staff/${staff.id}`, { name: 'Audit Staff 2', email: 'auditstaff@example.com', role: 'ORDER_STAFF', active: true }));
    await audited('staff.deactivate', o('post', `/admin/staff/${staff.id}/deactivate`));

    const { reference } = await placeOrder(app, cat);
    const order = await prisma.order.findUniqueOrThrow({ where: { reference } });
    await audited('order.status', o('patch', `/admin/orders/${order.id}/status`, { status: 'CANCELLED' }));

    await audited('upload.image', () => owner.post(`${API}/admin/uploads/image`).attach('file', IMAGES.png, { filename: 'a.png', contentType: 'image/png' }));
    expect(checks.length).toBeGreaterThanOrEqual(38);

    // the rows carry the actor and a before/after payload
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: 'staff.update' } });
    expect(row.userId).toBeTruthy();
    expect(row.before).toBeTruthy();
    expect(row.after).toBeTruthy();
    expect(JSON.stringify(row)).not.toMatch(/passwordHash|\$argon2/);

    // cleanup of the uploaded test file
    const { unlinkSync, readdirSync } = await import('node:fs');
    const { UPLOADS_DIR } = await import('../src/catalogue/admin-catalogue.controller');
    const up = await prisma.auditLog.findFirstOrThrow({ where: { action: 'upload.image' }, orderBy: { createdAt: 'desc' } });
    if (readdirSync(UPLOADS_DIR).includes(up.entityId!)) unlinkSync(`${UPLOADS_DIR}/${up.entityId}`);
  });
});
