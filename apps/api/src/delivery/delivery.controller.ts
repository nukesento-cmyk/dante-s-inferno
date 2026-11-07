import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';

@Controller('public/delivery-zones')
export class DeliveryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async zones() {
    const zones = await this.prisma.deliveryZone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    return zones.map(({ id, name, description, feeCents, minOrderCents, freeDeliveryFromCents, etaMinMinutes, etaMaxMinutes }) => ({
      id, name, description, feeCents, minOrderCents, freeDeliveryFromCents, etaMinMinutes, etaMaxMinutes,
    }));
  }
}

@Module({ controllers: [DeliveryController] })
export class DeliveryModule {}
