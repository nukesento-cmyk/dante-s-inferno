import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Order, Payment, PaymentMethod, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { applyTransition } from '../common/order-transition';
import { OrderEventsService } from '../core/order-events.service';
import { PrismaService } from '../core/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MockProvider } from './providers/mock.provider';
import { MpesaProvider } from './providers/mpesa.provider';
import { PaymentProvider } from './providers/payment-provider';
import { PaystackProvider } from './providers/paystack.provider';

export interface SettleInput {
  paymentId: string;
  provider: string;
  eventKey: string;
  payload: unknown;
  outcome: 'SUCCEEDED' | 'FAILED';
  /** True only after the provider confirmed the result server-to-server (or in mock mode). */
  verified: boolean;
  amountCents?: number;
  currency?: string;
  reference?: string;
  receipt?: string;
  reason?: string;
}

export type SettleResult = { status: 'applied' | 'duplicate' | 'rejected'; reason?: string };

export interface PaymentStart {
  id: string;
  method: PaymentMethod;
  status: Payment['status'];
  redirectUrl?: string;
  instructions?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  private readonly lastChecked = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OrderEventsService,
    private readonly notifications: NotificationsService,
    private readonly mock: MockProvider,
    readonly mpesa: MpesaProvider,
    readonly paystack: PaystackProvider,
  ) {}

  providerFor(method: PaymentMethod): PaymentProvider {
    if (env.paymentsMode === 'mock') return this.mock;
    return method === 'MPESA' ? this.mpesa : this.paystack;
  }

  /** Calls the provider for a freshly created Payment. Provider failures mark the payment FAILED instead of throwing. */
  async start(payment: Payment, order: Order, contact: { phone: string | null; email: string | null }): Promise<PaymentStart> {
    const provider = this.providerFor(payment.method);
    try {
      const result = await provider.initiate({ payment, order, ...contact });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PENDING', providerRef: result.providerRef, raw: (result.raw ?? undefined) as Prisma.InputJsonValue | undefined },
      });
      return { id: payment.id, method: payment.method, status: 'PENDING', redirectUrl: result.redirectUrl, instructions: result.instructions };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`initiate ${provider.name} failed for ${order.reference}: ${reason}`);
      await this.settle({
        paymentId: payment.id,
        provider: provider.name,
        eventKey: `${provider.name}:init-failed:${payment.id}`,
        payload: { error: reason },
        outcome: 'FAILED',
        verified: true,
        reason,
      });
      return { id: payment.id, method: payment.method, status: 'FAILED' };
    }
  }

  /** The only place that moves an order to PAID or PAYMENT_FAILED. Idempotent on eventKey. */
  async settle(input: SettleInput): Promise<SettleResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${input.paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } });
      if (!payment) throw new NotFoundException('Payment not found');

      const created = await tx.paymentEvent.createMany({
        data: [{ provider: input.provider, eventKey: input.eventKey, paymentId: payment.id, verified: input.verified, payload: (input.payload ?? {}) as Prisma.InputJsonValue }],
        skipDuplicates: true,
      });
      if (created.count === 0) return { status: 'duplicate' as const };
      const markProcessed = () => tx.paymentEvent.update({ where: { eventKey: input.eventKey }, data: { processedAt: new Date() } });

      if (input.outcome === 'SUCCEEDED') {
        const problem = this.successProblem(input, payment);
        if (problem) {
          this.logger.warn(`payment ${payment.id} success rejected: ${problem}`);
          return { status: 'rejected' as const, reason: problem };
        }
        if (payment.status === 'SUCCEEDED') {
          await markProcessed();
          return { status: 'duplicate' as const };
        }
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', receipt: input.receipt, completedAt: new Date(), failureReason: null } });
        await tx.payment.updateMany({
          where: { orderId: payment.orderId, id: { not: payment.id }, status: { in: ['INITIATED', 'PENDING'] } },
          data: { status: 'CANCELLED' },
        });
        if (payment.order.status === 'PENDING_PAYMENT' || payment.order.status === 'PAYMENT_FAILED') {
          await applyTransition(tx, payment.order, 'PAID', { note: `Paid via ${payment.method}`, data: { paidAt: new Date() } });
        }
        await markProcessed();
        return { status: 'applied' as const, order: payment.order, event: 'PAYMENT_CONFIRMED' as const };
      }

      if (payment.status !== 'INITIATED' && payment.status !== 'PENDING') {
        await markProcessed();
        return { status: 'duplicate' as const };
      }
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: input.reason ?? 'Payment failed', completedAt: new Date() } });
      const stillPayable = await tx.payment.count({
        where: { orderId: payment.orderId, id: { not: payment.id }, status: { in: ['INITIATED', 'PENDING', 'SUCCEEDED'] } },
      });
      if (payment.order.status === 'PENDING_PAYMENT' && !stillPayable) {
        await applyTransition(tx, payment.order, 'PAYMENT_FAILED', { note: input.reason ?? 'Payment failed' });
      }
      await markProcessed();
      return { status: 'applied' as const, order: payment.order, event: 'PAYMENT_FAILED' as const };
    });

    if (result.status === 'applied') {
      const order = await this.prisma.order.findUniqueOrThrow({ where: { id: result.order.id } });
      this.events.emit('order.updated', order);
      this.notifications.notify(result.event, order.id);
    }
    return result.status === 'rejected' ? { status: 'rejected', reason: result.reason } : { status: result.status };
  }

  private successProblem(input: SettleInput, payment: Payment & { order: Order }): string | null {
    if (!input.verified) return 'not verified with provider';
    if (input.amountCents !== undefined && input.amountCents !== payment.amountCents) return `amount mismatch (${input.amountCents} vs ${payment.amountCents})`;
    if (input.currency !== undefined && input.currency !== payment.currency) return `currency mismatch (${input.currency})`;
    if (input.reference !== undefined && input.reference !== payment.providerRef) return 'reference mismatch';
    return null;
  }

  async mockComplete(paymentId: string, success: boolean) {
    if (env.paymentsMode !== 'mock') throw new NotFoundException();
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.provider !== 'mock') throw new BadRequestException('Not a mock payment');
    const result = await this.settle({
      paymentId,
      provider: 'mock',
      eventKey: `mock:${paymentId}:${success ? 'success' : 'failure'}`,
      payload: { success },
      outcome: success ? 'SUCCEEDED' : 'FAILED',
      verified: true,
      amountCents: payment.amountCents,
      currency: payment.currency,
      reference: payment.providerRef ?? undefined,
      receipt: success ? `MOCK${paymentId.slice(-8).toUpperCase()}` : undefined,
      reason: success ? undefined : 'Payment declined (mock)',
    });
    const fresh = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
    return { ...result, paymentStatus: fresh.status, orderStatus: fresh.order.status };
  }

  /** Re-checks a pending payment with the provider (used on return pages and status polling). */
  async reconcile(payment: Payment, opts: { force?: boolean } = {}) {
    if (env.paymentsMode === 'mock' || !['INITIATED', 'PENDING'].includes(payment.status)) return;
    const last = this.lastChecked.get(payment.id) ?? payment.createdAt.getTime() + 10_000;
    if (!opts.force && Date.now() - last < 10_000) return;
    this.lastChecked.set(payment.id, Date.now());
    const provider = this.providerFor(payment.method);
    const v = await provider.verify(payment).catch((err) => {
      this.logger.warn(`verify failed for ${payment.id}: ${err}`);
      return null;
    });
    if (!v || v.outcome === 'PENDING') return;
    await this.settle({
      paymentId: payment.id,
      provider: provider.name,
      eventKey: `${provider.name}:verify:${payment.id}:${v.outcome}`,
      payload: v.raw ?? v,
      outcome: v.outcome,
      verified: true,
      amountCents: v.amountCents,
      currency: v.currency,
      reference: v.reference,
      receipt: v.receipt,
      reason: v.reason,
    });
  }
}
