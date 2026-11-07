import { BadRequestException, Body, ConflictException, Controller, Get, MessageEvent, NotFoundException, Param, Patch, Query, Sse } from '@nestjs/common';
import { ORDER_STATUSES, ORDER_TRANSITIONS, orderStatusUpdateSchema, PAYMENT_STATUSES } from '@dantes/shared';
import type { NotificationEvent, OrderStatus, Prisma } from '@prisma/client';
import { interval, map, merge, Observable } from 'rxjs';
import { z } from 'zod';
import { AuditActor, CurrentStaff, Staff } from '../auth/guards';
import type { StaffPrincipal } from '../auth/auth.types';
import { dateQuery, dateRange } from '../common/dates';
import { applyTransition } from '../common/order-transition';
import { pageArgs, pageQuerySchema, paged } from '../common/pagination';
import { csvEnum } from '../common/csv-enum';
import { zod } from '../common/zod.pipe';
import { orderPublicInclude, toOrderPublic } from './order.mapper';
import { type Actor, AuditService } from '../core/audit.service';
import { OrderEventsService } from '../core/order-events.service';
import { PrismaService } from '../core/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const day = z.string().regex(dateQuery);
const listQuery = pageQuerySchema.extend({
  status: csvEnum(ORDER_STATUSES).optional(),
  payment: csvEnum(PAYMENT_STATUSES).optional(),
  from: day.optional(),
  to: day.optional(),
  q: z.string().optional(),
});
const KITCHEN_STATUSES: OrderStatus[] = ['PREPARING', 'READY'];

@Controller('admin/orders')
@Staff('OWNER', 'MANAGER', 'ORDER_STAFF', 'KITCHEN')
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: OrderEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async list(@Query(zod(listQuery)) q: z.infer<typeof listQuery>) {
    const range = q.from || q.to ? dateRange(q.from, q.to) : null;
    const where: Prisma.OrderWhereInput = {
      ...(q.status && { status: { in: q.status } }),
      ...(q.payment && { payments: { some: { status: { in: q.payment } } } }),
      ...(range && { createdAt: { gte: range.start, lt: range.end } }),
      ...(q.q && {
        OR: [
          { reference: { contains: q.q, mode: 'insensitive' } },
          { customer: { name: { contains: q.q, mode: 'insensitive' } } },
          { customer: { phone: { contains: q.q } } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
        include: { customer: { select: { name: true, phone: true } }, payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      this.prisma.order.count({ where }),
    ]);
    const rows = items.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      fulfilment: o.fulfilment,
      totalCents: o.totalCents,
      createdAt: o.createdAt,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.payments[0]?.status ?? null,
      customer: o.customer,
    }));
    return paged(rows, total, q);
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return merge(
      this.events.stream.pipe(map((e) => ({ type: e.type, data: e.data }))),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: {} }))),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: orderPublicInclude.items,
        payments: { orderBy: { createdAt: 'asc' }, include: { events: { orderBy: { receivedAt: 'asc' } } } },
        history: orderPublicInclude.history,
        notifications: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const actorIds = [...new Set(order.history.flatMap((h) => (h.actorId ? [h.actorId] : [])))];
    const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    const address = (order.addressSnapshot ?? null) as { line1?: string; landmark?: string; notes?: string } | null;
    return {
      ...toOrderPublic(order),
      id: order.id,
      customer: { id: order.customer.id, name: order.customer.name, phone: order.customer.phone, email: order.customer.email },
      customerNotes: order.customerNotes,
      paidAt: order.paidAt,
      address: address && { line1: address.line1 ?? '', landmark: address.landmark ?? null, notes: address.notes ?? null },
      payments: order.payments,
      history: order.history.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        note: h.note,
        createdAt: h.createdAt,
        actorName: actors.find((a) => a.id === h.actorId)?.name ?? null,
      })),
      notifications: order.notifications,
    };
  }

  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body(zod(orderStatusUpdateSchema)) body: z.infer<typeof orderStatusUpdateSchema>,
    @CurrentStaff() staff: StaffPrincipal,
    @AuditActor() actor: Actor,
  ) {
    const to = body.status as OrderStatus;
    if (staff.role === 'KITCHEN' && !KITCHEN_STATUSES.includes(to)) {
      throw new ConflictException({ message: 'Kitchen staff can only set Preparing or Ready', code: 'FORBIDDEN_STATUS' });
    }
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (!ORDER_TRANSITIONS[order.status].includes(to)) {
      throw new ConflictException({ message: `Cannot move an order from ${order.status} to ${to}`, code: 'INVALID_TRANSITION' });
    }
    if (to === 'OUT_FOR_DELIVERY' && order.fulfilment !== 'DELIVERY') throw new BadRequestException('Only delivery orders can go out for delivery');

    const updated = await this.prisma.$transaction(async (tx) => {
      await applyTransition(tx, order, to, { actorId: staff.id, note: body.note });
      if (to === 'CANCELLED') {
        await tx.payment.updateMany({ where: { orderId: id, status: { in: ['INITIATED', 'PENDING'] } }, data: { status: 'CANCELLED' } });
      }
      const after = await tx.order.findUniqueOrThrow({ where: { id } });
      await this.audit.log(actor, { action: 'order.status', entity: 'Order', entityId: id, before: { status: order.status }, after: { status: to, note: body.note } }, tx);
      return after;
    });
    this.events.emit('order.updated', updated);
    const event = this.eventFor(to, order.fulfilment);
    if (event) this.notifications.notify(event, id);
    return updated;
  }

  private eventFor(status: OrderStatus, fulfilment: 'DELIVERY' | 'COLLECTION'): NotificationEvent | null {
    switch (status) {
      case 'ACCEPTED': return 'ORDER_ACCEPTED';
      case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY';
      case 'READY': return fulfilment === 'COLLECTION' ? 'READY_FOR_COLLECTION' : null;
      case 'COMPLETED': return 'ORDER_COMPLETED';
      case 'CANCELLED': return 'ORDER_CANCELLED';
      default: return null;
    }
  }
}
