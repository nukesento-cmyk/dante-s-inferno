import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { env, validateEnv } from '../config/env';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CustomerGuard, StaffGuard } from './guards';

@Global()
@Module({
  imports: [
    NotificationsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
    JwtModule.registerAsync({
      useFactory: () => {
        validateEnv();
        return { secret: env.jwtSecret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, StaffGuard, CustomerGuard],
  exports: [AuthService, StaffGuard, CustomerGuard],
})
export class AuthModule {}
