import { beforeEach, describe, expect, it } from 'vitest';
import { CART_TOKEN_KEY, useCartStore } from './cartStore';

describe('cart store', () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.getState().reset();
  });

  it('persists the cart token in localStorage', () => {
    useCartStore.getState().setToken('tok_123');
    expect(useCartStore.getState().token).toBe('tok_123');
    expect(localStorage.getItem(CART_TOKEN_KEY)).toBe('tok_123');
  });

  it('reset clears token and count', () => {
    useCartStore.getState().setToken('tok_123');
    useCartStore.getState().setCount(3);
    useCartStore.getState().reset();
    expect(useCartStore.getState()).toMatchObject({ token: null, count: 0 });
    expect(localStorage.getItem(CART_TOKEN_KEY)).toBeNull();
  });
});
