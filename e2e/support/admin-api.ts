import { request, type APIRequestContext } from '@playwright/test';
import { API_URL, OWNER_EMAIL, OWNER_PASSWORD } from './env';

/** Owner session straight against the API: used to restore state after specs that change settings. */
export async function ownerApi(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: `${API_URL}/api/v1/` });
  const res = await ctx.post('auth/staff/login', { data: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
  if (!res.ok()) throw new Error(`owner login failed: ${res.status()}`);
  return ctx;
}

async function json<T>(res: import('@playwright/test').APIResponse): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} -> ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function putSettings(patch: Record<string, unknown>) {
  const api = await ownerApi();
  try {
    await json(await api.put('admin/settings', { data: patch }));
  } finally {
    await api.dispose();
  }
}

export async function getAdmin<T>(path: string): Promise<T> {
  const api = await ownerApi();
  try {
    return await json<T>(await api.get(path));
  } finally {
    await api.dispose();
  }
}

export async function putHours(days: unknown) {
  const api = await ownerApi();
  try {
    await json(await api.put('admin/settings/hours', { data: days }));
  } finally {
    await api.dispose();
  }
}

export async function setProductAvailability(name: string, available: boolean) {
  const api = await ownerApi();
  try {
    const list = await json<{ id: string; name: string }[] | { items: { id: string; name: string }[] }>(await api.get('admin/products'));
    const items = Array.isArray(list) ? list : list.items;
    const p = items.find((x) => x.name === name)!;
    await json(await api.patch(`admin/products/${p.id}/availability`, { data: { available } }));
  } finally {
    await api.dispose();
  }
}

export async function setMargheritaLargePrice(priceCents: number) {
  const api = await ownerApi();
  try {
    const pricing = await json<{ sizes: { id: string; code: string }[]; products: { id: string; name: string; prices: { sizeId: string; priceCents: number }[] }[] }>(await api.get('admin/pricing'));
    const large = pricing.sizes.find((s) => s.code === 'L')!;
    const prod = pricing.products.find((p) => p.name === 'Margherita')!;
    const prices = prod.prices.map((p) => (p.sizeId === large.id ? { ...p, priceCents } : p));
    await json(await api.put('admin/pricing', { data: { products: [{ id: prod.id, name: prod.name, prices }] } }));
  } finally {
    await api.dispose();
  }
}

export async function setZoneFee(name: string, feeCents: number) {
  const api = await ownerApi();
  try {
    const zones = await json<Record<string, unknown>[]>(await api.get('admin/delivery-zones'));
    const zone = zones.find((z) => z.name === name)!;
    const { id, ...rest } = zone;
    await json(await api.put(`admin/delivery-zones/${String(id)}`, { data: { ...rest, feeCents } }));
  } finally {
    await api.dispose();
  }
}
