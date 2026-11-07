import { describe, expect, it } from 'vitest';
import type { PricingPayload } from '../../api/types';
import { toDraft, toPayload } from './Pricing';
import { nextOccurrence } from './Hours';

const data: PricingPayload = {
  sizes: [{ id: 's', name: 'Small' }, { id: 'm', name: 'Medium' }],
  products: [{ id: 'p1', name: 'Margherita', prices: [{ sizeId: 's', priceCents: 65000 }] }],
  crusts: [{ id: 'c1', name: 'Deep pan', adjustments: [{ sizeId: 's', adjustmentCents: 15000 }] }],
  toppingGroups: [{ id: 'g1', name: 'Meat', surchargeCents: 20000 }],
  ingredients: [{ id: 'i1', name: 'Bacon', groupId: 'g1', surchargeCents: null }],
  settings: { vatRateBps: 1600, pricesIncludeVat: true, packagingFeeCents: 0 },
};

describe('pricing draft', () => {
  it('round-trips an untouched draft to the same cents', () => {
    const { payload, invalid } = toPayload(toDraft(data), data.sizes);
    expect(invalid.size).toBe(0);
    expect(payload?.products?.[0]?.prices).toEqual([{ sizeId: 's', priceCents: 65000 }]);
    expect(payload?.ingredients?.[0]?.surchargeCents).toBeNull();
    expect(payload?.settings?.vatRateBps).toBe(1600);
  });
  it('flags invalid cells and converts edits to cents', () => {
    const d = toDraft(data);
    d.products[0]!.prices.m = '1,100';
    expect(toPayload(d, data.sizes).payload?.products?.[0]?.prices).toContainEqual({ sizeId: 'm', priceCents: 110000 });
    d.groups[0]!.surcharge = 'abc';
    expect(toPayload(d, data.sizes).invalid.has('g:g1')).toBe(true);
  });
});

describe('holiday quick-add', () => {
  it('picks the next occurrence', () => {
    expect(nextOccurrence(12, 25, '2026-11-07')).toBe('2026-12-25');
    expect(nextOccurrence(6, 1, '2026-11-07')).toBe('2027-06-01');
  });
});
