import type { CheckoutInput, PaymentMethod } from '@dantes/shared';
import { api } from '../lib/api';
import { useCartStore } from '../store/cartStore';
import type { CheckoutResult, OrderPublic, PaymentInfo, PaymentStatusResult } from './types';

export function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  const token = useCartStore.getState().token ?? '';
  return api<CheckoutResult>('/checkout', { method: 'POST', body: input, headers: { 'X-Cart-Token': token } });
}

export const getOrder = (reference: string, phone?: string | null) =>
  api<OrderPublic>(`/orders/${encodeURIComponent(reference)}`, { query: { phone: phone ?? undefined } });

export const getPaymentStatus = (reference: string) =>
  api<PaymentStatusResult>(`/orders/${encodeURIComponent(reference)}/payment-status`);

export const retryPayment = (reference: string, body: { method: PaymentMethod; mpesaPhone?: string }) =>
  api<{ payment?: PaymentInfo } & Partial<PaymentInfo>>(`/orders/${encodeURIComponent(reference)}/retry-payment`, { method: 'POST', body });

export const mockCompletePayment = (paymentId: string, success: boolean) =>
  api<unknown>(`/payments/mock/${encodeURIComponent(paymentId)}/complete`, { method: 'POST', body: { success } });

export async function getAccountOrders(): Promise<OrderPublic[]> {
  const r = await api<OrderPublic[] | { items: OrderPublic[] }>('/account/orders');
  return Array.isArray(r) ? r : r.items;
}
