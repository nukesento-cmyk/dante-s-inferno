import { Injectable, Logger } from '@nestjs/common';
import { formatKes, toMpesaMsisdn } from '@dantes/shared';
import type { Payment } from '@prisma/client';
import { env } from '../../config/env';
import type { InitiateContext, InitiateResult, PaymentProvider, VerifyResult } from './payment-provider';

const timestamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

/** Daraja only handles whole shillings. */
export const mpesaAmount = (cents: number) => Math.ceil(cents / 100);

@Injectable()
export class MpesaProvider implements PaymentProvider {
  readonly name = 'mpesa' as const;
  private readonly logger = new Logger('MpesaProvider');
  private token?: { value: string; expires: number };

  private get baseUrl() {
    return env.mpesa.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  }

  private async accessToken() {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    const { key, secret } = env.mpesa;
    if (!key || !secret) throw new Error('M-Pesa credentials are not configured');
    const res = await fetch(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
    });
    if (!res.ok) throw new Error(`Daraja auth failed (${res.status})`);
    const data = (await res.json()) as { access_token: string; expires_in: string };
    this.token = { value: data.access_token, expires: Date.now() + (Number(data.expires_in) - 60) * 1000 };
    return this.token.value;
  }

  private password(ts: string) {
    const { shortcode, passkey } = env.mpesa;
    return Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { errorMessage?: string };
    if (!res.ok) throw new Error(`Daraja ${path} failed (${res.status}): ${data.errorMessage ?? 'unknown error'}`);
    return data;
  }

  async initiate({ payment, order, phone }: InitiateContext): Promise<InitiateResult> {
    if (!phone) throw new Error('An M-Pesa phone number is required');
    const ts = timestamp();
    const { shortcode, callbackSecret } = env.mpesa;
    const data = await this.post<{ CheckoutRequestID: string; ResponseCode: string; ResponseDescription: string }>('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: shortcode,
      Password: this.password(ts),
      Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline',
      Amount: mpesaAmount(payment.amountCents),
      PartyA: toMpesaMsisdn(phone),
      PartyB: shortcode,
      PhoneNumber: toMpesaMsisdn(phone),
      CallBackURL: `${env.publicApiUrl}/api/v1/payments/mpesa/callback/${callbackSecret}`,
      AccountReference: order.reference,
      TransactionDesc: `Order ${order.reference}`,
    });
    if (data.ResponseCode !== '0') throw new Error(`STK push rejected: ${data.ResponseDescription}`);
    this.logger.log(`STK push sent for ${order.reference}`);
    return {
      providerRef: data.CheckoutRequestID,
      instructions: `Check your phone (${phone}) and enter your M-Pesa PIN to pay ${formatKes(payment.amountCents)}.`,
      raw: data,
    };
  }

  /** STK Query: the authoritative state of a push request. */
  async verify(payment: Payment): Promise<VerifyResult> {
    if (!payment.providerRef) return { outcome: 'PENDING' };
    const ts = timestamp();
    const data = await this.post<{ ResultCode?: string | number; ResultDesc?: string; errorMessage?: string }>('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: env.mpesa.shortcode,
      Password: this.password(ts),
      Timestamp: ts,
      CheckoutRequestID: payment.providerRef,
    });
    if (data.ResultCode === undefined) return { outcome: 'PENDING', raw: data };
    if (String(data.ResultCode) === '0') return { outcome: 'SUCCEEDED', reference: payment.providerRef, raw: data };
    return { outcome: 'FAILED', reason: data.ResultDesc ?? 'Payment was not completed', reference: payment.providerRef, raw: data };
  }
}
