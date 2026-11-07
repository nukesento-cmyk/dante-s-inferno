import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { openingHoursSchema, restaurantSettingsSchema, specialClosureSchema } from '@dantes/shared';
import { z } from 'zod';
import { AuditActor, Staff } from '../auth/guards';
import { addDays, nairobiDate } from '../common/dates';
import { zod } from '../common/zod.pipe';
import { env } from '../config/env';
import { type Actor, AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { SettingsService } from '../core/settings.service';

const partialSettings = restaurantSettingsSchema.partial();
const hoursKeys = ['dayOfWeek', 'openTime', 'closeTime', 'closed'] as const;

@Controller()
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get('public/settings')
  async publicSettings() {
    const today = nairobiDate();
    const [{ state, settings: s }, hours, closures] = await Promise.all([
      this.settings.ordering(),
      this.settings.hours(),
      this.prisma.specialClosure.findMany({ where: { date: { gte: today, lte: addDays(today, 30) } }, orderBy: { date: 'asc' } }),
    ]);
    return {
      name: s.name,
      phone: s.phone,
      whatsappPhone: s.whatsappPhone,
      orderLinePhone: s.orderLinePhone,
      email: s.email,
      address: s.address,
      mapUrl: s.mapUrl,
      deliveryEnabled: s.deliveryEnabled,
      collectionEnabled: s.collectionEnabled,
      pricesIncludeVat: s.pricesIncludeVat,
      vatRateBps: s.vatRateBps,
      packagingFeeCents: s.packagingFeeCents,
      defaultMaxExtraToppings: s.defaultMaxExtraToppings,
      hours,
      closures,
      ordering: state,
      pauseMessage: s.pauseMessage,
      paymentsMode: env.paymentsMode,
    };
  }

  @Get('admin/settings')
  @Staff('OWNER', 'MANAGER')
  get() {
    return this.settings.get();
  }

  @Put('admin/settings')
  @Staff('OWNER')
  async update(@Body() raw: Record<string, unknown>, @AuditActor() actor: Actor) {
    const parsed = zod(partialSettings).transform(raw) as z.infer<typeof partialSettings>;
    const data = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in (raw ?? {})));
    const before = await this.settings.get();
    const after = await this.prisma.restaurantSettings.update({ where: { id: 1 }, data });
    await this.audit.log(actor, { action: 'settings.update', entity: 'RestaurantSettings', entityId: '1', before, after });
    return after;
  }

  @Get('admin/settings/hours')
  @Staff('OWNER', 'MANAGER')
  hours() {
    return this.settings.hours();
  }

  @Put('admin/settings/hours')
  @Staff('OWNER')
  async updateHours(@Body(zod(openingHoursSchema)) body: z.infer<typeof openingHoursSchema>, @AuditActor() actor: Actor) {
    const before = await this.settings.hours();
    await this.prisma.$transaction(
      body.map((d) => {
        const data = Object.fromEntries(hoursKeys.map((k) => [k, d[k]])) as typeof d;
        return this.prisma.openingHours.upsert({ where: { dayOfWeek: d.dayOfWeek }, update: data, create: data });
      }),
    );
    const after = await this.settings.hours();
    await this.audit.log(actor, { action: 'settings.hours', entity: 'OpeningHours', before, after });
    return after;
  }

  @Get('admin/settings/closures')
  @Staff('OWNER', 'MANAGER')
  closures() {
    return this.prisma.specialClosure.findMany({ orderBy: { date: 'asc' } });
  }

  @Post('admin/settings/closures')
  @Staff('OWNER')
  async addClosure(@Body(zod(specialClosureSchema)) body: z.infer<typeof specialClosureSchema>, @AuditActor() actor: Actor) {
    if (!body.closed && (!body.openTime || !body.closeTime)) throw new BadRequestException('Special opening hours need an open and close time');
    const after = await this.prisma.specialClosure.upsert({ where: { date: body.date }, update: body, create: body });
    await this.audit.log(actor, { action: 'closure.save', entity: 'SpecialClosure', entityId: after.id, after });
    return after;
  }

  @Delete('admin/settings/closures/:id')
  @HttpCode(200)
  @Staff('OWNER')
  async removeClosure(@Param('id') id: string, @AuditActor() actor: Actor) {
    const before = await this.prisma.specialClosure.delete({ where: { id } });
    await this.audit.log(actor, { action: 'closure.delete', entity: 'SpecialClosure', entityId: id, before });
    return { ok: true };
  }
}
