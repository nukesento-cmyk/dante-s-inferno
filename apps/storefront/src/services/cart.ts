import type { CartItemInput, FulfilmentType, OrderPrice } from '@dantes/shared';
import { ApiError, api } from '../lib/api';
import { useCartStore } from '../store/cartStore';
import type { Cart } from './types';

const hdr = (token: string) => ({ 'X-Cart-Token': token });

export async function createCart(): Promise<Cart> {
  const cart = await api<Cart>('/cart', { method: 'POST' });
  if (cart.token) useCartStore.getState().setToken(cart.token);
  return cart;
}

async function ensureToken(): Promise<string> {
  const existing = useCartStore.getState().token;
  if (existing) return existing;
  const cart = await createCart();
  return cart.token!;
}

/** Runs a cart request; if the stored token is stale (404/401/410) creates a new cart once and retries. */
async function withCart<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await ensureToken();
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof ApiError && [401, 404, 410].includes(e.status)) {
      useCartStore.getState().reset();
      const fresh = await ensureToken();
      return fn(fresh);
    }
    throw e;
  }
}

const emptyCart: Cart = { items: [], subtotalCents: 0 };

export async function getCart(): Promise<Cart> {
  const token = useCartStore.getState().token;
  if (!token) return emptyCart;
  try {
    return await api<Cart>('/cart', { headers: hdr(token) });
  } catch (e) {
    if (e instanceof ApiError && [401, 404, 410].includes(e.status)) {
      useCartStore.getState().reset();
      return emptyCart;
    }
    throw e;
  }
}

export const addCartItem = (item: CartItemInput) =>
  withCart((t) => api<Cart>('/cart/items', { method: 'POST', body: item, headers: hdr(t) }));

export const updateCartItem = (id: string, patch: Partial<Omit<CartItemInput, 'productId'>>) =>
  withCart((t) => api<Cart>(`/cart/items/${id}`, { method: 'PATCH', body: patch, headers: hdr(t) }));

export const removeCartItem = (id: string) =>
  withCart((t) => api<Cart>(`/cart/items/${id}`, { method: 'DELETE', headers: hdr(t) }));

export const quoteCart = (fulfilment: FulfilmentType, deliveryZoneId?: string) =>
  withCart((t) => api<OrderPrice>('/cart/quote', { method: 'POST', body: { fulfilment, deliveryZoneId }, headers: hdr(t) }));
