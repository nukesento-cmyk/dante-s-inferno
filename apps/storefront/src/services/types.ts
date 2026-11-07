import type { OpeningHoursDay, OrderingState, SpecialClosureRule, FulfilmentType, PaymentMethod, OrderStatus, PaymentStatus } from '@dantes/shared';

export interface Ingredient {
  id: string;
  slug: string;
  name: string;
  description: string;
  groupId: string;
  surchargeCents: number;
  modelKey: string;
  color: string;
}

export interface ProductPublic {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  featured: boolean;
  categoryId: string;
  maxExtraToppings: number | null;
  prices: { sizeId: string; priceCents: number }[];
  defaultIngredients: Ingredient[];
  extraIngredients: Ingredient[];
}

export interface MenuSize { id: string; code: string; name: string; inches: number }
export interface MenuCrust {
  id: string;
  name: string;
  description: string;
  adjustments: { sizeId: string; adjustmentCents: number }[];
}
export interface MenuData {
  categories: { id: string; name: string; slug: string }[];
  sizes: MenuSize[];
  crusts: MenuCrust[];
  toppingGroups: { id: string; name: string; surchargeCents: number }[];
  products: ProductPublic[];
}

export interface Settings {
  name: string;
  phone: string;
  whatsappPhone: string | null;
  orderLinePhone: string | null;
  email: string;
  address: string;
  mapUrl: string | null;
  deliveryEnabled: boolean;
  collectionEnabled: boolean;
  pricesIncludeVat: boolean;
  vatRateBps: number;
  packagingFeeCents: number;
  defaultMaxExtraToppings: number;
  hours: OpeningHoursDay[];
  closures: SpecialClosureRule[];
  ordering: OrderingState;
  pauseMessage: string;
  /** Contract mismatch note: documented as "when /public/settings contains paymentsMode". */
  paymentsMode?: 'mock' | 'live' | string;
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
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  sizeId: string;
  sizeName: string;
  crustId: string;
  crustName: string;
  quantity: number;
  added: Ingredient[];
  removed: Ingredient[];
  unitPriceCents: number;
  lineTotalCents: number;
  notes: string | null;
  unavailable: boolean;
}
export interface Cart {
  token?: string;
  items: CartItem[];
  subtotalCents: number;
}

export interface OrderItem {
  productName: string;
  sizeName: string;
  crustName: string;
  toppings?: string[] | string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}
export interface OrderPublic {
  reference: string;
  status: OrderStatus;
  fulfilment: FulfilmentType;
  zoneName: string | null;
  address: { line1?: string; landmark?: string; notes?: string } | string | null;
  items: OrderItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  packagingFeeCents: number;
  vatCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  createdAt: string;
  history: { toStatus: OrderStatus; createdAt: string }[];
  /** Not in the contract; used if the API adds it. */
  paymentId?: string;
}

export interface PaymentInfo {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  redirectUrl?: string;
  instructions?: string;
}
export interface CheckoutResult {
  order: OrderPublic;
  payment: PaymentInfo;
}
export interface PaymentStatusResult {
  status: PaymentStatus;
  orderStatus: OrderStatus;
  paymentId?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}
