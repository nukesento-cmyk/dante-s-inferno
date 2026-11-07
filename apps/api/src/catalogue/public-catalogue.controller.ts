import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { SettingsService } from '../core/settings.service';
import { productInclude, toProductPublic } from './catalogue.mapper';

const visible = { available: true, archived: false, category: { active: true } } as const;

@Controller('public')
export class PublicCatalogueController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Get('menu')
  async menu() {
    const [categories, sizes, crusts, toppingGroups, products, settings] = await Promise.all([
      this.prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.size.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.crustOption.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, include: { adjustments: true } }),
      this.prisma.toppingGroup.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.product.findMany({ where: visible, orderBy: { sortOrder: 'asc' }, include: productInclude }),
      this.settings.get(),
    ]);
    return {
      categories: categories.map(({ id, name, slug }) => ({ id, name, slug })),
      sizes: sizes.map(({ id, code, name, inches }) => ({ id, code, name, inches })),
      crusts: crusts.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        adjustments: c.adjustments.map(({ sizeId, adjustmentCents }) => ({ sizeId, adjustmentCents })),
      })),
      toppingGroups: toppingGroups.map(({ id, name, surchargeCents }) => ({ id, name, surchargeCents })),
      products: products.map((p) => ({ ...toProductPublic(p), maxExtraToppings: p.maxExtraToppings ?? settings.defaultMaxExtraToppings })),
    };
  }

  @Get('products/:slug')
  async product(@Param('slug') slug: string) {
    const [p, settings] = await Promise.all([
      this.prisma.product.findFirst({ where: { slug, ...visible }, include: productInclude }),
      this.settings.get(),
    ]);
    if (!p) throw new NotFoundException('Product not found');
    return { ...toProductPublic(p), maxExtraToppings: p.maxExtraToppings ?? settings.defaultMaxExtraToppings };
  }
}
