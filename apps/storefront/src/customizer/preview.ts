import { priceLine } from '@dantes/shared';
import type { Ingredient, MenuCrust, ProductPublic } from '../services/types';

/** Crusts offered for a size: only those with an adjustment row for that size. */
export function crustsForSize(crusts: MenuCrust[], sizeId: string): MenuCrust[] {
  return crusts.filter((c) => c.adjustments.some((a) => a.sizeId === sizeId));
}

export function crustAdjustment(crust: MenuCrust | undefined, sizeId: string): number {
  return crust?.adjustments.find((a) => a.sizeId === sizeId)?.adjustmentCents ?? 0;
}

export interface PreviewInput {
  product: ProductPublic;
  sizeId: string;
  crust: MenuCrust | undefined;
  added: Ingredient[];
  quantity: number;
}

/** Instant PREVIEW only. The server recomputes every price when the item is added to the cart. */
export function previewPrice({ product, sizeId, crust, added, quantity }: PreviewInput) {
  const sizePriceCents = product.prices.find((p) => p.sizeId === sizeId)?.priceCents ?? 0;
  return priceLine({
    sizePriceCents,
    crustAdjustmentCents: crustAdjustment(crust, sizeId),
    extraToppingSurchargesCents: added.map((i) => i.surchargeCents),
    quantity,
  });
}

export function maxExtras(product: ProductPublic, defaultMax: number): number {
  return product.maxExtraToppings ?? defaultMax;
}
