import { Module } from '@nestjs/common';
import { PricingController, PricingService } from './pricing.controller';

@Module({ controllers: [PricingController], providers: [PricingService] })
export class PricingModule {}
