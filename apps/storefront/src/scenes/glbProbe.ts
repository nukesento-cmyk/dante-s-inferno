import { useEffect, useState } from 'react';

export const PIZZA_GLB_URL = '/models/pizza.glb';

let result: boolean | undefined;
let pending: Promise<boolean> | undefined;

/** One HEAD request per page load. The dev server answers unknown paths with index.html, so the content type is checked too. */
export function probePizzaGlb(): Promise<boolean> {
  pending ??= fetch(PIZZA_GLB_URL, { method: 'HEAD' })
    .then((r) => r.ok && !/text\/html/i.test(r.headers.get('content-type') ?? ''))
    .catch(() => false)
    .then((ok) => (result = ok));
  return pending;
}

export function usePizzaGlbAvailable(): boolean {
  const [ok, setOk] = useState(result ?? false);
  useEffect(() => {
    let live = true;
    void probePizzaGlb().then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}
