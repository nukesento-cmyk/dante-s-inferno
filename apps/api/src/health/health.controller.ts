import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const db = await this.prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const, () => 'error' as const);
    return { status: db === 'ok' ? 'ok' : 'degraded', db };
  }
}
