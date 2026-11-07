import { Body, Controller, Get, Headers, HttpCode, Logger, NotFoundException, Param, Post, Query, RawBodyRequest, Redirect, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { zod } from '../common/zod.pipe';
import { env } from '../config/env';
import { PrismaService } from '../core/prisma.service';
import { PaymentsService } from './payments.service';
import { mpesaAmount } from './providers/mpesa.provider';

const mockBody = z.object({ success: z.boolean() });
const ACK = { ResultCode: 0, ResultDesc: 'Accepted' };

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

interface StkCallback {
  CheckoutRequestID?: string;
  ResultCode?: number | string;
  ResultDesc?: string;
  CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] };
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger('PaymentsController');

  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('mock/:paymentId/complete')
  @HttpCode(200)
  mockComplete(@Param('paymentId') id: string, @Body(zod(mockBody)) body: z.infer<typeof mockBody>) {
    return this.payments.mockComplete(id, body.success);
  }

  @Post('mpesa/callback/:secret')
  @HttpCode(200)
  async mpesaCallback(@Param('secret') secret: string, @Body() body: { Body?: { stkCallback?: StkCallback } }) {
    // Anything but the configured path secret looks like a route that does not exist and records nothing.
    if (!env.mpesa.callbackSecret || !sameSecret(secret, env.mpesa.callbackSecret)) {
      this.logger.warn('M-Pesa callback with a bad secret rejected');
      throw new NotFoundException();
    }
    try {
      const cb = body?.Body?.stkCallback;
      if (!cb?.CheckoutRequestID || env.paymentsMode !== 'live') return ACK;
      const payment = await this.prisma.payment.findUnique({ where: { providerRef: cb.CheckoutRequestID } });
      if (!payment) return ACK;
      const eventKey = `mpesa:${cb.CheckoutRequestID}:${cb.ResultCode}`;
      if (await this.prisma.paymentEvent.findUnique({ where: { eventKey } })) return ACK;

      const verified = await this.payments.mpesa.verify(payment);
      if (verified.outcome === 'PENDING') return ACK;
      const meta = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
      const paidKes = meta.Amount === undefined ? undefined : Number(meta.Amount);
      await this.payments.settle({
        paymentId: payment.id,
        provider: 'mpesa',
        eventKey,
        payload: body,
        outcome: verified.outcome,
        verified: true,
        amountCents: paidKes === undefined ? undefined : paidKes === mpesaAmount(payment.amountCents) ? payment.amountCents : paidKes * 100,
        currency: 'KES',
        reference: cb.CheckoutRequestID,
        receipt: meta.MpesaReceiptNumber === undefined ? undefined : String(meta.MpesaReceiptNumber),
        reason: cb.ResultDesc,
      });
    } catch (err) {
      this.logger.error(`M-Pesa callback failed: ${err}`);
    }
    return ACK;
  }

  @Post('paystack/webhook')
  @HttpCode(200)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
    @Body() body: { event?: string; data?: { reference?: string; id?: number } },
  ) {
    if (!this.payments.paystack.validSignature(req.rawBody, signature)) throw new UnauthorizedException('Invalid signature');
    const reference = body.data?.reference;
    if (!reference || !body.event?.startsWith('charge.')) return { received: true };
    const payment = await this.prisma.payment.findFirst({ where: { OR: [{ providerRef: reference }, { id: reference }] } });
    if (!payment) return { received: true };
    const v = await this.payments.paystack.verify(payment);
    if (v.outcome !== 'PENDING') {
      await this.payments.settle({
        paymentId: payment.id,
        provider: 'paystack',
        eventKey: `paystack:${body.event}:${body.data?.id ?? reference}`,
        payload: body,
        outcome: v.outcome,
        verified: true,
        amountCents: v.amountCents,
        currency: v.currency,
        reference: v.reference,
        receipt: v.receipt,
        reason: v.reason,
      });
    }
    return { received: true };
  }

  @Get('paystack/return')
  @Redirect()
  async paystackReturn(@Query('reference') reference?: string) {
    const payment = reference ? await this.prisma.payment.findFirst({ where: { OR: [{ providerRef: reference }, { id: reference }] }, include: { order: true } }) : null;
    if (!payment) return { url: env.storefrontUrl };
    await this.payments.reconcile(payment, { force: true });
    return { url: `${env.storefrontUrl}/order/${payment.order.reference}` };
  }
}
