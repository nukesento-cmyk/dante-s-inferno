import { api } from '../lib/api';
import type { DeliveryZone, MenuData, ProductPublic, Settings } from './types';

export const getSettings = () => api<Settings>('/public/settings');
export const getMenu = () => api<MenuData>('/public/menu');
export const getProduct = (slug: string) => api<ProductPublic>(`/public/products/${encodeURIComponent(slug)}`);
export const getDeliveryZones = () => api<DeliveryZone[]>('/public/delivery-zones');
