import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminOrdersController } from './admin-orders.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [CartModule, PaymentsModule, NotificationsModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [CheckoutService],
})
export class OrdersModule {}
