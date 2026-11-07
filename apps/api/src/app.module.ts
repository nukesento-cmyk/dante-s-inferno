import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { CoreModule } from './core/core.module';
import { CustomersModule } from './customers/customers.module';
import { DeliveryModule } from './delivery/delivery.controller';
import { HealthController } from './health/health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PricingModule } from './pricing/pricing.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { StaffModule } from './staff/staff.module';

@Module({
  imports: [
    CoreModule,
    AuthModule,
    NotificationsModule,
    SettingsModule,
    CatalogueModule,
    PricingModule,
    CartModule,
    DeliveryModule,
    OrdersModule,
    PaymentsModule,
    CustomersModule,
    ReportsModule,
    StaffModule,
    AuditModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
