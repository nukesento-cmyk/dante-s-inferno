import type { Cents } from './money';
import type { FulfilmentType } from './enums';

/**
 * Pure pricing engine shared by the API (authoritative) and the storefront (preview only).
 * The API must look every price up from the database and call these functions itself;
 * it never accepts a price from the browser.
 */

export interface LinePriceInput {
  /** Product price for the chosen size. */
  sizePriceCents: Cents;
  /** Crust adjustment for the chosen size (may be 0). */
  crustAdjustmentCents: Cents;
  /** Surcharge of each EXTRA topping added beyond the product's defaults. */
  extraToppingSurchargesCents: Cents[];
  quantity: number;
}

export interface LinePrice {
  unitPriceCents: Cents;
  lineTotalCents: Cents;
}

export function priceLine(input: LinePriceInput): LinePrice {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('quantity must be a positive integer');
  }
  const extras = input.extraToppingSurchargesCents.reduce((a, b) => a + b, 0);
  const unitPriceCents = input.sizePriceCents + input.crustAdjustmentCents + extras;
  return { unitPriceCents, lineTotalCents: unitPriceCents * input.quantity };
}

export interface DeliveryZoneRule {
  feeCents: Cents;
  minOrderCents: Cents;
  /** null = no free-delivery threshold */
  freeDeliveryFromCents: Cents | null;
  active: boolean;
}

export interface OrderPriceInput {
  lineTotalsCents: Cents[];
  fulfilment: FulfilmentType;
  zone: DeliveryZoneRule | null;
  packagingFeeCents: Cents;
  /** Basis points: 1600 = 16% */
  vatRateBps: number;
  pricesIncludeVat: boolean;
}

export type OrderPriceProblem = 'EMPTY_CART' | 'ZONE_REQUIRED' | 'ZONE_INACTIVE' | 'BELOW_MINIMUM';

export interface OrderPrice {
  subtotalCents: Cents;
  deliveryFeeCents: Cents;
  packagingFeeCents: Cents;
  /** VAT portion. Included in total when pricesIncludeVat, added on top otherwise. */
  vatCents: Cents;
  totalCents: Cents;
  /** Amount still needed to reach the zone minimum (0 when met). */
  shortfallToMinimumCents: Cents;
  /** Amount still needed for free delivery (null when no threshold or already free). */
  remainingForFreeDeliveryCents: Cents | null;
  problems: OrderPriceProblem[];
}

export function priceOrder(input: OrderPriceInput): OrderPrice {
  const problems: OrderPriceProblem[] = [];
  const subtotalCents = input.lineTotalsCents.reduce((a, b) => a + b, 0);
  if (input.lineTotalsCents.length === 0) problems.push('EMPTY_CART');

  let deliveryFeeCents = 0;
  let shortfallToMinimumCents = 0;
  let remainingForFreeDeliveryCents: Cents | null = null;

  if (input.fulfilment === 'DELIVERY') {
    const zone = input.zone;
    if (!zone) {
      problems.push('ZONE_REQUIRED');
    } else {
      if (!zone.active) problems.push('ZONE_INACTIVE');
      if (subtotalCents < zone.minOrderCents) {
        shortfallToMinimumCents = zone.minOrderCents - subtotalCents;
        problems.push('BELOW_MINIMUM');
      }
      const free = zone.freeDeliveryFromCents !== null && subtotalCents >= zone.freeDeliveryFromCents;
      deliveryFeeCents = free ? 0 : zone.feeCents;
      if (zone.freeDeliveryFromCents !== null && !free) {
        remainingForFreeDeliveryCents = zone.freeDeliveryFromCents - subtotalCents;
      }
    }
  }

  const packagingFeeCents = input.lineTotalsCents.length ? input.packagingFeeCents : 0;
  const gross = subtotalCents + deliveryFeeCents + packagingFeeCents;

  let vatCents: Cents;
  let totalCents: Cents;
  if (input.pricesIncludeVat) {
    vatCents = Math.round((gross * input.vatRateBps) / (10000 + input.vatRateBps));
    totalCents = gross;
  } else {
    vatCents = Math.round((gross * input.vatRateBps) / 10000);
    totalCents = gross + vatCents;
  }

  return {
    subtotalCents,
    deliveryFeeCents,
    packagingFeeCents,
    vatCents,
    totalCents,
    shortfallToMinimumCents,
    remainingForFreeDeliveryCents,
    problems,
  };
}
