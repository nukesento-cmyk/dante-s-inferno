import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  categorySchema,
  crustSchema,
  deliveryZoneSchema,
  ingredientSchema,
  productSchema,
  sizeSchema,
  toppingGroupSchema,
} from '@dantes/shared';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AuditActor, Staff } from '../auth/guards';
import { zod } from '../common/zod.pipe';
import type { Actor } from '../core/audit.service';
import { AdminCatalogueService } from './admin-catalogue.service';

export const UPLOADS_DIR = resolve(__dirname, '..', '..', 'uploads');
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const reorderBody = z.object({ ids: z.array(z.string()).min(1) });
const availabilityBody = z.object({ available: z.boolean() });
const listQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });

type Reorder = z.infer<typeof reorderBody>;
const body = <T extends z.ZodTypeAny>(s: T) => Body(zod(s));

@Controller('admin')
@Staff('OWNER', 'MANAGER')
export class AdminCatalogueController {
  constructor(private readonly svc: AdminCatalogueService) {}

  // products
  @Get('products') products(@Query(zod(listQuery)) q: z.infer<typeof listQuery>) { return this.svc.listProducts(q.includeArchived === 'true'); }
  @Post('products') createProduct(@body(productSchema) b: z.infer<typeof productSchema>, @AuditActor() a: Actor) { return this.svc.createProduct(a, b); }
  @Post('products/reorder') @HttpCode(200) reorderProducts(@body(reorderBody) b: Reorder, @AuditActor() a: Actor) { return this.svc.reorder(a, 'Product', b.ids); }
  @Get('products/:id') product(@Param('id') id: string) { return this.svc.getProduct(id); }
  @Put('products/:id') updateProduct(@Param('id') id: string, @body(productSchema) b: z.infer<typeof productSchema>, @AuditActor() a: Actor) { return this.svc.updateProduct(a, id, b); }
  @Delete('products/:id') archiveProduct(@Param('id') id: string, @AuditActor() a: Actor) { return this.svc.archiveProduct(a, id); }
  @Patch('products/:id/availability') availability(@Param('id') id: string, @body(availabilityBody) b: z.infer<typeof availabilityBody>, @AuditActor() a: Actor) { return this.svc.setAvailability(a, id, b.available); }

  @Post('uploads/image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          mkdirSync(UPLOADS_DIR, { recursive: true });
          cb(null, UPLOADS_DIR);
        },
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype] ?? ''}`),
      }),
      fileFilter: (_req, file, cb) => (IMAGE_TYPES[file.mimetype] ? cb(null, true) : cb(new BadRequestException('Only JPEG, PNG, WebP, GIF or AVIF images are allowed') as unknown as Error, false)),
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Attach an image in the "file" field');
    return { url: `/uploads/${file.filename}` };
  }

  // categories
  @Get('categories') categories() { return this.svc.listCategories(); }
  @Post('categories') createCategory(@body(categorySchema) b: z.infer<typeof categorySchema>, @AuditActor() a: Actor) { return this.svc.createCategory(a, b); }
  @Post('categories/reorder') @HttpCode(200) reorderCategories(@body(reorderBody) b: Reorder, @AuditActor() a: Actor) { return this.svc.reorder(a, 'Category', b.ids); }
  @Put('categories/:id') updateCategory(@Param('id') id: string, @body(categorySchema) b: z.infer<typeof categorySchema>, @AuditActor() a: Actor) { return this.svc.updateCategory(a, id, b); }
  @Delete('categories/:id') deleteCategory(@Param('id') id: string, @AuditActor() a: Actor) { return this.svc.deleteCategory(a, id); }

  // ingredients and topping groups
  @Get('ingredients') ingredients() { return this.svc.listIngredients(); }
  @Post('ingredients') createIngredient(@body(ingredientSchema) b: z.infer<typeof ingredientSchema>, @AuditActor() a: Actor) { return this.svc.createIngredient(a, b); }
  @Put('ingredients/:id') updateIngredient(@Param('id') id: string, @body(ingredientSchema) b: z.infer<typeof ingredientSchema>, @AuditActor() a: Actor) { return this.svc.updateIngredient(a, id, b); }
  @Delete('ingredients/:id') deleteIngredient(@Param('id') id: string, @AuditActor() a: Actor) { return this.svc.deleteIngredient(a, id); }
  @Get('topping-groups') groups() { return this.svc.listGroups(); }
  @Post('topping-groups') createGroup(@body(toppingGroupSchema) b: z.infer<typeof toppingGroupSchema>, @AuditActor() a: Actor) { return this.svc.createGroup(a, b); }
  @Put('topping-groups/:id') updateGroup(@Param('id') id: string, @body(toppingGroupSchema) b: z.infer<typeof toppingGroupSchema>, @AuditActor() a: Actor) { return this.svc.updateGroup(a, id, b); }
  @Delete('topping-groups/:id') deleteGroup(@Param('id') id: string, @AuditActor() a: Actor) { return this.svc.deleteGroup(a, id); }

  // sizes and crusts
  @Get('sizes') sizes() { return this.svc.listSizes(); }
  @Post('sizes') createSize(@body(sizeSchema) b: z.infer<typeof sizeSchema>, @AuditActor() a: Actor) { return this.svc.createSize(a, b); }
  @Put('sizes/:id') updateSize(@Param('id') id: string, @body(sizeSchema) b: z.infer<typeof sizeSchema>, @AuditActor() a: Actor) { return this.svc.updateSize(a, id, b); }
  @Delete('sizes/:id') deleteSize(@Param('id') id: string, @AuditActor() a: Actor) { return this.svc.deleteSize(a, id); }
  @Get('crusts') crusts() { return this.svc.listCrusts(); }
  @Post('crusts') createCrust(@body(crustSchema) b: z.infer<typeof crustSchema>, @AuditActor() a: Actor) { return this.svc.createCrust(a, b); }
  @Put('crusts/:id') updateCrust(@Param('id') id: string, @body(crustSchema) b: z.infer<typeof crustSchema>, @AuditActor() a: Actor) { return this.svc.updateCrust(a, id, b); }
  @Delete('crusts/:id') deleteCrust(@Param('id') id: string, @AuditActor() a: Actor) { return this.svc.deleteCrust(a, id); }

  // delivery zones
  @Get('delivery-zones') zones() { return this.svc.listZones(); }
  @Post('delivery-zones') createZone(@body(deliveryZoneSchema) b: z.infer<typeof deliveryZoneSchema>, @AuditActor() a: Actor) { return this.svc.createZone(a, b); }
  @Post('delivery-zones/reorder') @HttpCode(200) reorderZones(@body(reorderBody) b: Reorder, @AuditActor() a: Actor) { return this.svc.reorder(a, 'DeliveryZone', b.ids); }
  @Put('delivery-zones/:id') updateZone(@Param('id') id: string, @body(deliveryZoneSchema) b: z.infer<typeof deliveryZoneSchema>, @AuditActor() a: Actor) { return this.svc.updateZone(a, id, b); }
  @Delete('delivery-zones/:id') deleteZone(@Param('id') id: string, @AuditActor() a: Actor) { return this.svc.deleteZone(a, id); }
}
