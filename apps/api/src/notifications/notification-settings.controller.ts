import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  notificationChannelToggleSchema,
  notificationSettingSchema,
  notificationTemplateSchema,
  normalizeKenyanPhone,
  testNotificationSchema,
} from '@dantes/shared';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { AuditActor, Staff } from '../auth/guards';
import { zod } from '../common/zod.pipe';
import { type Actor, AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { NotificationsService } from './notifications.service';

const channelsBody = z.union([z.array(notificationChannelToggleSchema), notificationChannelToggleSchema.transform((v) => [v])]);
const settingsBody = z.array(notificationSettingSchema);
const templateBody = notificationTemplateSchema.pick({ subject: true, body: true });
const previewBody = z.object({ body: z.string().max(1000) });
const templateParams = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  event: z.enum(NOTIFICATION_EVENTS),
  audience: z.enum(NOTIFICATION_AUDIENCES),
});

@Controller('admin/settings/notifications')
export class NotificationSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async snapshot() {
    const [channels, settings, templates] = await Promise.all([
      this.prisma.notificationChannelConfig.findMany(),
      this.prisma.notificationSetting.findMany({ orderBy: [{ channel: 'asc' }, { event: 'asc' }, { audience: 'asc' }] }),
      this.prisma.notificationTemplate.findMany({ orderBy: [{ channel: 'asc' }, { event: 'asc' }, { audience: 'asc' }] }),
    ]);
    return {
      channels: NOTIFICATION_CHANNELS.map((channel) => ({
        channel,
        enabled: channels.find((c) => c.channel === channel)?.enabled ?? false,
        configured: this.notifications.isConfigured(channel),
      })),
      settings,
      templates,
    };
  }

  @Get()
  @Staff('OWNER', 'MANAGER')
  get() {
    return this.snapshot();
  }

  @Put('channels')
  @Staff('OWNER')
  async channels(@Body(zod(channelsBody)) body: z.infer<typeof channelsBody>, @AuditActor() actor: Actor) {
    const before = (await this.snapshot()).channels;
    for (const c of body) {
      await this.prisma.notificationChannelConfig.upsert({ where: { channel: c.channel }, update: { enabled: c.enabled }, create: c });
    }
    const after = (await this.snapshot()).channels;
    await this.audit.log(actor, { action: 'notifications.channels', entity: 'NotificationChannelConfig', before, after });
    return after;
  }

  @Put('settings')
  @Staff('OWNER')
  async settings(@Body(zod(settingsBody)) body: z.infer<typeof settingsBody>, @AuditActor() actor: Actor) {
    const before = (await this.snapshot()).settings;
    await this.prisma.$transaction(
      body.map((s) =>
        this.prisma.notificationSetting.upsert({
          where: { channel_event_audience: { channel: s.channel, event: s.event, audience: s.audience } },
          update: { enabled: s.enabled },
          create: s,
        }),
      ),
    );
    const after = (await this.snapshot()).settings;
    await this.audit.log(actor, { action: 'notifications.settings', entity: 'NotificationSetting', before, after });
    return after;
  }

  @Put('templates/:channel/:event/:audience')
  @Staff('OWNER')
  async template(@Param(zod(templateParams)) key: z.infer<typeof templateParams>, @Body(zod(templateBody)) body: z.infer<typeof templateBody>, @AuditActor() actor: Actor) {
    const where = { channel_event_audience: key };
    const before = await this.prisma.notificationTemplate.findUnique({ where });
    const after = await this.prisma.notificationTemplate.upsert({ where, update: body, create: { ...key, ...body } });
    await this.audit.log(actor, { action: 'notifications.template', entity: 'NotificationTemplate', entityId: after.id, before, after });
    return after;
  }

  @Post('test')
  @HttpCode(200)
  @Staff('OWNER')
  async test(@Body(zod(testNotificationSchema)) body: z.infer<typeof testNotificationSchema>, @AuditActor() actor: Actor) {
    const recipient = body.channel === 'EMAIL' ? body.recipient : normalizeKenyanPhone(body.recipient);
    if (!recipient) throw new BadRequestException('Enter a valid recipient');
    const n = await this.notifications.deliver({
      channel: body.channel,
      audience: 'STAFF',
      recipient,
      subject: "Dante's Pizza test message",
      body: "This is a test message from Dante's Pizza admin.",
    });
    await this.audit.log(actor, { action: 'notifications.test', entity: 'Notification', entityId: n.id, after: { channel: body.channel, status: n.status } });
    return { status: n.status, note: n.note, error: n.error };
  }

  @Post('preview')
  @HttpCode(200)
  @Staff('OWNER', 'MANAGER')
  preview(@Body(zod(previewBody)) body: z.infer<typeof previewBody>) {
    return { rendered: this.notifications.render(body.body) };
  }
}
