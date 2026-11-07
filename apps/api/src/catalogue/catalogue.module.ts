import { Module } from '@nestjs/common';
import { AdminCatalogueController } from './admin-catalogue.controller';
import { AdminCatalogueService } from './admin-catalogue.service';
import { PublicCatalogueController } from './public-catalogue.controller';

@Module({
  controllers: [PublicCatalogueController, AdminCatalogueController],
  providers: [AdminCatalogueService],
})
export class CatalogueModule {}
