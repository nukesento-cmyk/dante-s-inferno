import type {
  FulfilmentType,
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  StaffRole,
} from '@dantes/shared';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export interface Overview {
  ordersToday: number;
  revenueTodayCents: number;
  activeOrders: number;
  pendingPayments: number;
  avgOrderValueCents: number;
  topProducts: { name: string; quantity: number; revenueCents: number }[];
  revenueByDay: { date: string; revenueCents: number; orders: number }[];
}

export interface OrderSummary {
  id: string;
  reference: string;
  status: OrderStatus;
  fulfilment: FulfilmentType;
  totalCents: number;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  customer?: { name?: string; phone?: string; email?: string | null };
  paymentStatus?: PaymentStatus | null;
  paymentMethod?: PaymentMethod | null;
  zoneName?: string | null;
  itemCount?: number;
}

export interface OrderItem {
  productName: string;
  sizeName?: string;
  crustName?: string;
  /** topping snapshot: strings or {name, kind: 'added'|'removed'} */
  toppings?: (string | { name: string; kind?: string; surchargeCents?: number })[];
  addedToppings?: { name: string; surchargeCents?: number }[];
  removedToppings?: { name: string }[];
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  notes?: string | null;
}

export interface OrderDetail extends OrderSummary {
  items: OrderItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  packagingFeeCents: number;
  vatCents: number;
  address?: { line1?: string; landmark?: string | null; notes?: string | null } | null;
  payments?: PaymentRow[];
  history?: { fromStatus?: OrderStatus | null; toStatus: OrderStatus; note?: string | null; createdAt: string; actorName?: string | null }[];
  notifications?: { id?: string; channel: NotificationChannel; event: string; recipient?: string; status: string; createdAt: string; error?: string | null }[];
}

export interface PaymentRow {
  id: string;
  orderId?: string;
  orderReference?: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  providerRef?: string | null;
  createdAt: string;
  customerName?: string;
}
export interface PaymentEvent {
  id: string;
  type?: string;
  eventKey?: string;
  createdAt: string;
  payload?: unknown;
}
export interface PaymentDetail extends PaymentRow {
  events?: PaymentEvent[];
}
export interface Reconciliation {
  byMethod: { method: PaymentMethod; count: number; amountCents: number }[];
  unmatched: PaymentRow[];
  paidOrdersWithoutPayment: { id?: string; reference?: string; totalCents?: number }[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
}
export interface Size {
  id: string;
  code: string;
  name: string;
  inches: number;
  sortOrder: number;
  active: boolean;
}
export interface Crust {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  active: boolean;
  adjustments: { sizeId: string; adjustmentCents: number }[];
}
export interface ToppingGroup {
  id: string;
  name: string;
  surchargeCents: number;
  sortOrder: number;
}
export interface Ingredient {
  id: string;
  name: string;
  slug: string;
  description: string;
  groupId: string;
  surchargeCents: number | null;
  available: boolean;
  modelKey: string;
  color: string;
}
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  imageUrl?: string | null;
  available: boolean;
  featured: boolean;
  archived?: boolean;
  sortOrder: number;
  maxExtraToppings?: number | null;
  prices: { sizeId: string; priceCents: number }[];
  defaultIngredientIds: string[];
  extraIngredientIds: string[];
}
export interface DeliveryZone {
  id: string;
  name: string;
  description: string;
  feeCents: number;
  minOrderCents: number;
  freeDeliveryFromCents: number | null;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  active: boolean;
  sortOrder: number;
}

export interface PricingPayload {
  sizes: { id: string; code?: string; name: string; inches?: number }[];
  products: { id: string; name: string; prices: { sizeId: string; priceCents: number }[] }[];
  crusts: { id: string; name: string; adjustments: { sizeId: string; adjustmentCents: number }[] }[];
  toppingGroups: { id: string; name: string; surchargeCents: number }[];
  ingredients: { id: string; name: string; groupId: string; surchargeCents: number | null }[];
  settings: { vatRateBps: number; pricesIncludeVat: boolean; packagingFeeCents: number };
}

export interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  createdAt?: string;
  orderCount?: number;
  totalSpentCents?: number;
}
export interface CustomerDetail extends Customer {
  orders?: OrderSummary[];
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  lastLoginAt?: string | null;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId?: string | null;
  userId?: string | null;
  userName?: string | null;
  user?: { name?: string; email?: string } | null;
  before?: unknown;
  after?: unknown;
}

export interface SalesRow {
  period?: string;
  date?: string;
  orders: number;
  revenueCents: number;
}
export interface ProductReportRow {
  productId?: string;
  name: string;
  quantity: number;
  revenueCents: number;
}

export interface RestaurantSettings {
  name: string;
  phone: string;
  whatsappPhone: string | null;
  orderLinePhone: string | null;
  email: string;
  address: string;
  mapUrl: string | null;
  vatRateBps: number;
  pricesIncludeVat: boolean;
  packagingFeeCents: number;
  deliveryEnabled: boolean;
  collectionEnabled: boolean;
  orderingPaused: boolean;
  pauseMessage: string;
  lastOrderMinutesBeforeClose: number;
  scheduledOrderingEnabled: boolean;
  defaultMaxExtraToppings: number;
  staffAlertPhones: string[];
  staffAlertEmails: string[];
}
export interface HoursDay {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  closed: boolean;
}
export interface Closure {
  id: string;
  date: string;
  label: string;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
}
export interface NotificationsPayload {
  channels: { channel: NotificationChannel; enabled: boolean; configured: boolean }[];
  settings: { channel: NotificationChannel; event: NotificationEvent; audience: NotificationAudience; enabled: boolean }[];
  templates: { channel: NotificationChannel; event: NotificationEvent; audience: NotificationAudience; subject: string | null; body: string }[];
}
