import { z } from 'zod';
import {
  FULFILMENT_TYPES,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  STAFF_ROLES,
} from './enums';
import { normalizeKenyanPhone } from './phone';

export const centsSchema = z.number().int().nonnegative();
export const kenyanPhoneSchema = z
  .string()
  .transform((v, ctx) => {
    const n = normalizeKenyanPhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a Kenyan number like 0712 345 678' });
      return z.NEVER;
    }
    return n;
  });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
const optionalEmail = z.string().email().optional().or(z.literal('').transform(() => undefined));

// ---------- Cart & checkout (public) ----------
export const cartItemInputSchema = z.object({
  productId: z.string(),
  sizeId: z.string(),
  crustId: z.string(),
  quantity: z.number().int().min(1).max(20),
  /** Extra toppings beyond the product defaults (each charged its surcharge). */
  addIngredientIds: z.array(z.string()).max(12).default([]),
  /** Default toppings the customer removed (free, no refund). */
  removeIngredientIds: z.array(z.string()).max(12).default([]),
  notes: z.string().max(200).optional(),
});
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const cartItemUpdateSchema = cartItemInputSchema.partial().omit({ productId: true });

export const checkoutInputSchema = z
  .object({
    customer: z.object({
      name: z.string().min(2).max(80),
      phone: kenyanPhoneSchema,
      email: optionalEmail,
    }),
    fulfilment: z.enum(FULFILMENT_TYPES),
    deliveryZoneId: z.string().optional(),
    address: z
      .object({
        line1: z.string().min(3).max(160),
        landmark: z.string().max(160).optional(),
        notes: z.string().max(300).optional(),
      })
      .optional(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    /** Phone that receives the STK push; defaults to customer.phone */
    mpesaPhone: kenyanPhoneSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.fulfilment === 'DELIVERY') {
      if (!v.deliveryZoneId) ctx.addIssue({ code: 'custom', path: ['deliveryZoneId'], message: 'Choose a delivery area' });
      if (!v.address) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter a delivery address' });
    }
  });
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const guestOrderLookupSchema = z.object({ reference: z.string(), phone: kenyanPhoneSchema });

// ---------- Auth ----------
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const customerRegisterSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: kenyanPhoneSchema,
  password: z.string().min(8).max(128),
});
export const staffUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(STAFF_ROLES),
  password: z.string().min(8).optional(),
  active: z.boolean().default(true),
});

// ---------- Admin: catalogue ----------
export const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().max(600).default(''),
  categoryId: z.string(),
  imageUrl: z.string().nullable().optional(),
  available: z.boolean().default(true),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  maxExtraToppings: z.number().int().min(0).max(12).nullable().optional(),
  /** price per size */
  prices: z.array(z.object({ sizeId: z.string(), priceCents: centsSchema })),
  /** toppings that come on the pizza by default */
  defaultIngredientIds: z.array(z.string()).default([]),
  /** toppings the customer may add as extras */
  extraIngredientIds: z.array(z.string()).default([]),
});

export const sizeSchema = z.object({
  code: z.string().min(1).max(4),
  name: z.string().min(2),
  inches: z.number().int().min(6).max(24),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const crustSchema = z.object({
  name: z.string().min(2),
  description: z.string().default(''),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  adjustments: z.array(z.object({ sizeId: z.string(), adjustmentCents: centsSchema })),
});

export const toppingGroupSchema = z.object({
  name: z.string().min(2),
  surchargeCents: centsSchema,
  sortOrder: z.number().int().default(0),
});

export const ingredientSchema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().default(''),
  groupId: z.string(),
  /** null = use the group surcharge */
  surchargeCents: centsSchema.nullable().optional(),
  available: z.boolean().default(true),
  /** key used by the 3D customizer to pick a model */
  modelKey: z.string().default(''),
  color: z.string().default('#cc3b1f'),
});

export const deliveryZoneSchema = z.object({
  name: z.string().min(2),
  description: z.string().default(''),
  feeCents: centsSchema,
  minOrderCents: centsSchema.default(0),
  freeDeliveryFromCents: centsSchema.nullable().default(null),
  etaMinMinutes: z.number().int().min(5),
  etaMaxMinutes: z.number().int().min(5),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// ---------- Admin: orders ----------
export const orderStatusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().max(300).optional(),
});

// ---------- Admin: settings ----------
export const restaurantSettingsSchema = z.object({
  name: z.string().min(2),
  phone: kenyanPhoneSchema,
  whatsappPhone: kenyanPhoneSchema.nullable(),
  orderLinePhone: kenyanPhoneSchema.nullable(),
  email: z.string().email(),
  address: z.string().min(3),
  mapUrl: z.string().url().nullable(),
  vatRateBps: z.number().int().min(0).max(5000),
  pricesIncludeVat: z.boolean(),
  packagingFeeCents: centsSchema,
  deliveryEnabled: z.boolean(),
  collectionEnabled: z.boolean(),
  orderingPaused: z.boolean(),
  pauseMessage: z.string().max(200).default(''),
  lastOrderMinutesBeforeClose: z.number().int().min(0).max(180),
  scheduledOrderingEnabled: z.boolean(),
  defaultMaxExtraToppings: z.number().int().min(0).max(12),
  staffAlertPhones: z.array(kenyanPhoneSchema).max(10),
  staffAlertEmails: z.array(z.string().email()).max(10),
});
export type RestaurantSettingsInput = z.infer<typeof restaurantSettingsSchema>;

export const openingHoursSchema = z
  .array(
    z.object({ dayOfWeek: z.number().int().min(0).max(6), openTime: hhmm, closeTime: hhmm, closed: z.boolean() }),
  )
  .length(7)
  .superRefine((days, ctx) => {
    days.forEach((d, i) => {
      if (!d.closed && d.closeTime <= d.openTime)
        ctx.addIssue({ code: 'custom', path: [i, 'closeTime'], message: 'Closing time must be after opening time' });
    });
  });

export const specialClosureSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(2),
  closed: z.boolean(),
  openTime: hhmm.nullable(),
  closeTime: hhmm.nullable(),
});

export const notificationSettingSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  event: z.enum(NOTIFICATION_EVENTS),
  audience: z.enum(NOTIFICATION_AUDIENCES),
  enabled: z.boolean(),
});
export const notificationChannelToggleSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  enabled: z.boolean(),
});
export const notificationTemplateSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  event: z.enum(NOTIFICATION_EVENTS),
  audience: z.enum(NOTIFICATION_AUDIENCES),
  subject: z.string().max(150).nullable(),
  body: z.string().min(1).max(1000),
});
export const testNotificationSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  recipient: z.string().min(3),
});

/** Render "{customerName}" style placeholders; unknown placeholders are left as-is. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}
