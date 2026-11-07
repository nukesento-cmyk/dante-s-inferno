import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { toast } from '../store/toast';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Mutation with success/error toasts and query invalidation. */
export function useAction<A, R = unknown>(fn: (arg: A) => Promise<R>, opts: { success?: string; invalidate?: QueryKey[]; onSuccess?: (r: R) => void }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast.success(opts.success);
      opts.invalidate?.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(r);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useIsMobileOrTablet() {
  return typeof window !== 'undefined' && window.innerWidth < 1024;
}

/** Local ordered copy of server data with optimistic move + persisted reorder. */
export function useOrdered<T extends { id: string }>(data: T[] | undefined, persist: (ids: string[]) => Promise<unknown>, invalidate: QueryKey) {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    if (data) setList(data);
  }, [data]);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: persist,
    onSuccess: () => void qc.invalidateQueries({ queryKey: invalidate }),
    onError: (e) => {
      toast.error(errorMessage(e));
      if (data) setList(data);
    },
  });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const next = list.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it as T);
    setList(next);
    m.mutate(next.map((x) => x.id));
  };
  return { list, move };
}
