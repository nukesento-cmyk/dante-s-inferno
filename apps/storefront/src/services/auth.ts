import { ApiError, api } from '../lib/api';
import type { Customer } from './types';

export async function getMe(): Promise<Customer | null> {
  try {
    return await api<Customer>('/auth/customer/me');
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}
export const login = (b: { email: string; password: string }) => api<Customer>('/auth/customer/login', { method: 'POST', body: b });
export const register = (b: { name: string; email: string; phone: string; password: string }) =>
  api<Customer>('/auth/customer/register', { method: 'POST', body: b });
export const logout = () => api<void>('/auth/customer/logout', { method: 'POST' });
export const forgotPassword = (email: string) => api<unknown>('/auth/customer/forgot-password', { method: 'POST', body: { email } });
export const resetPassword = (b: { token: string; password: string }) => api<unknown>('/auth/customer/reset-password', { method: 'POST', body: b });
