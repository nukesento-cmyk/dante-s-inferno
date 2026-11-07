import { waitUntil } from '@vercel/functions';
import { Injectable, Logger } from '@nestjs/common';
import type { NotificationAudience, NotificationChannel, NotificationEvent } from '@prisma/client';
import { formatKes, renderTemplate } from '@dantes/shared';
import { env } from '../config/env';
import { PrismaService } from '../core/prisma.service';
import { SettingsService } from '../core/settings.service';
import { EmailProvider } from './providers/email.provider';
import type { SendResult } from './providers/provider.types';
import { SmsProvider } from './providers/sms.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';

const AUDIENCES: NotificationAudience[] = ['CUSTOMER', 'STAFF'];
const CHANNELS: NotificationChannel[] = ['SMS', 'EMAIL', 'WHATSAPP'];

export const SAMPLE_VARS: Record<string, string> = {
  customerName: 'Amina',
  orderReference: 'DP-7K3M9Q',
  total: 'KES 1,950',
  restaurantName: "Dante's Pizza",
  restaurantPhone: '+254700000000',
  estimatedTime: '30-40 min',
  orderStatusUrl: `${env.storefrontUrl}/order/DP-7K3M9Q`,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly sms: SmsProvider,
    private readonly email: EmailProvider,
    private readonly whatsapp: WhatsAppProvider,
  ) {}

  isConfigured(channel: NotificationChannel) {
    return channel === 'SMS' ? this.sms.configured : channel === 'EMAIL' ? this.email.configured : this.whatsapp.configured;
  }

  /** Fire and forget: call after the DB transaction has committed. Never throws. */
  notify(event: NotificationEvent, orderId: string) {
    // waitUntil keeps a serverless function alive until the dispatch finishes; a no-op elsewhere.
    waitUntil(this.dispatch(event, orderId).catch((err) => this.logger.error(`dispatch ${event} for ${orderId} failed: ${err}`)));
  }

  async dispatch(event: NotificationEvent, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order) return;
    const restaurant = await this.settings.get();
    const vars = {
      customerName: order.customer.name,
      orderReference: order.reference,
      total: formatKes(order.totalCents),
      restaurantName: restaurant.name,
      restaurantPhone: restaurant.phone,
      estimatedTime: order.etaMinMinutes && order.etaMaxMinutes ? `${order.etaMinMinutes}-${order.etaMaxMinutes} min` : 'shortly',
      orderStatusUrl: `${env.storefrontUrl}/order/${order.reference}`,
    };
    const [channelConfigs, enabledSettings, templates] = await Promise.all([
      this.prisma.notificationChannelConfig.findMany({ where: { enabled: true } }),
      this.prisma.notificationSetting.findMany({ where: { event, enabled: true } }),
      this.prisma.notificationTemplate.findMany({ where: { event } }),
    ]);
    const channelOn = new Set(channelConfigs.map((c) => c.channel));

    for (const audience of AUDIENCES) {
      for (const channel of CHANNELS) {
        if (!channelOn.has(channel)) continue;
        if (!enabledSettings.some((s) => s.channel === channel && s.audience === audience)) continue;
        const template = templates.find((t) => t.channel === channel && t.audience === audience);
        if (!template) continue;
        const recipients =
          audience === 'CUSTOMER'
            ? [channel === 'EMAIL' ? order.customer.email : order.customer.phone]
            : channel === 'EMAIL'
              ? restaurant.staffAlertEmails
              : restaurant.staffAlertPhones;
        for (const recipient of recipients) {
          if (!recipient) continue;
          await this.deliver({
            orderId,
            channel,
            audience,
            event,
            recipient,
            subject: template.subject ? renderTemplate(template.subject, vars) : null,
            body: renderTemplate(template.body, vars),
          });
        }
      }
    }
  }

  async deliver(n: {
    orderId?: string | null;
    channel: NotificationChannel;
    audience: NotificationAudience;
    event?: NotificationEvent | null;
    recipient: string;
    subject?: string | null;
    body: string;
  }) {
    const row = await this.prisma.notification.create({
      data: { orderId: n.orderId ?? null, channel: n.channel, audience: n.audience, event: n.event ?? null, recipient: n.recipient, subject: n.subject ?? null, body: n.body },
    });
    try {
      const result = await this.send(n.channel, n.recipient, n.subject ?? "Dante's Pizza", n.body);
      return this.prisma.notification.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), note: result.note ?? null } });
    } catch (err) {
      this.logger.warn(`${n.channel} to ${n.recipient} failed: ${err}`);
      return this.prisma.notification.update({ where: { id: row.id }, data: { status: 'FAILED', error: String(err instanceof Error ? err.message : err).slice(0, 500) } });
    }
  }

  private send(channel: NotificationChannel, to: string, subject: string, body: string): Promise<SendResult> {
    if (channel === 'SMS') return this.sms.send(to, body);
    if (channel === 'EMAIL') return this.email.send(to, subject, body);
    return this.whatsapp.send(to, body);
  }

  render(body: string) {
    return renderTemplate(body, SAMPLE_VARS);
  }
}
