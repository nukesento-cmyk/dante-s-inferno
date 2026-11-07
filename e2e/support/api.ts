import type { APIRequestContext } from '@playwright/test';
import { priceLine, priceOrder, type OrderPrice } from '@dantes/shared';
import { API_URL } from './env';

/* Typed just enough for the specs; the API contract is documentation/api-contract.md. */
export interface Ingredient { id: string; name: string; surchargeCents: number }
export interface Product { id: string; slug: string; name: string; maxExtraToppings: number; prices: { sizeId: string; priceCents: number }[]; defaultIngredients: Ingredient[]; extraIngredients: Ingredient[] }
export interface Menu {
  sizes: { id: string; code: string; name: string; inches: number }[];
  crusts: { id: string; name: string; adjustments: { sizeId: string; adjustmentCents: number }[] }[];
  products: Product[];
}
export interface Zone { id: string; name: string; feeCents: number; minOrderCents: number; freeDeliveryFromCents: number | null }
export interface PublicSettings { phone: string; packagingFeeCents: number; vatRateBps: number; pricesIncludeVat: boolean; defaultMaxExtraToppings: number }

const get = async <T>(request: APIRequestContext, path: string): Promise<T> => {
  const res = await request.get(`${API_URL}/api/v1${path}`);
  if (!res.ok()) throw new Error(`GET ${path} -> ${res.status()}`);
  return (await res.json()) as T;
};
export const getMenu = (r: APIRequestContext) => get<Menu>(r, '/public/menu');
export const getZones = (r: APIRequestContext) => get<Zone[]>(r, '/public/delivery-zones');
export const getSettings = (r: APIRequestContext) => get<PublicSettings>(r, '/public/settings');

export function expectedLine(menu: Menu, product: Product, sizeCode: string, crustName: string, extras: Ingredient[], quantity = 1) {
  const size = menu.sizes.find((s) => s.code === sizeCode)!;
  const crust = menu.crusts.find((c) => c.name === crustName)!;
  return priceLine({
    sizePriceCents: product.prices.find((p) => p.sizeId === size.id)!.priceCents,
    crustAdjustmentCents: crust.adjustments.find((a) => a.sizeId === size.id)?.adjustmentCents ?? 0,
    extraToppingSurchargesCents: extras.map((e) => e.surchargeCents),
    quantity,
  });
}

export function expectedOrder(settings: PublicSettings, lineTotalsCents: number[], zone: Zone | null): OrderPrice {
  return priceOrder({
    lineTotalsCents,
    fulfilment: zone ? 'DELIVERY' : 'COLLECTION',
    zone: zone ? { ...zone, active: true } : null,
    packagingFeeCents: settings.packagingFeeCents,
    vatRateBps: settings.vatRateBps,
    pricesIncludeVat: settings.pricesIncludeVat,
  });
}
