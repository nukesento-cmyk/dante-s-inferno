import { useQuery } from '@tanstack/react-query';
import { categoriesApi, crustsApi, ingredientsApi, productsApi, sizesApi, toppingGroupsApi, zonesApi } from './endpoints';
import { toList } from '../lib/format';
import type { Category, Crust, DeliveryZone, Ingredient, Product, Size, ToppingGroup } from './types';

const sorted = <T extends { sortOrder?: number }>(a: T[]) => a.slice().sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));

export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: async () => sorted(toList<Category>(await categoriesApi.list())) });
export const useSizes = () => useQuery({ queryKey: ['sizes'], queryFn: async () => sorted(toList<Size>(await sizesApi.list())) });
export const useCrusts = () => useQuery({ queryKey: ['crusts'], queryFn: async () => sorted(toList<Crust>(await crustsApi.list())) });
export const useGroups = () => useQuery({ queryKey: ['topping-groups'], queryFn: async () => sorted(toList<ToppingGroup>(await toppingGroupsApi.list())) });
export const useIngredients = () => useQuery({ queryKey: ['ingredients'], queryFn: async () => toList<Ingredient>(await ingredientsApi.list()) });
export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: async () => sorted(toList<Product>(await productsApi.list())) });
export const useZones = () => useQuery({ queryKey: ['zones'], queryFn: async () => sorted(toList<DeliveryZone>(await zonesApi.list())) });
