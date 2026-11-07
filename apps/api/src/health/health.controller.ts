import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../core/prisma.service';

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref())]);

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  private db() {
    return withTimeout(this.prisma.$queryRaw`SELECT 1`, 2000).then(() => 'ok' as const, () => 'error' as const);
  }

  /** Liveness plus database status. 503 when the database cannot be reached. */
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const db = await this.db();
    if (db !== 'ok') res.status(503);
    return { status: db === 'ok' ? 'ok' : 'degraded', db };
  }

  /** Readiness: the database answers and the schema is migrated and seeded (the settings row exists). */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const db = await this.db();
    const seeded = db === 'ok' ? await withTimeout(this.prisma.restaurantSettings.count(), 2000).then((n) => n > 0, () => false) : false;
    const ready = db === 'ok' && seeded;
    if (!ready) res.status(503);
    return { status: ready ? 'ready' : 'not_ready', db, seeded };
  }
}
