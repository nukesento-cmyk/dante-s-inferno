import { create } from 'zustand';

export const CART_TOKEN_KEY = 'dp_cart_token';

function read(): string | null {
  try {
    return localStorage.getItem(CART_TOKEN_KEY);
  } catch {
    return null;
  }
}
function write(token: string | null) {
  try {
    if (token) localStorage.setItem(CART_TOKEN_KEY, token);
    else localStorage.removeItem(CART_TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

interface CartState {
  token: string | null;
  /** Item count mirrored from the last fetched cart, for the header badge. */
  count: number;
  setToken: (token: string | null) => void;
  setCount: (n: number) => void;
  reset: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  token: read(),
  count: 0,
  setToken: (token) => {
    write(token);
    set({ token });
  },
  setCount: (count) => set({ count }),
  reset: () => {
    write(null);
    set({ token: null, count: 0 });
  },
}));
