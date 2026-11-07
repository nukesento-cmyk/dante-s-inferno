import type { Ingredient, ToppingGroup } from '@prisma/client';

export type IngredientWithGroup = Ingredient & { group: Pick<ToppingGroup, 'surchargeCents'> };

export const ingredientSurcharge = (i: IngredientWithGroup) => i.surchargeCents ?? i.group.surchargeCents;

export function toIngredientPublic(i: IngredientWithGroup) {
  return {
    id: i.id,
    slug: i.slug,
    name: i.name,
    description: i.description,
    groupId: i.groupId,
    surchargeCents: ingredientSurcharge(i),
    modelKey: i.modelKey,
    color: i.color,
  };
}

export const productInclude = {
  prices: { where: { size: { active: true } }, orderBy: { size: { sortOrder: 'asc' } } },
  ingredients: { include: { ingredient: { include: { group: true } } } },
} as const;

type ProductRow = {
  id: string; slug: string; name: string; description: string; imageUrl: string | null; featured: boolean; categoryId: string;
  maxExtraToppings: number | null;
  prices: { sizeId: string; priceCents: number }[];
  ingredients: { isDefault: boolean; allowExtra: boolean; ingredient: IngredientWithGroup }[];
};

export function toProductPublic(p: ProductRow) {
  const sorted = [...p.ingredients].sort((a, b) => a.ingredient.sortOrder - b.ingredient.sortOrder);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    featured: p.featured,
    categoryId: p.categoryId,
    maxExtraToppings: p.maxExtraToppings,
    prices: p.prices.map((x) => ({ sizeId: x.sizeId, priceCents: x.priceCents })),
    defaultIngredients: sorted.filter((l) => l.isDefault).map((l) => toIngredientPublic(l.ingredient)),
    extraIngredients: sorted.filter((l) => l.allowExtra && l.ingredient.available).map((l) => toIngredientPublic(l.ingredient)),
  };
}
