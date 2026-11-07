import { Injectable } from '@nestjs/common';
import { getOrderingState, type OpeningHoursDay, type OrderingState } from '@dantes/shared';
import { addDays, nairobiDate } from '../common/dates';
import { PrismaService } from './prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.restaurantSettings.findUniqueOrThrow({ where: { id: 1 } });
  }

  async hours(): Promise<OpeningHoursDay[]> {
    const rows = await this.prisma.openingHours.findMany();
    return Array.from({ length: 7 }, (_, dayOfWeek) => {
      const r = rows.find((x) => x.dayOfWeek === dayOfWeek);
      return r ?? { dayOfWeek, openTime: '10:00', closeTime: '22:00', closed: true };
    });
  }

  async ordering(now = new Date()): Promise<{ state: OrderingState; settings: Awaited<ReturnType<SettingsService['get']>> }> {
    const [settings, hours, closures] = await Promise.all([
      this.get(),
      this.hours(),
      this.prisma.specialClosure.findMany({ where: { date: { gte: addDays(nairobiDate(now), -1) } } }),
    ]);
    const state = getOrderingState({
      now,
      hours,
      closures,
      lastOrderMinutesBeforeClose: settings.lastOrderMinutesBeforeClose,
      orderingPaused: settings.orderingPaused,
      timezone: settings.timezone,
    });
    return { state, settings };
  }
}
