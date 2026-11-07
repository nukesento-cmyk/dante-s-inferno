import type { Order, Payment } from '@prisma/client';

export interface InitiateContext {
  payment: Payment;
  order: Order;
  phone: string | null;
  email: string | null;
}

export interface InitiateResult {
  providerRef: string;
  redirectUrl?: string;
  instructions?: string;
  raw?: unknown;
}

export interface VerifyResult {
  outcome: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  amountCents?: number;
  currency?: string;
  reference?: string;
  receipt?: string;
  reason?: string;
  raw?: unknown;
}

export interface PaymentProvider {
  readonly name: 'mpesa' | 'paystack' | 'mock';
  initiate(ctx: InitiateContext): Promise<InitiateResult>;
  /** Server-to-server confirmation of the payment's true state. */
  verify(payment: Payment): Promise<VerifyResult>;
}
