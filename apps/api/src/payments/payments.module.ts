import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockProvider } from './providers/mock.provider';
import { MpesaProvider } from './providers/mpesa.provider';
import { PaystackProvider } from './providers/paystack.provider';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, MockProvider, MpesaProvider, PaystackProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
