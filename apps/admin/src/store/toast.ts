import { create } from 'zustand';

export interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}
interface ToastState {
  items: ToastItem[];
  push: (kind: ToastItem['kind'], text: string) => void;
  dismiss: (id: number) => void;
}
let nextId = 1;
export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (kind, text) => {
    const id = nextId++;
    set((s) => ({ items: [...s.items, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 4000);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));
export const toast = {
  success: (t: string) => useToasts.getState().push('success', t),
  error: (t: string) => useToasts.getState().push('error', t),
  info: (t: string) => useToasts.getState().push('info', t),
};
