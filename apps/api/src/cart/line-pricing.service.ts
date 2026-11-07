import { Injectable } from '@nestjs/common';
import { type OrderPrice, priceLine, priceOrder } from '@dantes/shared';
import type { DeliveryZone, FulfilmentType } from '@prisma/client';
import { type IngredientWithGroup, ingredientSurcharge, toIngredientPublic } from '../catalogue/catalogue.mapper';
import { PrismaService } from '../core/prisma.service';
import { SettingsService } from '../core/settings.service';

export interface LineInput {
  productId: string;
  sizeId: string;
  crustId: string;
  quantity: number;
  addIngredientIds: string[];
  removeIngredientIds: string[];
  notes?: string | null;
}

export type ResolvedLine =
  | {
      ok: true;
      productName: string;
      productSlug: string;
      imageUrl: string | null;
      sizeName: string;
      crustName: string;
      unitPriceCents: number;
      lineTotalCents: number;
      added: IngredientWithGroup[];
      removed: IngredientWithGroup[];
      defaults: IngredientWithGroup[];
    }
  | { ok: false; reason: string; productName?: string; productSlug?: string; imageUrl?: string | null; sizeName?: string; crustName?: string };

export const publicIngredient = toIngredientPublic;

@Injectable()
export class LinePricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Resolves every line from the current catalogue. Never throws for bad lines; they come back as ok:false. */
  async resolveMany(inputs: LineInput[]): Promise<ResolvedLine[]> {
    if (!inputs.length) return [];
    const [products, sizes, crusts, settings] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: [...new Set(inputs.map((i) => i.productId))] } },
        include: { prices: true, ingredients: { include: { ingredient: { include: { group: true } } } } },
      }),
      this.prisma.size.findMany({ where: { id: { in: inputs.map((i) => i.sizeId) } } }),
      this.prisma.crustOption.findMany({ where: { id: { in: inputs.map((i) => i.crustId) } }, include: { adjustments: true } }),
      this.settings.get(),
    ]);

    return inputs.map((input): ResolvedLine => {
      const product = products.find((p) => p.id === input.productId);
      const size = sizes.find((s) => s.id === input.sizeId);
      const crust = crusts.find((c) => c.id === input.crustId);
      const names = {
        productName: product?.name,
        productSlug: product?.slug,
        imageUrl: product?.imageUrl,
        sizeName: size?.name,
        crustName: crust?.name,
      };
      const fail = (reason: string): ResolvedLine => ({ ok: false, reason, ...names });

      if (!product || product.archived || !product.available) return fail('This item is no longer available');
      if (!size || !size.active) return fail('This size is no longer available');
      if (!crust || !crust.active) return fail('This crust is no longer available');
      const price = product.prices.find((p) => p.sizeId === size.id);
      if (!price) return fail(`${product.name} is not sold in ${size.name}`);
      const adjustment = crust.adjustments.find((a) => a.sizeId === size.id);
      if (!adjustment) return fail(`${crust.name} crust is not available in ${size.name}`);

      const add = input.addIngredientIds;
      const remove = input.removeIngredientIds;
      if (new Set(add).size !== add.length || new Set(remove).size !== remove.length) return fail('Duplicate toppings are not allowed');
      if (add.some((id) => remove.includes(id))) return fail('A topping cannot be both added and removed');
      const links = product.ingredients;
      const added: IngredientWithGroup[] = [];
      for (const id of add) {
        const link = links.find((l) => l.ingredientId === id);
        if (!link || !link.allowExtra) return fail('One of the extra toppings is not allowed on this pizza');
        if (!link.ingredient.available) return fail(`${link.ingredient.name} is currently unavailable`);
        added.push(link.ingredient);
      }
      const max = product.maxExtraToppings ?? settings.defaultMaxExtraToppings;
      if (added.length > max) return fail(`You can add at most ${max} extra toppings to this pizza`);
      const removed: IngredientWithGroup[] = [];
      for (const id of remove) {
        const link = links.find((l) => l.ingredientId === id && l.isDefault);
        if (!link) return fail('One of the removed toppings is not on this pizza');
        removed.push(link.ingredient);
      }

      const { unitPriceCents, lineTotalCents } = priceLine({
        sizePriceCents: price.priceCents,
        crustAdjustmentCents: adjustment.adjustmentCents,
        extraToppingSurchargesCents: added.map(ingredientSurcharge),
        quantity: input.quantity,
      });
      return {
        ok: true,
        productName: product.name,
        productSlug: product.slug,
        imageUrl: product.imageUrl,
        sizeName: size.name,
        crustName: crust.name,
        unitPriceCents,
        lineTotalCents,
        added,
        removed,
        defaults: links.filter((l) => l.isDefault && !remove.includes(l.ingredientId)).map((l) => l.ingredient),
      };
    });
  }

  async resolveOne(input: LineInput) {
    return (await this.resolveMany([input]))[0]!;
  }

  async priceOrder(lineTotalsCents: number[], fulfilment: FulfilmentType, zone: DeliveryZone | null): Promise<OrderPrice> {
    const s = await this.settings.get();
    return priceOrder({
      lineTotalsCents,
      fulfilment,
      zone,
      packagingFeeCents: s.packagingFeeCents,
      vatRateBps: s.vatRateBps,
      pricesIncludeVat: s.pricesIncludeVat,
    });
  }
}
