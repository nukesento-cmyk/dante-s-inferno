import type { StaffRole } from '@prisma/client';
import type { Request } from 'express';

export const STAFF_COOKIE = 'dp_staff';
export const CUSTOMER_COOKIE = 'dp_customer';

export interface StaffPrincipal {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export interface CustomerPrincipal {
  userId: string;
  customerId: string;
  name: string;
  email: string;
  phone: string;
}

export type AuthedRequest = Request & { staff?: StaffPrincipal; customer?: CustomerPrincipal | null };
