import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Staff } from '../auth/guards';
import { pageArgs, pageQuerySchema, paged } from '../common/pagination';
import { zod } from '../common/zod.pipe';
import { PrismaService } from '../core/prisma.service';

const query = pageQuerySchema.extend({ entity: z.string().optional(), userId: z.string().optional() });

@Controller('admin/audit')
@Staff('OWNER', 'MANAGER')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(zod(query)) q: z.infer<typeof query>) {
    const where = { ...(q.entity && { entity: q.entity }), ...(q.userId && { userId: q.userId }) };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q), include: { user: { select: { id: true, name: true, email: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      userName: r.user?.name ?? null,
      before: r.before,
      after: r.after,
    }));
    return paged(items, total, q);
  }
}
