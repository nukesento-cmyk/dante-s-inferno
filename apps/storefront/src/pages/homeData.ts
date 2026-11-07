import type { Ingredient } from '../services/types';

/** Used when the API is unreachable so the 3D scenes still have something to show. */
export const FALLBACK_INGREDIENTS: Pick<Ingredient, 'id' | 'slug' | 'name' | 'description' | 'modelKey' | 'color' | 'surchargeCents'>[] = [
  { id: 'f1', slug: 'pepperoni', name: 'Pepperoni', description: 'Spicy cured beef pepperoni that cups and crisps in the oven.', modelKey: 'pepperoni', color: '#b3261e', surchargeCents: 0 },
  { id: 'f2', slug: 'black-olives', name: 'Black olives', description: 'Briny sliced olives for a salty, savoury bite.', modelKey: 'olive', color: '#26242a', surchargeCents: 0 },
  { id: 'f3', slug: 'mushrooms', name: 'Mushrooms', description: 'Earthy sliced button mushrooms, roasted until golden.', modelKey: 'mushroom', color: '#d8c3a5', surchargeCents: 0 },
  { id: 'f4', slug: 'green-pepper', name: 'Green peppers', description: 'Crunchy strips with a fresh, grassy sweetness.', modelKey: 'pepper', color: '#3f9b3a', surchargeCents: 0 },
  { id: 'f5', slug: 'red-onion', name: 'Red onion', description: 'Thin rings that turn sweet and jammy in the heat.', modelKey: 'onion', color: '#a0407f', surchargeCents: 0 },
  { id: 'f6', slug: 'basil', name: 'Fresh basil', description: 'Torn leaves added at the end for a fragrant lift.', modelKey: 'basil', color: '#2f8a3a', surchargeCents: 0 },
];

export const photos = {
  hero: '/images/idlePage.jpg',
  basil: '/images/narek-petrosyan--0nj85eRLPk-unsplash.jpg',
  closeup: '/images/aldward-castillo-mbDTDm_s9C0-unsplash.jpg',
  board: '/images/faizan-saeed-8thte7ceLSw-unsplash.jpg',
};
