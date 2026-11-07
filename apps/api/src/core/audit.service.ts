import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface Actor {
  id: string | null;
  ip?: string;
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

const json = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(actor: Actor, entry: AuditEntry, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).auditLog.create({
      data: {
        userId: actor.id,
        ip: actor.ip,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: json(entry.before),
        after: json(entry.after),
      },
    });
  }
}
