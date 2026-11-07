import type { Order, OrderItem, OrderStatusHistory, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

export const orderPublicInclude = {
  items: { orderBy: { id: 'asc' } },
  history: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderRow = Order & { items: OrderItem[]; history: OrderStatusHistory[] };

export function toOrderPublic(o: OrderRow) {
  return {
    reference: o.reference,
    status: o.status,
    fulfilment: o.fulfilment,
    zoneName: o.zoneName,
    address: o.addressSnapshot,
    items: o.items.map((i) => ({
      productName: i.productName,
      sizeName: i.sizeName,
      crustName: i.crustName,
      toppings: i.toppings,
      notes: i.notes,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      lineTotalCents: i.lineTotalCents,
    })),
    subtotalCents: o.subtotalCents,
    deliveryFeeCents: o.deliveryFeeCents,
    packagingFeeCents: o.packagingFeeCents,
    vatCents: o.vatCents,
    totalCents: o.totalCents,
    paymentMethod: o.paymentMethod,
    etaMinMinutes: o.etaMinMinutes,
    etaMaxMinutes: o.etaMaxMinutes,
    createdAt: o.createdAt,
    history: o.history.map((h) => ({ toStatus: h.toStatus, createdAt: h.createdAt })),
  };
}

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateReference(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `DP-${code}`;
}
