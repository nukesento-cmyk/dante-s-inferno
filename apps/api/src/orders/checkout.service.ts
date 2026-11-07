import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckoutInput } from '@dantes/shared';
import type { PaymentMethod, Prisma } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { LinePricingService } from '../cart/line-pricing.service';
import type { CustomerPrincipal } from '../auth/auth.types';
import { applyTransition } from '../common/order-transition';
import { OrderEventsService } from '../core/order-events.service';
import { PrismaService } from '../core/prisma.service';
import { SettingsService } from '../core/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { generateReference, orderPublicInclude, toOrderPublic } from './order.mapper';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly carts: CartService,
    private readonly pricing: LinePricingService,
    private readonly payments: PaymentsService,
    private readonly events: OrderEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  async checkout(input: CheckoutInput, token: string | undefined, customer: CustomerPrincipal | null) {
    const { state, settings } = await this.settings.ordering();
    if (!state.open) {
      const message = state.reason === 'PAUSED' ? settings.pauseMessage || 'Online ordering is paused right now' : 'We are not taking orders right now';
      throw new ConflictException({ message, code: 'ORDERING_CLOSED' });
    }
    const delivery = input.fulfilment === 'DELIVERY';
    if (delivery ? !settings.deliveryEnabled : !settings.collectionEnabled) {
      throw new ConflictException({ message: `${delivery ? 'Delivery' : 'Collection'} is not available right now`, code: 'FULFILMENT_DISABLED' });
    }

    const cart = await this.carts.find(token, customer?.userId);
    const resolved = await this.carts.resolveCart(cart);
    if (!resolved.length) throw new BadRequestException({ message: 'Your cart is empty', code: 'EMPTY_CART' });
    const bad = resolved.find((r) => !r.line.ok);
    if (bad && !bad.line.ok) throw new BadRequestException({ message: bad.line.reason, code: 'ITEMS_UNAVAILABLE' });

    const zone = delivery && input.deliveryZoneId ? await this.prisma.deliveryZone.findUnique({ where: { id: input.deliveryZoneId } }) : null;
    const lines = resolved.map((r) => r.line).filter((l) => l.ok);
    const price = await this.pricing.priceOrder(lines.map((l) => l.lineTotalCents), input.fulfilment, zone);
    if (price.problems.includes('ZONE_REQUIRED')) throw new BadRequestException({ message: 'Choose a valid delivery area', code: 'ZONE_REQUIRED' });
    if (price.problems.includes('ZONE_INACTIVE')) throw new BadRequestException({ message: 'We do not deliver to that area right now', code: 'ZONE_INACTIVE' });
    if (price.problems.includes('BELOW_MINIMUM')) {
      throw new BadRequestException({ message: `Minimum order for ${zone?.name} is KES ${(zone!.minOrderCents / 100).toLocaleString('en-KE')}`, code: 'BELOW_MINIMUM' });
    }

    const phone = input.customer.phone;
    const provider = this.payments.providerFor(input.paymentMethod);
    const { orderId, paymentId } = await this.prisma.$transaction(async (tx) => {
      const buyer = await this.upsertCustomer(tx, input, customer, phone);
      const order = await tx.order.create({
        data: {
          reference: await this.uniqueReference(tx),
          customerId: buyer.id,
          fulfilment: input.fulfilment,
          zoneId: delivery ? zone!.id : null,
          zoneName: delivery ? zone!.name : null,
          addressSnapshot: delivery ? (input.address as Prisma.InputJsonValue) : undefined,
          paymentMethod: input.paymentMethod,
          subtotalCents: price.subtotalCents,
          deliveryFeeCents: price.deliveryFeeCents,
          packagingFeeCents: price.packagingFeeCents,
          vatCents: price.vatCents,
          vatRateBps: settings.vatRateBps,
          pricesIncludeVat: settings.pricesIncludeVat,
          totalCents: price.totalCents,
          etaMinMinutes: delivery ? zone!.etaMinMinutes : null,
          etaMaxMinutes: delivery ? zone!.etaMaxMinutes : null,
          history: { create: { toStatus: 'PENDING_PAYMENT', note: 'Order placed' } },
          items: {
            create: resolved.map(({ item, line }) => {
              if (!line.ok) throw new Error('unreachable');
              const topping = (kind: string) => (i: { id: string; name: string; surchargeCents: number | null; group: { surchargeCents: number } }) => ({
                ingredientId: i.id,
                name: i.name,
                surchargeCents: kind === 'ADDED' ? (i.surchargeCents ?? i.group.surchargeCents) : 0,
                kind,
              });
              return {
                productId: item.productId,
                productName: line.productName,
                sizeName: line.sizeName,
                crustName: line.crustName,
                toppings: [...line.defaults.map(topping('DEFAULT')), ...line.added.map(topping('ADDED')), ...line.removed.map(topping('REMOVED'))],
                unitPriceCents: line.unitPriceCents,
                quantity: item.quantity,
                lineTotalCents: line.lineTotalCents,
                notes: item.notes,
              };
            }),
          },
        },
      });
      const payment = await tx.payment.create({
        data: { orderId: order.id, method: input.paymentMethod, provider: provider.name, amountCents: order.totalCents, phone: input.mpesaPhone ?? phone },
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return { orderId: order.id, paymentId: payment.id };
    });

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    this.events.emit('order.created', order);
    this.notifications.notify('ORDER_RECEIVED', order.id);
    const started = await this.payments.start(payment, order, {
      phone: input.paymentMethod === 'MPESA' ? (input.mpesaPhone ?? phone) : phone,
      email: input.customer.email ?? null,
    });
    return { order: await this.publicOrder(order.id), payment: started };
  }

  async retryPayment(reference: string, method: PaymentMethod, mpesaPhone?: string) {
    const order = await this.prisma.order.findUnique({ where: { reference }, include: { customer: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PAYMENT_FAILED') {
      throw new ConflictException({ message: 'This order cannot be paid for any more', code: 'NOT_PAYABLE' });
    }
    const provider = this.payments.providerFor(method);
    const paymentId = await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({ where: { orderId: order.id, status: { in: ['INITIATED', 'PENDING'] } }, data: { status: 'CANCELLED' } });
      if (order.status === 'PAYMENT_FAILED') await applyTransition(tx, order, 'PENDING_PAYMENT', { note: 'Payment retry' });
      if (order.paymentMethod !== method) await tx.order.update({ where: { id: order.id }, data: { paymentMethod: method } });
      const p = await tx.payment.create({
        data: { orderId: order.id, method, provider: provider.name, amountCents: order.totalCents, phone: mpesaPhone ?? order.customer.phone },
      });
      return p.id;
    });
    const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    this.events.emit('order.updated', fresh);
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const started = await this.payments.start(payment, fresh, { phone: mpesaPhone ?? order.customer.phone, email: order.customer.email });
    return { order: await this.publicOrder(order.id), payment: started };
  }

  async publicOrder(id: string) {
    return toOrderPublic(await this.prisma.order.findUniqueOrThrow({ where: { id }, include: orderPublicInclude }));
  }

  private async uniqueReference(tx: Prisma.TransactionClient) {
    for (let i = 0; i < 8; i++) {
      const reference = generateReference();
      if (!(await tx.order.findUnique({ where: { reference }, select: { id: true } }))) return reference;
    }
    throw new Error('Could not allocate an order reference');
  }

  private async upsertCustomer(tx: Prisma.TransactionClient, input: CheckoutInput, principal: CustomerPrincipal | null, phone: string) {
    const data = { name: input.customer.name, phone, email: input.customer.email ?? null };
    if (principal) return tx.customer.update({ where: { id: principal.customerId }, data: { ...data, email: data.email ?? undefined } });
    const existing = await tx.customer.findFirst({ where: { phone, userId: null } });
    if (existing) return tx.customer.update({ where: { id: existing.id }, data: { name: data.name, email: data.email ?? undefined } });
    return tx.customer.create({ data });
  }
}
