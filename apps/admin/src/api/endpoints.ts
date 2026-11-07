import { api } from './client';
import type * as T from './types';
import type { NotificationChannel, NotificationEvent, NotificationAudience, OrderStatus } from '@dantes/shared';

type Q = Record<string, string | number | boolean | undefined | null>;

export const authApi = {
  login: (email: string, password: string) => api.post<T.Me | { user: T.Me }>('/auth/staff/login', { email, password }),
  logout: () => api.post<void>('/auth/staff/logout'),
  me: () => api.get<T.Me>('/auth/staff/me'),
};

export const dashboardApi = {
  overview: (q: Q) => api.get<T.Overview>('/admin/overview', q),
};

export const ordersApi = {
  list: (q: Q) => api.get<T.Paginated<T.OrderSummary> | T.OrderSummary[]>('/admin/orders', q),
  get: (id: string) => api.get<T.OrderDetail>(`/admin/orders/${id}`),
  setStatus: (id: string, status: OrderStatus, note?: string) =>
    api.patch<T.OrderDetail>(`/admin/orders/${id}/status`, { status, note: note || undefined }),
  streamUrl: '/api/v1/admin/orders/stream',
};

export const productsApi = {
  list: () => api.get<T.Product[] | T.Paginated<T.Product>>('/admin/products'),
  get: (id: string) => api.get<T.Product>(`/admin/products/${id}`),
  create: (b: unknown) => api.post<T.Product>('/admin/products', b),
  update: (id: string, b: unknown) => api.put<T.Product>(`/admin/products/${id}`, b),
  archive: (id: string) => api.del<void>(`/admin/products/${id}`),
  setAvailability: (id: string, available: boolean) => api.patch<T.Product>(`/admin/products/${id}/availability`, { available }),
  reorder: (ids: string[]) => api.post<void>('/admin/products/reorder', { ids }),
  uploadImage: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ url: string }>('/admin/uploads/image', fd);
  },
};

function crud<Row>(base: string) {
  return {
    list: () => api.get<Row[] | T.Paginated<Row>>(base),
    create: (b: unknown) => api.post<Row>(base, b),
    update: (id: string, b: unknown) => api.put<Row>(`${base}/${id}`, b),
    remove: (id: string) => api.del<void>(`${base}/${id}`),
    reorder: (ids: string[]) => api.post<void>(`${base}/reorder`, { ids }),
  };
}
export const categoriesApi = crud<T.Category>('/admin/categories');
export const ingredientsApi = crud<T.Ingredient>('/admin/ingredients');
export const toppingGroupsApi = crud<T.ToppingGroup>('/admin/topping-groups');
export const sizesApi = crud<T.Size>('/admin/sizes');
export const crustsApi = crud<T.Crust>('/admin/crusts');
export const zonesApi = crud<T.DeliveryZone>('/admin/delivery-zones');

export const pricingApi = {
  get: () => api.get<T.PricingPayload>('/admin/pricing'),
  put: (b: unknown) => api.put<T.PricingPayload>('/admin/pricing', b),
};

export const paymentsApi = {
  list: (q: Q) => api.get<T.Paginated<T.PaymentRow> | T.PaymentRow[]>('/admin/payments', q),
  get: (id: string) => api.get<T.PaymentDetail>(`/admin/payments/${id}`),
  reconciliation: (date: string) => api.get<T.Reconciliation>('/admin/payments/reconciliation', { date }),
};

export const customersApi = {
  list: (q: Q) => api.get<T.Paginated<T.Customer> | T.Customer[]>('/admin/customers', q),
  get: (id: string) => api.get<T.CustomerDetail>(`/admin/customers/${id}`),
};

export const reportsApi = {
  sales: (q: Q) => api.get<T.SalesRow[]>('/admin/reports/sales', q),
  products: (q: Q) => api.get<T.ProductReportRow[]>('/admin/reports/products', q),
  csvUrl: (from: string, to: string) => `/api/v1/admin/reports/export.csv?from=${from}&to=${to}`,
};

export const staffApi = {
  list: () => api.get<T.StaffUser[] | T.Paginated<T.StaffUser>>('/admin/staff'),
  create: (b: unknown) => api.post<T.StaffUser>('/admin/staff', b),
  update: (id: string, b: unknown) => api.put<T.StaffUser>(`/admin/staff/${id}`, b),
  deactivate: (id: string) => api.post<void>(`/admin/staff/${id}/deactivate`),
};

export const auditApi = {
  list: (q: Q) => api.get<T.Paginated<T.AuditEntry> | T.AuditEntry[]>('/admin/audit', q),
};

export const settingsApi = {
  get: () => api.get<T.RestaurantSettings>('/admin/settings'),
  put: (b: unknown) => api.put<T.RestaurantSettings>('/admin/settings', b),
  hours: () => api.get<T.HoursDay[]>('/admin/settings/hours'),
  putHours: (b: unknown) => api.put<T.HoursDay[]>('/admin/settings/hours', b),
  closures: () => api.get<T.Closure[]>('/admin/settings/closures'),
  addClosure: (b: unknown) => api.post<T.Closure>('/admin/settings/closures', b),
  removeClosure: (id: string) => api.del<void>(`/admin/settings/closures/${id}`),
  notifications: () => api.get<T.NotificationsPayload>('/admin/settings/notifications'),
  putChannels: (channels: { channel: NotificationChannel; enabled: boolean }[]) =>
    api.put<void>('/admin/settings/notifications/channels', channels),
  putNotificationSettings: (b: unknown[]) => api.put<void>('/admin/settings/notifications/settings', b),
  putTemplate: (channel: NotificationChannel, event: NotificationEvent, audience: NotificationAudience, b: { subject: string | null; body: string }) =>
    api.put<void>(`/admin/settings/notifications/templates/${channel}/${event}/${audience}`, { channel, event, audience, ...b }),
  testNotification: (channel: NotificationChannel, recipient: string) =>
    api.post<{ ok?: boolean; message?: string }>('/admin/settings/notifications/test', { channel, recipient }),
  preview: (body: string) => api.post<{ rendered: string }>('/admin/settings/notifications/preview', { body }),
};
