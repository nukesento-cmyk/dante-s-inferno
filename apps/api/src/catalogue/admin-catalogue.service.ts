import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type categorySchema,
  type crustSchema,
  type deliveryZoneSchema,
  type ingredientSchema,
  type productSchema,
  type sizeSchema,
  type toppingGroupSchema,
} from '@dantes/shared';
import type { z } from 'zod';
import { type Actor, AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';

const productAdminInclude = { prices: true, ingredients: true } as const;
type ProductWithLinks = Prisma.ProductGetPayload<{ include: typeof productAdminInclude }>;

export function toProductAdmin(p: ProductWithLinks) {
  const { prices, ingredients, ...rest } = p;
  return {
    ...rest,
    prices: prices.map(({ sizeId, priceCents }) => ({ sizeId, priceCents })),
    defaultIngredientIds: ingredients.filter((l) => l.isDefault).map((l) => l.ingredientId),
    extraIngredientIds: ingredients.filter((l) => l.allowExtra).map((l) => l.ingredientId),
  };
}

type Input<T extends z.ZodTypeAny> = z.infer<T>;

@Injectable()
export class AdminCatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async record<T extends { id: string }>(actor: Actor, action: string, entity: string, before: unknown, run: () => Promise<T>): Promise<T> {
    const after = await run();
    await this.audit.log(actor, { action, entity, entityId: after.id, before, after });
    return after;
  }

  private async remove(actor: Actor, entity: string, id: string, before: { id: string } | null, run: () => Promise<unknown>) {
    if (!before) throw new NotFoundException(`${entity} not found`);
    await run();
    await this.audit.log(actor, { action: `${entity}.delete`, entity, entityId: id, before });
    return { ok: true };
  }

  // ----- products -----
  async listProducts(includeArchived: boolean) {
    const rows = await this.prisma.product.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: productAdminInclude,
    });
    return rows.map(toProductAdmin);
  }

  async getProduct(id: string) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: productAdminInclude });
    if (!p) throw new NotFoundException('Product not found');
    return toProductAdmin(p);
  }

  private productData(input: Input<typeof productSchema>) {
    const { prices, defaultIngredientIds, extraIngredientIds, categoryId, ...scalar } = input;
    const ids = [...new Set([...defaultIngredientIds, ...extraIngredientIds])];
    return {
      scalar: { ...scalar, category: { connect: { id: categoryId } } },
      prices,
      links: ids.map((ingredientId) => ({
        ingredientId,
        isDefault: defaultIngredientIds.includes(ingredientId),
        allowExtra: extraIngredientIds.includes(ingredientId),
      })),
    };
  }

  createProduct(actor: Actor, input: Input<typeof productSchema>) {
    const { scalar, prices, links } = this.productData(input);
    return this.record(actor, 'product.create', 'Product', null, async () => {
      const created = await this.prisma.product.create({
        data: { ...scalar, prices: { create: prices }, ingredients: { create: links } },
        include: productAdminInclude,
      });
      return toProductAdmin(created);
    });
  }

  async updateProduct(actor: Actor, id: string, input: Input<typeof productSchema>) {
    const before = await this.getProduct(id);
    const { scalar, prices, links } = this.productData(input);
    return this.record(actor, 'product.update', 'Product', before, () =>
      this.prisma.$transaction(async (tx) => {
        await tx.productPrice.deleteMany({ where: { productId: id } });
        await tx.productIngredient.deleteMany({ where: { productId: id } });
        const updated = await tx.product.update({
          where: { id },
          data: { ...scalar, prices: { create: prices }, ingredients: { create: links } },
          include: productAdminInclude,
        });
        return toProductAdmin(updated);
      }),
    );
  }

  async archiveProduct(actor: Actor, id: string) {
    const before = await this.getProduct(id);
    return this.record(actor, 'product.archive', 'Product', before, async () =>
      toProductAdmin(await this.prisma.product.update({ where: { id }, data: { archived: true, available: false }, include: productAdminInclude })),
    );
  }

  async setAvailability(actor: Actor, id: string, available: boolean) {
    const before = await this.getProduct(id);
    return this.record(actor, 'product.availability', 'Product', before, async () =>
      toProductAdmin(await this.prisma.product.update({ where: { id }, data: { available }, include: productAdminInclude })),
    );
  }

  async reorder(actor: Actor, entity: 'Product' | 'Category' | 'DeliveryZone', ids: string[]) {
    const model = { Product: this.prisma.product, Category: this.prisma.category, DeliveryZone: this.prisma.deliveryZone }[entity] as unknown as {
      update: (a: { where: { id: string }; data: { sortOrder: number } }) => Prisma.PrismaPromise<unknown>;
    };
    await this.prisma.$transaction(ids.map((id, sortOrder) => model.update({ where: { id }, data: { sortOrder } })));
    await this.audit.log(actor, { action: `${entity.toLowerCase()}.reorder`, entity, after: ids });
    return { ok: true };
  }

  // ----- categories -----
  listCategories() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }
  createCategory(actor: Actor, data: Input<typeof categorySchema>) {
    return this.record(actor, 'category.create', 'Category', null, () => this.prisma.category.create({ data }));
  }
  async updateCategory(actor: Actor, id: string, data: Input<typeof categorySchema>) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Category not found');
    return this.record(actor, 'category.update', 'Category', before, () => this.prisma.category.update({ where: { id }, data }));
  }
  async deleteCategory(actor: Actor, id: string) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (before && (await this.prisma.product.count({ where: { categoryId: id } })) > 0) {
      throw new ConflictException('This category still has products. Move or archive them first.');
    }
    return this.remove(actor, 'Category', id, before, () => this.prisma.category.delete({ where: { id } }));
  }

  // ----- topping groups & ingredients -----
  listGroups() {
    return this.prisma.toppingGroup.findMany({ orderBy: { sortOrder: 'asc' } });
  }
  createGroup(actor: Actor, data: Input<typeof toppingGroupSchema>) {
    return this.record(actor, 'toppingGroup.create', 'ToppingGroup', null, () => this.prisma.toppingGroup.create({ data }));
  }
  async updateGroup(actor: Actor, id: string, data: Input<typeof toppingGroupSchema>) {
    const before = await this.prisma.toppingGroup.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Topping group not found');
    return this.record(actor, 'toppingGroup.update', 'ToppingGroup', before, () => this.prisma.toppingGroup.update({ where: { id }, data }));
  }
  async deleteGroup(actor: Actor, id: string) {
    const before = await this.prisma.toppingGroup.findUnique({ where: { id } });
    if (before && (await this.prisma.ingredient.count({ where: { groupId: id } })) > 0) {
      throw new ConflictException('This group still has ingredients.');
    }
    return this.remove(actor, 'ToppingGroup', id, before, () => this.prisma.toppingGroup.delete({ where: { id } }));
  }

  listIngredients() {
    return this.prisma.ingredient.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { group: true } });
  }
  createIngredient(actor: Actor, data: Input<typeof ingredientSchema>) {
    return this.record(actor, 'ingredient.create', 'Ingredient', null, () => this.prisma.ingredient.create({ data }));
  }
  async updateIngredient(actor: Actor, id: string, data: Input<typeof ingredientSchema>) {
    const before = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Ingredient not found');
    return this.record(actor, 'ingredient.update', 'Ingredient', before, () => this.prisma.ingredient.update({ where: { id }, data }));
  }
  async deleteIngredient(actor: Actor, id: string) {
    const before = await this.prisma.ingredient.findUnique({ where: { id } });
    return this.remove(actor, 'Ingredient', id, before, () => this.prisma.ingredient.delete({ where: { id } }));
  }

  // ----- sizes & crusts -----
  listSizes() {
    return this.prisma.size.findMany({ orderBy: { sortOrder: 'asc' } });
  }
  createSize(actor: Actor, data: Input<typeof sizeSchema>) {
    return this.record(actor, 'size.create', 'Size', null, () => this.prisma.size.create({ data }));
  }
  async updateSize(actor: Actor, id: string, data: Input<typeof sizeSchema>) {
    const before = await this.prisma.size.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Size not found');
    return this.record(actor, 'size.update', 'Size', before, () => this.prisma.size.update({ where: { id }, data }));
  }
  async deleteSize(actor: Actor, id: string) {
    const before = await this.prisma.size.findUnique({ where: { id } });
    return this.remove(actor, 'Size', id, before, () => this.prisma.size.delete({ where: { id } }));
  }

  listCrusts() {
    return this.prisma.crustOption.findMany({ orderBy: { sortOrder: 'asc' }, include: { adjustments: true } });
  }
  createCrust(actor: Actor, input: Input<typeof crustSchema>) {
    const { adjustments, ...rest } = input;
    return this.record(actor, 'crust.create', 'CrustOption', null, () =>
      this.prisma.crustOption.create({ data: { ...rest, adjustments: { create: adjustments } }, include: { adjustments: true } }),
    );
  }
  async updateCrust(actor: Actor, id: string, input: Input<typeof crustSchema>) {
    const before = await this.prisma.crustOption.findUnique({ where: { id }, include: { adjustments: true } });
    if (!before) throw new NotFoundException('Crust not found');
    const { adjustments, ...rest } = input;
    return this.record(actor, 'crust.update', 'CrustOption', before, () =>
      this.prisma.$transaction(async (tx) => {
        await tx.crustSizePrice.deleteMany({ where: { crustId: id } });
        return tx.crustOption.update({ where: { id }, data: { ...rest, adjustments: { create: adjustments } }, include: { adjustments: true } });
      }),
    );
  }
  async deleteCrust(actor: Actor, id: string) {
    const before = await this.prisma.crustOption.findUnique({ where: { id } });
    return this.remove(actor, 'CrustOption', id, before, () => this.prisma.crustOption.delete({ where: { id } }));
  }

  // ----- delivery zones -----
  listZones() {
    return this.prisma.deliveryZone.findMany({ orderBy: { sortOrder: 'asc' } });
  }
  createZone(actor: Actor, data: Input<typeof deliveryZoneSchema>) {
    return this.record(actor, 'deliveryZone.create', 'DeliveryZone', null, () => this.prisma.deliveryZone.create({ data }));
  }
  async updateZone(actor: Actor, id: string, data: Input<typeof deliveryZoneSchema>) {
    const before = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Delivery zone not found');
    return this.record(actor, 'deliveryZone.update', 'DeliveryZone', before, () => this.prisma.deliveryZone.update({ where: { id }, data }));
  }
  async deleteZone(actor: Actor, id: string) {
    const before = await this.prisma.deliveryZone.findUnique({ where: { id } });
    return this.remove(actor, 'DeliveryZone', id, before, () => this.prisma.deliveryZone.delete({ where: { id } }));
  }
}
