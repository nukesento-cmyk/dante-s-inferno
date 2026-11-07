// Keep in sync with apps/api/prisma/schema.prisma enums.
export const STAFF_ROLES = ['OWNER', 'MANAGER', 'KITCHEN', 'ORDER_STAFF'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_FAILED',
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed staff-driven transitions. Payment transitions are made by the payments module only. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PAYMENT_FAILED: ['CANCELLED'],
  PAID: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'OUT_FOR_DELIVERY'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const FULFILMENT_TYPES = ['DELIVERY', 'COLLECTION'] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

export const PAYMENT_METHODS = ['MPESA', 'CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['SMS', 'EMAIL', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_AUDIENCES = ['CUSTOMER', 'STAFF'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_EVENTS = [
  'ORDER_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'ORDER_ACCEPTED',
  'OUT_FOR_DELIVERY',
  'READY_FOR_COLLECTION',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const TEMPLATE_PLACEHOLDERS = [
  'customerName',
  'orderReference',
  'total',
  'restaurantName',
  'restaurantPhone',
  'estimatedTime',
  'orderStatusUrl',
] as const;
