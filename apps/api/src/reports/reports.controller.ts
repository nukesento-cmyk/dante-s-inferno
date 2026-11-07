import { Controller, Get, Header, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Staff } from '../auth/guards';
import { addDays, dateQuery, dateRange, nairobiDate } from '../common/dates';
import { ACTIVE_STATUSES, REVENUE_STATUSES } from '../common/order-transition';
import { zod } from '../common/zod.pipe';
import { PrismaService } from '../core/prisma.service';

const day = z.string().regex(dateQuery).optional();
const rangeQuery = z.object({ from: day, to: day });
const salesQuery = rangeQuery.extend({ groupBy: z.enum(['day', 'week', 'month']).default('day') });
type Range = z.infer<typeof rangeQuery>;

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Controller('admin')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  private revenueByPeriod(unit: 'day' | 'week' | 'month', start: Date, end: Date) {
    return this.prisma.$queryRaw<{ period: string; orders: bigint; revenue: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc(${unit}, "paidAt" AT TIME ZONE 'Africa/Nairobi'), 'YYYY-MM-DD') AS period,
             COUNT(*) AS orders, COALESCE(SUM("totalCents"), 0) AS revenue
      FROM "Order"
      WHERE "paidAt" >= ${start} AND "paidAt" < ${end} AND status::text IN (${Prisma.join(REVENUE_STATUSES)})
      GROUP BY 1 ORDER BY 1`);
  }

  private async topProducts(start: Date, end: Date, take?: number) {
    const rows = await this.prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      where: { order: { paidAt: { gte: start, lt: end }, status: { in: REVENUE_STATUSES } } },
      _sum: { quantity: true, lineTotalCents: true },
      orderBy: { _sum: { lineTotalCents: 'desc' } },
      take,
    });
    return rows.map((r) => ({ productId: r.productId, name: r.productName, quantity: r._sum.quantity ?? 0, revenueCents: r._sum.lineTotalCents ?? 0 }));
  }

  @Get('overview')
  @Staff('OWNER', 'MANAGER', 'ORDER_STAFF')
  async overview(@Query(zod(rangeQuery)) q: Range) {
    const today = nairobiDate();
    const todayRange = dateRange(today, today);
    const range = dateRange(q.from ?? addDays(q.to ?? today, -13), q.to ?? today);
    const [todayAgg, activeOrders, pendingPayments, byDay, topProducts] = await Promise.all([
      this.prisma.order.aggregate({
        where: { paidAt: { gte: todayRange.start, lt: todayRange.end }, status: { in: REVENUE_STATUSES } },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      this.prisma.order.count({ where: { status: { in: ACTIVE_STATUSES } } }),
      this.prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
      this.revenueByPeriod('day', range.start, range.end),
      this.topProducts(range.start, range.end, 5),
    ]);
    const orders = todayAgg._count._all;
    const revenue = todayAgg._sum.totalCents ?? 0;
    return {
      ordersToday: orders,
      revenueTodayCents: revenue,
      activeOrders,
      pendingPayments,
      avgOrderValueCents: orders ? Math.round(revenue / orders) : 0,
      topProducts,
      revenueByDay: byDay.map((r) => ({ date: r.period, revenueCents: Number(r.revenue), orders: Number(r.orders) })),
    };
  }

  @Get('reports/sales')
  @Staff('OWNER', 'MANAGER')
  async sales(@Query(zod(salesQuery)) q: z.infer<typeof salesQuery>) {
    const { start, end } = dateRange(q.from, q.to);
    const rows = await this.revenueByPeriod(q.groupBy, start, end);
    return rows.map((r) => ({
      period: r.period,
      orders: Number(r.orders),
      revenueCents: Number(r.revenue),
      avgOrderCents: Number(r.orders) ? Math.round(Number(r.revenue) / Number(r.orders)) : 0,
    }));
  }

  @Get('reports/products')
  @Staff('OWNER', 'MANAGER')
  products(@Query(zod(rangeQuery)) q: Range) {
    const { start, end } = dateRange(q.from, q.to);
    return this.topProducts(start, end);
  }

  @Get('reports/export.csv')
  @Staff('OWNER', 'MANAGER')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="orders.csv"')
  async export(@Query(zod(rangeQuery)) q: Range) {
    const { start, end } = dateRange(q.from, q.to);
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'asc' },
      include: { customer: true },
    });
    const header = ['reference', 'created_at', 'status', 'fulfilment', 'payment_method', 'customer', 'phone', 'subtotal_kes', 'delivery_kes', 'packaging_kes', 'vat_kes', 'total_kes', 'paid_at'];
    const kes = (c: number) => (c / 100).toFixed(2);
    const lines = orders.map((o) =>
      [o.reference, o.createdAt.toISOString(), o.status, o.fulfilment, o.paymentMethod, o.customer.name, o.customer.phone, kes(o.subtotalCents), kes(o.deliveryFeeCents), kes(o.packagingFeeCents), kes(o.vatCents), kes(o.totalCents), o.paidAt?.toISOString() ?? ''].map(csv).join(','),
    );
    return [header.join(','), ...lines].join('\n') + '\n';
  }
}
