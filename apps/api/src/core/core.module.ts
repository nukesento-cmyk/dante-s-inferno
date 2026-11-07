import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { OrderEventsService } from './order-events.service';
import { PrismaService } from './prisma.service';
import { SettingsService } from './settings.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, OrderEventsService, SettingsService],
  exports: [PrismaService, AuditService, OrderEventsService, SettingsService],
})
export class CoreModule {}
