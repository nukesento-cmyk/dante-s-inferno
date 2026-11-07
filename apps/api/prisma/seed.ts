import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, type NotificationAudience, type NotificationChannel, type NotificationEvent } from '@prisma/client';
import * as argon2 from 'argon2';

for (const file of [resolve(process.cwd(), '.env'), resolve(__dirname, '../.env')]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

const kes = (n: number) => Math.round(n * 100);

const IMG = (file: string) => `/images/${file}`;

const GROUPS = [
  { name: 'Cheese', surcharge: 150 },
  { name: 'Vegetables', surcharge: 100 },
  { name: 'Meats', surcharge: 200 },
];

const INGREDIENTS: { slug: string; name: string; group: string; description: string; color: string }[] = [
  { slug: 'mozzarella', name: 'Mozzarella', group: 'Cheese', description: 'Melted mozzarella (add it again for extra cheese)', color: '#f6e7b4' },
  { slug: 'onion', name: 'Onion', group: 'Vegetables', description: 'Sliced red onion', color: '#b86bb3' },
  { slug: 'green-peppers', name: 'Green peppers', group: 'Vegetables', description: 'Crunchy green pepper strips', color: '#4f9d3a' },
  { slug: 'mushrooms', name: 'Mushrooms', group: 'Vegetables', description: 'Fresh sliced mushrooms', color: '#c9b39b' },
  { slug: 'olives', name: 'Olives', group: 'Vegetables', description: 'Black olives', color: '#2b2b2b' },
  { slug: 'pineapple', name: 'Pineapple', group: 'Vegetables', description: 'Juicy pineapple chunks', color: '#f4d03f' },
  { slug: 'sweetcorn', name: 'Sweetcorn', group: 'Vegetables', description: 'Sweet golden corn', color: '#f7c948' },
  { slug: 'tomato', name: 'Tomato', group: 'Vegetables', description: 'Fresh tomato slices', color: '#d93a2b' },
  { slug: 'pepperoni', name: 'Pepperoni', group: 'Meats', description: 'Spicy pepperoni slices', color: '#a72d1f' },
  { slug: 'beef', name: 'Beef', group: 'Meats', description: 'Seasoned minced beef', color: '#6b3a26' },
  { slug: 'chicken', name: 'Chicken', group: 'Meats', description: 'Grilled chicken pieces', color: '#e0b98a' },
  { slug: 'bacon', name: 'Bacon', group: 'Meats', description: 'Crispy bacon bits', color: '#c0605a' },
  { slug: 'sausage', name: 'Sausage', group: 'Meats', description: 'Sliced pork sausage', color: '#8b4a2b' },
];

const VEG = ['onion', 'green-peppers', 'mushrooms', 'olives', 'pineapple', 'sweetcorn', 'tomato'];
const MEAT = ['pepperoni', 'beef', 'chicken', 'bacon', 'sausage'];

interface ProductSeed {
  slug: string;
  name: string;
  description: string;
  category: string;
  image: string;
  featured?: boolean;
  prices: [number, number, number];
  defaults: string[];
  extras: string[];
}

const PRODUCTS: ProductSeed[] = [
  { slug: 'margherita', name: 'Margherita', category: 'Classics', image: 'narek-petrosyan--0nj85eRLPk-unsplash.jpg', featured: true, prices: [650, 950, 1250],
    description: 'Tomato sauce, mozzarella and fresh basil. Simple and perfect.', defaults: ['mozzarella', 'tomato'], extras: ['mozzarella', ...VEG, ...MEAT] },
  { slug: 'veggie-supreme', name: 'Veggie Supreme', category: 'Vegetarian', image: 'pranjall-kumar-sejqj6Eaqe8-unsplash.jpg', prices: [750, 1100, 1450],
    description: 'Green peppers, mushrooms, onion, olives and sweetcorn on mozzarella.', defaults: ['mozzarella', 'green-peppers', 'mushrooms', 'onion', 'olives', 'sweetcorn'], extras: ['mozzarella', ...VEG] },
  { slug: 'hawaiian', name: 'Hawaiian', category: 'Classics', image: 'heather-barnes-YKvGUO4Zb7Y-unsplash.jpg', prices: [800, 1150, 1550],
    description: 'Sweet pineapple and savoury sausage on a mozzarella base.', defaults: ['mozzarella', 'pineapple', 'sausage'], extras: ['mozzarella', ...VEG, ...MEAT] },
  { slug: 'pepperoni', name: 'Pepperoni', category: 'Classics', image: 'fernando-andrade-_P76trHTWDE-unsplash.jpg', featured: true, prices: [850, 1250, 1650],
    description: 'Loaded with spicy pepperoni and bubbling mozzarella.', defaults: ['mozzarella', 'pepperoni'], extras: ['mozzarella', ...VEG, ...MEAT] },
  { slug: 'bbq-chicken', name: 'BBQ Chicken', category: 'Signature', image: 'faizan-saeed-8thte7ceLSw-unsplash.jpg', featured: true, prices: [900, 1300, 1750],
    description: 'Grilled chicken, onion and sweetcorn with a smoky BBQ drizzle.', defaults: ['mozzarella', 'chicken', 'onion', 'sweetcorn'], extras: ['mozzarella', ...VEG, ...MEAT] },
  { slug: 'chicken-tikka', name: 'Chicken Tikka', category: 'Signature', image: 'caramel-51Zn3bUmCa8-unsplash.jpg', prices: [900, 1300, 1750],
    description: 'Spiced tikka chicken, green peppers and onion. A Nairobi favourite.', defaults: ['mozzarella', 'chicken', 'green-peppers', 'onion'], extras: ['mozzarella', ...VEG, ...MEAT] },
  { slug: 'meat-feast', name: 'Meat Feast', category: 'Signature', image: 'pranjall-kumar-oYkC51pOQBk-unsplash.jpg', prices: [950, 1400, 1900],
    description: 'Pepperoni, beef, bacon and sausage for serious appetites.', defaults: ['mozzarella', 'pepperoni', 'beef', 'bacon', 'sausage'], extras: ['mozzarella', ...VEG, ...MEAT] },
];

const SIZES = [
  { code: 'S', name: 'Small', inches: 8 },
  { code: 'M', name: 'Medium', inches: 12 },
  { code: 'L', name: 'Large', inches: 14 },
];

const CRUSTS: { name: string; description: string; adjust: Record<string, number | undefined> }[] = [
  { name: 'Classic', description: 'Our hand-stretched everyday crust.', adjust: { S: 0, M: 0, L: 0 } },
  { name: 'Thin', description: 'Light and crispy.', adjust: { S: 0, M: 0, L: 0 } },
  { name: 'Deep pan', description: 'Thick, soft and golden.', adjust: { S: 150, M: 150, L: 150 } },
  { name: 'Stuffed', description: 'Cheese baked into the crust edge. Medium and Large only.', adjust: { M: 250, L: 300 } },
];

const ZONES = [
  { name: 'Zone A', description: 'Up to 3 km', fee: 150, min: 600, free: 2500 as number | null, eta: [30, 40] },
  { name: 'Zone B', description: '3 to 7 km', fee: 250, min: 900, free: 3500 as number | null, eta: [40, 55] },
  { name: 'Zone C', description: '7 to 12 km', fee: 350, min: 1200, free: null, eta: [50, 70] },
];

const CATEGORIES = ['Classics', 'Signature', 'Vegetarian'];

const EVENTS: NotificationEvent[] = ['ORDER_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'ORDER_ACCEPTED', 'OUT_FOR_DELIVERY', 'READY_FOR_COLLECTION', 'ORDER_COMPLETED', 'ORDER_CANCELLED'];
const CHANNELS: NotificationChannel[] = ['SMS', 'EMAIL', 'WHATSAPP'];
const AUDIENCES: NotificationAudience[] = ['CUSTOMER', 'STAFF'];

const CUSTOMER_TEXT: Record<NotificationEvent, { subject: string; body: string }> = {
  ORDER_RECEIVED: { subject: 'We got your order {orderReference}', body: "Hi {customerName}, thanks for ordering from {restaurantName}! Order {orderReference} ({total}) is waiting for payment. Track it: {orderStatusUrl}" },
  PAYMENT_CONFIRMED: { subject: 'Payment received for {orderReference}', body: "Hi {customerName}, we have received your payment for order {orderReference} ({total}). Estimated time: {estimatedTime}. Track it: {orderStatusUrl}" },
  PAYMENT_FAILED: { subject: 'Payment problem on {orderReference}', body: "Hi {customerName}, your payment for order {orderReference} did not go through. You can try again here: {orderStatusUrl} or call {restaurantPhone}." },
  ORDER_ACCEPTED: { subject: 'Your order {orderReference} is confirmed', body: "Hi {customerName}, {restaurantName} has accepted order {orderReference}. We are getting started! Estimated time: {estimatedTime}." },
  OUT_FOR_DELIVERY: { subject: 'Your pizza is on the way', body: "Hi {customerName}, your order {orderReference} is out for delivery. Hot pizza arriving in about {estimatedTime}. Questions? Call {restaurantPhone}." },
  READY_FOR_COLLECTION: { subject: 'Your order {orderReference} is ready', body: "Hi {customerName}, your order {orderReference} is ready for collection at {restaurantName}. See you soon!" },
  ORDER_COMPLETED: { subject: 'Enjoy your pizza!', body: "Thanks {customerName}! Order {orderReference} is complete. We hope you enjoy your meal. Order again anytime: {orderStatusUrl}" },
  ORDER_CANCELLED: { subject: 'Order {orderReference} was cancelled', body: "Hi {customerName}, order {orderReference} has been cancelled. If you paid, please call {restaurantPhone} and we will sort it out." },
};

const STAFF_TEXT: Record<NotificationEvent, { subject: string; body: string }> = {
  ORDER_RECEIVED: { subject: 'New order {orderReference}', body: 'New order {orderReference} from {customerName}, {total}. Awaiting payment.' },
  PAYMENT_CONFIRMED: { subject: 'Paid: {orderReference}', body: 'PAID: order {orderReference} from {customerName}, {total}. Open the admin to accept it.' },
  PAYMENT_FAILED: { subject: 'Payment failed: {orderReference}', body: 'Payment FAILED for order {orderReference} ({customerName}, {total}).' },
  ORDER_ACCEPTED: { subject: 'Accepted: {orderReference}', body: 'Order {orderReference} accepted.' },
  OUT_FOR_DELIVERY: { subject: 'Out for delivery: {orderReference}', body: 'Order {orderReference} is out for delivery to {customerName}.' },
  READY_FOR_COLLECTION: { subject: 'Ready: {orderReference}', body: 'Order {orderReference} is ready for collection by {customerName}.' },
  ORDER_COMPLETED: { subject: 'Completed: {orderReference}', body: 'Order {orderReference} completed.' },
  ORDER_CANCELLED: { subject: 'Cancelled: {orderReference}', body: 'Order {orderReference} ({customerName}) was cancelled.' },
};

const ENABLED = new Set([
  'SMS:CUSTOMER:PAYMENT_CONFIRMED',
  'SMS:CUSTOMER:OUT_FOR_DELIVERY',
  'SMS:CUSTOMER:READY_FOR_COLLECTION',
  'EMAIL:CUSTOMER:PAYMENT_CONFIRMED',
  'SMS:STAFF:PAYMENT_CONFIRMED',
  'SMS:STAFF:PAYMENT_FAILED',
]);

export async function seed(prisma: PrismaClient) {
  const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? 'owner@dantespizza.co.ke').toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'change-me-now';
  const existingOwner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!existingOwner) {
    await prisma.user.create({ data: { kind: 'STAFF', role: 'OWNER', email: ownerEmail, name: 'Owner', passwordHash: await argon2.hash(ownerPassword) } });
  }

  await prisma.restaurantSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, phone: '+254700000000', email: 'orders@dantespizza.co.ke', address: 'Nairobi, Kenya', vatRateBps: 1600, pricesIncludeVat: true, packagingFeeCents: 0 },
  });

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    await prisma.openingHours.upsert({ where: { dayOfWeek }, update: {}, create: { dayOfWeek, openTime: '10:00', closeTime: '22:00', closed: false } });
  }

  const sizes: Record<string, string> = {};
  for (const [i, s] of SIZES.entries()) {
    sizes[s.code] = (await prisma.size.upsert({ where: { code: s.code }, update: {}, create: { ...s, sortOrder: i } })).id;
  }

  for (const [i, c] of CRUSTS.entries()) {
    const crust = await prisma.crustOption.upsert({ where: { name: c.name }, update: {}, create: { name: c.name, description: c.description, sortOrder: i } });
    for (const [code, cents] of Object.entries(c.adjust)) {
      if (cents === undefined) continue;
      const sizeId = sizes[code]!;
      await prisma.crustSizePrice.upsert({
        where: { crustId_sizeId: { crustId: crust.id, sizeId } },
        update: {},
        create: { crustId: crust.id, sizeId, adjustmentCents: kes(cents) },
      });
    }
  }

  const groups: Record<string, string> = {};
  for (const [i, g] of GROUPS.entries()) {
    groups[g.name] = (await prisma.toppingGroup.upsert({ where: { name: g.name }, update: {}, create: { name: g.name, surchargeCents: kes(g.surcharge), sortOrder: i } })).id;
  }

  const ingredients: Record<string, string> = {};
  for (const [i, ing] of INGREDIENTS.entries()) {
    ingredients[ing.slug] = (
      await prisma.ingredient.upsert({
        where: { slug: ing.slug },
        update: {},
        create: { slug: ing.slug, name: ing.name, description: ing.description, groupId: groups[ing.group]!, modelKey: ing.slug, color: ing.color, sortOrder: i },
      })
    ).id;
  }

  const categories: Record<string, string> = {};
  for (const [i, name] of CATEGORIES.entries()) {
    const slug = name.toLowerCase();
    categories[name] = (await prisma.category.upsert({ where: { slug }, update: {}, create: { name, slug, sortOrder: i } })).id;
  }

  for (const [i, p] of PRODUCTS.entries()) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: { slug: p.slug, name: p.name, description: p.description, categoryId: categories[p.category]!, imageUrl: IMG(p.image), featured: p.featured ?? false, sortOrder: i },
    });
    for (const [idx, size] of SIZES.entries()) {
      const sizeId = sizes[size.code]!;
      await prisma.productPrice.upsert({
        where: { productId_sizeId: { productId: product.id, sizeId } },
        update: {},
        create: { productId: product.id, sizeId, priceCents: kes(p.prices[idx]!) },
      });
    }
    for (const slug of new Set([...p.defaults, ...p.extras])) {
      const ingredientId = ingredients[slug]!;
      await prisma.productIngredient.upsert({
        where: { productId_ingredientId: { productId: product.id, ingredientId } },
        update: {},
        create: { productId: product.id, ingredientId, isDefault: p.defaults.includes(slug), allowExtra: p.extras.includes(slug) },
      });
    }
  }

  for (const [i, z] of ZONES.entries()) {
    const existing = await prisma.deliveryZone.findFirst({ where: { name: z.name } });
    if (existing) continue;
    await prisma.deliveryZone.create({
      data: { name: z.name, description: z.description, feeCents: kes(z.fee), minOrderCents: kes(z.min), freeDeliveryFromCents: z.free === null ? null : kes(z.free), etaMinMinutes: z.eta[0]!, etaMaxMinutes: z.eta[1]!, sortOrder: i },
    });
  }

  for (const channel of CHANNELS) {
    await prisma.notificationChannelConfig.upsert({ where: { channel }, update: {}, create: { channel, enabled: channel !== 'WHATSAPP' } });
    for (const event of EVENTS) {
      for (const audience of AUDIENCES) {
        const key = { channel_event_audience: { channel, event, audience } };
        const text = (audience === 'CUSTOMER' ? CUSTOMER_TEXT : STAFF_TEXT)[event];
        await prisma.notificationSetting.upsert({ where: key, update: {}, create: { channel, event, audience, enabled: ENABLED.has(`${channel}:${audience}:${event}`) } });
        await prisma.notificationTemplate.upsert({
          where: key,
          update: {},
          create: { channel, event, audience, subject: channel === 'EMAIL' ? text.subject : null, body: text.body },
        });
      }
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
    console.log('Seed complete');
  } finally {
    await prisma.$disconnect();
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
