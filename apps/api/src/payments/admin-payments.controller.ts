import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@dantes/shared';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Staff } from '../auth/guards';
import { dateQuery, dateRange, nairobiDate } from '../common/dates';
import { pageArgs, pageQuerySchema, paged } from '../common/pagination';
import { csvEnum } from '../common/csv-enum';
import { zod } from '../common/zod.pipe';
import { PrismaService } from '../core/prisma.service';

const day = z.string().regex(dateQuery);
const listQuery = pageQuerySchema.extend({
  status: csvEnum(PAYMENT_STATUSES).optional(),
  method: csvEnum(PAYMENT_METHODS).optional(),
  from: day.optional(),
  to: day.optional(),
  q: z.string().optional(),
});
const reconQuery = z.object({ date: day.optional() });

@Controller('admin/payments')
@Staff('OWNER', 'MANAGER', 'ORDER_STAFF')
export class AdminPaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(zod(listQuery)) q: z.infer<typeof listQuery>) {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status && { status: { in: q.status } }),
      ...(q.method && { method: { in: q.method } }),
      ...((q.from || q.to) && { createdAt: { gte: dateRange(q.from, q.to).start, lt: dateRange(q.from, q.to).end } }),
      ...(q.q && {
        OR: [
          { receipt: { contains: q.q, mode: 'insensitive' } },
          { providerRef: { contains: q.q, mode: 'insensitive' } },
          { phone: { contains: q.q } },
          { order: { reference: { contains: q.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q), include: { order: { select: { reference: true, status: true, totalCents: true } } } }),
      this.prisma.payment.count({ where }),
    ]);
    return paged(items, total, q);
  }

  @Get('reconciliation')
  async reconciliation(@Query(zod(reconQuery)) q: z.infer<typeof reconQuery>) {
    const date = q.date ?? nairobiDate();
    const { start, end } = dateRange(date, date);
    const succeeded = await this.prisma.payment.findMany({ where: { status: 'SUCCEEDED', completedAt: { gte: start, lt: end } }, include: { order: { select: { reference: true, status: true } } } });
    const byMethod = PAYMENT_METHODS.map((method) => {
      const rows = succeeded.filter((p) => p.method === method);
      return { method, count: rows.length, amountCents: rows.reduce((s, p) => s + p.amountCents, 0) };
    });
    const unmatched = [
      ...succeeded.filter((p) => ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'CANCELLED'].includes(p.order.status)),
      ...(await this.prisma.payment.findMany({
        where: { status: { in: ['INITIATED', 'PENDING'] }, createdAt: { gte: start, lt: end, lte: new Date(Date.now() - 30 * 60_000) } },
        include: { order: { select: { reference: true, status: true } } },
      })),
    ];
    const paidOrdersWithoutPayment = await this.prisma.order.findMany({
      where: { paidAt: { gte: start, lt: end }, payments: { none: { status: 'SUCCEEDED' } } },
      select: { id: true, reference: true, totalCents: true, status: true },
    });
    return { byMethod, unmatched, paidOrdersWithoutPayment };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { events: { orderBy: { receivedAt: 'asc' } }, order: true } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }
}
