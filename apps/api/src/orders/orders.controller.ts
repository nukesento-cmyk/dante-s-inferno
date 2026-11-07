import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { checkoutInputSchema, kenyanPhoneSchema, normalizeKenyanPhone, PAYMENT_METHODS } from '@dantes/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import type { AuthedRequest } from '../auth/auth.types';
import { RequireCustomer } from '../auth/guards';
import { zod } from '../common/zod.pipe';
import { PrismaService } from '../core/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutService } from './checkout.service';
import { orderPublicInclude, toOrderPublic } from './order.mapper';

const retrySchema = z.object({ method: z.enum(PAYMENT_METHODS), mpesaPhone: kenyanPhoneSchema.optional() });

@Controller()
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutService: CheckoutService,
    private readonly payments: PaymentsService,
    private readonly auth: AuthService,
  ) {}

  @Post('checkout')
  async checkout(@Req() req: Request, @Body(zod(checkoutInputSchema)) body: z.infer<typeof checkoutInputSchema>, @Headers('x-cart-token') token?: string) {
    return this.checkoutService.checkout(body, token, await this.auth.customerFromRequest(req));
  }

  @Get('orders/:reference')
  async lookup(@Req() req: Request, @Param('reference') reference: string, @Query('phone') phone?: string) {
    const order = await this.prisma.order.findUnique({ where: { reference: reference.toUpperCase() }, include: { ...orderPublicInclude, customer: true } });
    if (!order) throw new NotFoundException('Order not found');
    const owner = await this.auth.customerFromRequest(req);
    const phoneMatches = phone !== undefined && normalizeKenyanPhone(phone) === order.customer.phone;
    if (!phoneMatches && !(owner && order.customer.userId === owner.userId)) throw new NotFoundException('Order not found');
    return toOrderPublic(order);
  }

  @Get('orders/:reference/payment-status')
  async paymentStatus(@Param('reference') reference: string) {
    const order = await this.prisma.order.findUnique({ where: { reference: reference.toUpperCase() }, include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!order) throw new NotFoundException('Order not found');
    const latest = order.payments[0];
    if (latest) await this.payments.reconcile(latest);
    const fresh = latest ? await this.prisma.payment.findUniqueOrThrow({ where: { id: latest.id }, include: { order: true } }) : null;
    return { status: fresh?.status ?? null, orderStatus: fresh?.order.status ?? order.status, paymentId: fresh?.id ?? null };
  }

  @Post('orders/:reference/retry-payment')
  @HttpCode(200)
  retry(@Param('reference') reference: string, @Body(zod(retrySchema)) body: z.infer<typeof retrySchema>) {
    return this.checkoutService.retryPayment(reference.toUpperCase(), body.method, body.mpesaPhone);
  }

  @Get('account/orders')
  @RequireCustomer()
  async accountOrders(@Req() req: AuthedRequest) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: req.customer!.customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: orderPublicInclude,
    });
    return orders.map(toOrderPublic);
  }
}
