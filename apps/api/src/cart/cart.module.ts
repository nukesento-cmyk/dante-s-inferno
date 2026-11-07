import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { LinePricingService } from './line-pricing.service';

@Module({
  controllers: [CartController],
  providers: [CartService, LinePricingService],
  exports: [CartService, LinePricingService],
})
export class CartModule {}
