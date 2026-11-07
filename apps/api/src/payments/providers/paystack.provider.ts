import { Injectable } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
import type { InitiateContext, InitiateResult, PaymentProvider, VerifyResult } from './payment-provider';

const BASE = 'https://api.paystack.co';

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack' as const;

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    if (!env.paystackSecret) throw new Error('Paystack is not configured');
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.paystackSecret}`, 'Content-Type': 'application/json' },
    });
    const data = (await res.json().catch(() => ({}))) as T & { status?: boolean; message?: string };
    if (!res.ok || data.status === false) throw new Error(`Paystack ${path} failed (${res.status}): ${data.message ?? 'unknown error'}`);
    return data;
  }

  validSignature(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature || !env.paystackSecret) return false;
    const expected = createHmac('sha512', env.paystackSecret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async initiate({ payment, order, email, phone }: InitiateContext): Promise<InitiateResult> {
    const data = await this.call<{ data: { authorization_url: string; reference: string } }>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: email ?? `${(phone ?? order.reference).replace(/\D/g, '')}@guest.dantespizza.co.ke`,
        amount: payment.amountCents,
        currency: 'KES',
        reference: payment.id,
        callback_url: `${env.publicApiUrl}/api/v1/payments/paystack/return`,
        metadata: { orderReference: order.reference },
      }),
    });
    return { providerRef: data.data.reference, redirectUrl: data.data.authorization_url, raw: data };
  }

  async verify(payment: Payment): Promise<VerifyResult> {
    const { data } = await this.call<{ data: { status: string; amount: number; currency: string; reference: string; id: number; gateway_response?: string } }>(
      `/transaction/verify/${encodeURIComponent(payment.providerRef ?? payment.id)}`,
    );
    const base = { amountCents: data.amount, currency: data.currency, reference: data.reference, receipt: String(data.id), raw: data };
    if (data.status === 'success') return { outcome: 'SUCCEEDED', ...base };
    if (data.status === 'failed' || data.status === 'reversed') {
      return { outcome: 'FAILED', reason: data.gateway_response ?? data.status, ...base };
    }
    return { outcome: 'PENDING', ...base };
  }
}
