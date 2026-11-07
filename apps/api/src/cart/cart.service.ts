import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Cart, CartItem } from '@prisma/client';
import type { CartItemInput } from '@dantes/shared';
import { randomBytes } from 'node:crypto';
import { toIngredientPublic } from '../catalogue/catalogue.mapper';
import { PrismaService } from '../core/prisma.service';
import { type LineInput, LinePricingService, type ResolvedLine } from './line-pricing.service';

const MAX_CART_ITEMS = 30;
type CartWithItems = Cart & { items: CartItem[] };

const toLine = (i: CartItem): LineInput => ({
  productId: i.productId,
  sizeId: i.sizeId,
  crustId: i.crustId,
  quantity: i.quantity,
  addIngredientIds: i.addIngredientIds,
  removeIngredientIds: i.removeIngredientIds,
  notes: i.notes,
});

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: LinePricingService,
  ) {}

  async create(userId?: string) {
    if (userId) {
      const existing = await this.prisma.cart.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' }, include: { items: true } });
      if (existing) return this.view(existing);
    }
    const cart = await this.prisma.cart.create({
      data: { token: randomBytes(24).toString('base64url'), userId },
      include: { items: true },
    });
    return this.view(cart);
  }

  async find(token: string | undefined, userId?: string): Promise<CartWithItems> {
    let cart: CartWithItems | null = null;
    if (token) cart = await this.prisma.cart.findUnique({ where: { token }, include: { items: { orderBy: { createdAt: 'asc' } } } });
    else if (userId) cart = await this.prisma.cart.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' }, include: { items: { orderBy: { createdAt: 'asc' } } } });
    else throw new BadRequestException('X-Cart-Token header is required');
    if (!cart) throw new NotFoundException({ message: 'Cart not found', code: 'CART_NOT_FOUND' });
    return cart;
  }

  async resolveCart(cart: CartWithItems) {
    const lines = await this.pricing.resolveMany(cart.items.map(toLine));
    return cart.items.map((item, i) => ({ item, line: lines[i]! }));
  }

  async view(cart: CartWithItems) {
    const resolved = await this.resolveCart(cart);
    const items = resolved.map(({ item, line }) => this.itemShape(item, line));
    return { token: cart.token, items, subtotalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0) };
  }

  private itemShape(item: CartItem, line: ResolvedLine) {
    return {
      id: item.id,
      productId: item.productId,
      productName: line.productName ?? '',
      productSlug: line.productSlug ?? '',
      imageUrl: line.imageUrl ?? null,
      sizeId: item.sizeId,
      sizeName: line.sizeName ?? '',
      crustId: item.crustId,
      crustName: line.crustName ?? '',
      quantity: item.quantity,
      added: line.ok ? line.added.map(toIngredientPublic) : [],
      removed: line.ok ? line.removed.map(toIngredientPublic) : [],
      unitPriceCents: line.ok ? line.unitPriceCents : 0,
      lineTotalCents: line.ok ? line.lineTotalCents : 0,
      notes: item.notes,
      unavailable: !line.ok,
      ...(line.ok ? {} : { unavailableReason: line.reason }),
    };
  }

  private async validated(input: LineInput) {
    const line = await this.pricing.resolveOne(input);
    if (!line.ok) throw new BadRequestException({ message: line.reason, code: 'INVALID_CART_ITEM' });
  }

  async addItem(token: string | undefined, userId: string | undefined, input: CartItemInput) {
    const cart = await this.find(token, userId);
    if (cart.items.length >= MAX_CART_ITEMS) throw new BadRequestException('Your cart is full');
    await this.validated(input);
    await this.prisma.cartItem.create({ data: { cartId: cart.id, ...input, notes: input.notes ?? null } });
    return this.view(await this.find(cart.token));
  }

  async updateItem(token: string | undefined, userId: string | undefined, itemId: string, patch: Partial<CartItemInput>) {
    const cart = await this.find(token, userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found');
    const merged = { ...toLine(item), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as LineInput;
    await this.validated(merged);
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        sizeId: merged.sizeId,
        crustId: merged.crustId,
        quantity: merged.quantity,
        addIngredientIds: merged.addIngredientIds,
        removeIngredientIds: merged.removeIngredientIds,
        notes: merged.notes ?? null,
      },
    });
    return this.view(await this.find(cart.token));
  }

  async removeItem(token: string | undefined, userId: string | undefined, itemId: string) {
    const cart = await this.find(token, userId);
    if (!cart.items.some((i) => i.id === itemId)) throw new NotFoundException('Cart item not found');
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.view(await this.find(cart.token));
  }
}
