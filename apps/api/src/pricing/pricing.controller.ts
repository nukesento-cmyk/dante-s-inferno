import { BadRequestException, Body, Controller, Get, Injectable, Put } from '@nestjs/common';
import { centsSchema } from '@dantes/shared';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditActor, Staff } from '../auth/guards';
import { zod } from '../common/zod.pipe';
import { type Actor, AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';

const pricingUpdateSchema = z.object({
  products: z.array(z.object({ id: z.string(), prices: z.array(z.object({ sizeId: z.string(), priceCents: centsSchema })) })).optional(),
  crusts: z.array(z.object({ id: z.string(), adjustments: z.array(z.object({ sizeId: z.string(), adjustmentCents: centsSchema })) })).optional(),
  toppingGroups: z.array(z.object({ id: z.string(), surchargeCents: centsSchema })).optional(),
  ingredients: z.array(z.object({ id: z.string(), surchargeCents: centsSchema.nullable() })).optional(),
  settings: z
    .object({ vatRateBps: z.number().int().min(0).max(5000), pricesIncludeVat: z.boolean(), packagingFeeCents: centsSchema })
    .partial()
    .optional(),
});
type PricingUpdate = z.infer<typeof pricingUpdateSchema>;

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async snapshot(db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const [sizes, products, crusts, toppingGroups, ingredients, s] = await Promise.all([
      db.size.findMany({ orderBy: { sortOrder: 'asc' } }),
      db.product.findMany({ where: { archived: false }, orderBy: { sortOrder: 'asc' }, include: { prices: true } }),
      db.crustOption.findMany({ orderBy: { sortOrder: 'asc' }, include: { adjustments: true } }),
      db.toppingGroup.findMany({ orderBy: { sortOrder: 'asc' } }),
      db.ingredient.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      db.restaurantSettings.findUniqueOrThrow({ where: { id: 1 } }),
    ]);
    return {
      sizes: sizes.map(({ id, code, name, inches }) => ({ id, code, name, inches })),
      products: products.map((p) => ({ id: p.id, name: p.name, prices: p.prices.map(({ sizeId, priceCents }) => ({ sizeId, priceCents })) })),
      crusts: crusts.map((c) => ({ id: c.id, name: c.name, adjustments: c.adjustments.map(({ sizeId, adjustmentCents }) => ({ sizeId, adjustmentCents })) })),
      toppingGroups: toppingGroups.map(({ id, name, surchargeCents }) => ({ id, name, surchargeCents })),
      ingredients: ingredients.map(({ id, name, groupId, surchargeCents }) => ({ id, name, groupId, surchargeCents })),
      settings: { vatRateBps: s.vatRateBps, pricesIncludeVat: s.pricesIncludeVat, packagingFeeCents: s.packagingFeeCents },
    };
  }

  async update(actor: Actor, input: PricingUpdate) {
    const before = await this.snapshot();
    const after = await this.prisma.$transaction(async (tx) => {
      const sizeIds = new Set(before.sizes.map((s) => s.id));
      const check = (sizeId: string) => {
        if (!sizeIds.has(sizeId)) throw new BadRequestException(`Unknown size ${sizeId}`);
      };
      for (const p of input.products ?? []) {
        p.prices.forEach((x) => check(x.sizeId));
        await tx.productPrice.deleteMany({ where: { productId: p.id, sizeId: { notIn: p.prices.map((x) => x.sizeId) } } });
        for (const x of p.prices) {
          await tx.productPrice.upsert({
            where: { productId_sizeId: { productId: p.id, sizeId: x.sizeId } },
            update: { priceCents: x.priceCents },
            create: { productId: p.id, sizeId: x.sizeId, priceCents: x.priceCents },
          });
        }
      }
      for (const c of input.crusts ?? []) {
        c.adjustments.forEach((x) => check(x.sizeId));
        await tx.crustSizePrice.deleteMany({ where: { crustId: c.id, sizeId: { notIn: c.adjustments.map((x) => x.sizeId) } } });
        for (const x of c.adjustments) {
          await tx.crustSizePrice.upsert({
            where: { crustId_sizeId: { crustId: c.id, sizeId: x.sizeId } },
            update: { adjustmentCents: x.adjustmentCents },
            create: { crustId: c.id, sizeId: x.sizeId, adjustmentCents: x.adjustmentCents },
          });
        }
      }
      for (const g of input.toppingGroups ?? []) await tx.toppingGroup.update({ where: { id: g.id }, data: { surchargeCents: g.surchargeCents } });
      for (const i of input.ingredients ?? []) await tx.ingredient.update({ where: { id: i.id }, data: { surchargeCents: i.surchargeCents } });
      if (input.settings && Object.keys(input.settings).length) await tx.restaurantSettings.update({ where: { id: 1 }, data: input.settings });
      const snapshot = await this.snapshot(tx);
      await this.audit.log(actor, { action: 'pricing.update', entity: 'Pricing', before, after: snapshot }, tx);
      return snapshot;
    });
    return after;
  }
}

@Controller('admin/pricing')
@Staff('OWNER', 'MANAGER')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  get() {
    return this.pricing.snapshot();
  }

  @Put()
  update(@Body(zod(pricingUpdateSchema)) body: PricingUpdate, @AuditActor() actor: Actor) {
    return this.pricing.update(actor, body);
  }
}
