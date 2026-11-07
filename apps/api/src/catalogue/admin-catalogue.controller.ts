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
import { memoryStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { AuditActor, Staff } from '../auth/guards';
import { zod } from '../common/zod.pipe';
import { type Actor, AuditService } from '../core/audit.service';
import { AdminCatalogueService } from './admin-catalogue.service';

export const UPLOADS_DIR = resolve(__dirname, '..', '..', 'uploads');
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Identifies an image by its magic bytes (the declared Content-Type and file name are ignored). Returns the extension, or null. */
export function sniffImage(b: Buffer): string | null {
  const ascii = (from: number, to: number) => b.subarray(from, to).toString('latin1');
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return '.gif';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return '.webp';
  if (b.length >= 12 && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return '.avif';
  return null;
}
const reorderBody = z.object({ ids: z.array(z.string()).min(1) });
const availabilityBody = z.object({ available: z.boolean() });
const listQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });

type Reorder = z.infer<typeof reorderBody>;
const body = <T extends z.ZodTypeAny>(s: T) => Body(zod(s));

@Controller('admin')
@Staff('OWNER', 'MANAGER')
export class AdminCatalogueController {
  constructor(
    private readonly svc: AdminCatalogueService,
    private readonly audit: AuditService,
  ) {}

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
    // Memory storage: nothing touches the disk until the bytes are verified to be a real image.
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      storage: memoryStorage(),
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @AuditActor() actor: Actor) {
    if (!file) throw new BadRequestException('Attach an image in the "file" field');
    const ext = sniffImage(file.buffer);
    if (!ext) throw new BadRequestException('Only JPEG, PNG, WebP, GIF or AVIF images are allowed');
    // The name is generated here and the extension comes from the sniffed bytes, never from the client.
    const filename = `${randomUUID()}${ext}`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(join(UPLOADS_DIR, filename), file.buffer, { flag: 'wx', mode: 0o644 });
    await this.audit.log(actor, { action: 'upload.image', entity: 'Upload', entityId: filename, after: { filename, bytes: file.size, type: ext } });
    return { url: `/uploads/${filename}` };
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
