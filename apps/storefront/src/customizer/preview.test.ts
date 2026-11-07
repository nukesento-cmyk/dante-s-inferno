import { describe, expect, it } from 'vitest';
import { crustsForSize, maxExtras, previewPrice } from './preview';
import type { Ingredient, MenuCrust, ProductPublic } from '../services/types';

const ing = (id: string, surchargeCents: number): Ingredient => ({ id, slug: id, name: id, description: '', groupId: 'g', surchargeCents, modelKey: id, color: '#fff' });
const product: ProductPublic = {
  id: 'p', slug: 'p', name: 'P', description: '', imageUrl: null, featured: false, categoryId: 'c', maxExtraToppings: null,
  prices: [{ sizeId: 'M', priceCents: 80000 }, { sizeId: 'L', priceCents: 110000 }],
  defaultIngredients: [], extraIngredients: [ing('a', 10000), ing('b', 15000)],
};
const crusts: MenuCrust[] = [
  { id: 'thin', name: 'Thin', description: '', adjustments: [{ sizeId: 'M', adjustmentCents: 0 }, { sizeId: 'L', adjustmentCents: 0 }] },
  { id: 'stuffed', name: 'Stuffed', description: '', adjustments: [{ sizeId: 'L', adjustmentCents: 20000 }] },
];

describe('price preview', () => {
  it('adds size price, crust adjustment and extras, times quantity', () => {
    const r = previewPrice({ product, sizeId: 'L', crust: crusts[1], added: product.extraIngredients, quantity: 2 });
    expect(r.unitPriceCents).toBe(110000 + 20000 + 25000);
    expect(r.lineTotalCents).toBe(r.unitPriceCents * 2);
  });

  it('hides crusts with no adjustment row for the size', () => {
    expect(crustsForSize(crusts, 'M').map((c) => c.id)).toEqual(['thin']);
    expect(crustsForSize(crusts, 'L').map((c) => c.id)).toEqual(['thin', 'stuffed']);
  });

  it('falls back to the default max extras', () => {
    expect(maxExtras(product, 3)).toBe(3);
    expect(maxExtras({ ...product, maxExtraToppings: 5 }, 3)).toBe(5);
  });
});
