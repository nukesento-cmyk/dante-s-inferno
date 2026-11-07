import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Staff } from '../auth/guards';
import { REVENUE_STATUSES } from '../common/order-transition';
import { pageArgs, pageQuerySchema, paged } from '../common/pagination';
import { zod } from '../common/zod.pipe';
import { PrismaService } from '../core/prisma.service';

const query = pageQuerySchema.extend({ q: z.string().optional() });

@Controller('admin/customers')
@Staff('OWNER', 'MANAGER')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(zod(query)) q: z.infer<typeof query>) {
    const where: Prisma.CustomerWhereInput = q.q
      ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { email: { contains: q.q, mode: 'insensitive' } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.customer.count({ where }),
    ]);
    const stats = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: rows.map((r) => r.id) }, status: { in: REVENUE_STATUSES } },
      _count: { _all: true },
      _sum: { totalCents: true },
    });
    const items = rows.map((c) => {
      const s = stats.find((x) => x.customerId === c.id);
      return { id: c.id, name: c.name, phone: c.phone, email: c.email, createdAt: c.createdAt, orderCount: s?._count._all ?? 0, totalSpentCents: s?._sum.totalCents ?? 0 };
    });
    return paged(items, total, q);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { addresses: true, orders: { orderBy: { createdAt: 'desc' }, include: { items: true } } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}
