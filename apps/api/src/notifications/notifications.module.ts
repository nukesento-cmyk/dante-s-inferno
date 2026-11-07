import { Module } from '@nestjs/common';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationsService } from './notifications.service';
import { EmailProvider } from './providers/email.provider';
import { SmsProvider } from './providers/sms.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';

@Module({
  controllers: [NotificationSettingsController],
  providers: [NotificationsService, SmsProvider, EmailProvider, WhatsAppProvider],
  exports: [NotificationsService, EmailProvider],
})
export class NotificationsModule {}
