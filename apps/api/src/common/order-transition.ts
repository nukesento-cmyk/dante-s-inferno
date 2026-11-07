import type { OrderStatus, Prisma } from '@prisma/client';

export const REVENUE_STATUSES: OrderStatus[] = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'];
export const ACTIVE_STATUSES: OrderStatus[] = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

export async function applyTransition(
  tx: Prisma.TransactionClient,
  order: { id: string; status: OrderStatus },
  to: OrderStatus,
  opts: { actorId?: string | null; note?: string | null; data?: Prisma.OrderUpdateInput } = {},
) {
  await tx.order.update({ where: { id: order.id }, data: { status: to, ...opts.data } });
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: order.status, toStatus: to, actorId: opts.actorId ?? null, note: opts.note ?? null },
  });
}
