import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDeliveryZones, getMenu, getProduct, getSettings } from '../services/catalog';
import { getCart } from '../services/cart';
import { getMe } from '../services/auth';
import { useCartStore } from '../store/cartStore';

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 60_000, refetchInterval: 5 * 60_000 });
export const useMenu = () => useQuery({ queryKey: ['menu'], queryFn: getMenu, staleTime: 60_000 });
export const useProduct = (slug: string | undefined) =>
  useQuery({ queryKey: ['product', slug], queryFn: () => getProduct(slug!), enabled: !!slug });
export const useZones = () => useQuery({ queryKey: ['zones'], queryFn: getDeliveryZones, staleTime: 60_000 });
export const useMe = () => useQuery({ queryKey: ['me'], queryFn: getMe, staleTime: 30_000 });

export function useCart() {
  const token = useCartStore((s) => s.token);
  const setCount = useCartStore((s) => s.setCount);
  const q = useQuery({ queryKey: ['cart', token], queryFn: getCart });
  const count = q.data?.items.reduce((n, i) => n + i.quantity, 0);
  useEffect(() => {
    if (count !== undefined) setCount(count);
  }, [count, setCount]);
  return q;
}
